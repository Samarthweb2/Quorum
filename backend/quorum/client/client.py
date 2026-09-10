"""
Quorum Client SDK.

Features:
- Transparent leader auto-discovery and redirect tracking
- Redirect loop protection with retry cap and jittered exponential backoff
- DistributedLock async context manager with background renewal
- Monotonically increasing 64-bit fencing tokens
- Streaming leadership updates
"""

from __future__ import annotations

import asyncio
import logging
import random
import time
import uuid
from dataclasses import dataclass
from typing import AsyncIterator, Dict, List, Optional
import grpc

from quorum.proto import quorum_pb2, quorum_pb2_grpc

logger = logging.getLogger("quorum.client")


class QuorumError(Exception):
    """Base exception for Quorum client errors."""
    pass


class LockBusyError(QuorumError):
    """Raised when a lock is currently held by another client."""
    pass


class LockNotLeaderError(QuorumError):
    """Raised when request could not reach a valid cluster leader."""
    pass


@dataclass
class LockHandle:
    """Represents an acquired distributed lock."""
    key: str
    client_id: str
    fence_token: int
    expires_at_ms: int

    @property
    def is_expired(self) -> bool:
        return int(time.time() * 1000) >= self.expires_at_ms


@dataclass
class LeaderInfo:
    leader_id: str
    term: int
    leader_address: str
    is_leader: bool


class DistributedLock:
    """
    Async context manager for holding a distributed lock with automatic renewal.
    """

    def __init__(
        self,
        client: "QuorumClient",
        key: str,
        ttl_s: float = 10.0,
        auto_renew: bool = True,
        renew_interval_s: Optional[float] = None,
        acquire_timeout_s: Optional[float] = None,
    ) -> None:
        self.client = client
        self.key = key
        self.ttl_s = ttl_s
        self.auto_renew = auto_renew
        self.renew_interval_s = renew_interval_s or (ttl_s / 3.0)
        self.acquire_timeout_s = acquire_timeout_s

        self.handle: Optional[LockHandle] = None
        self._renew_task: Optional[asyncio.Task] = None
        self._running = False

    async def __aenter__(self) -> LockHandle:
        start_time = time.time()
        while True:
            try:
                self.handle = await self.client.acquire_lock(self.key, ttl_s=self.ttl_s)
                break
            except LockBusyError:
                if self.acquire_timeout_s is not None:
                    if time.time() - start_time >= self.acquire_timeout_s:
                        raise TimeoutError(f"Timed out acquiring lock '{self.key}' after {self.acquire_timeout_s}s")
                else:
                    raise
                await asyncio.sleep(0.05 + random.uniform(0.01, 0.05))

        if self.auto_renew:
            self._running = True
            self._renew_task = asyncio.create_task(self._auto_renew_loop())

        return self.handle

    async def _auto_renew_loop(self) -> None:
        while self._running:
            try:
                await asyncio.sleep(self.renew_interval_s)
                if not self._running or not self.handle:
                    break
                success = await self.client.renew_lock(self.handle, ttl_s=self.ttl_s)
                if not success:
                    logger.warning(f"Failed to auto-renew lock for key '{self.key}' (token={self.handle.fence_token})")
                    break
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error during lock auto-renewal for '{self.key}': {e}")

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        self._running = False
        if self._renew_task and not self._renew_task.done():
            self._renew_task.cancel()
            try:
                await self._renew_task
            except asyncio.CancelledError:
                pass

        if self.handle:
            try:
                await self.client.release_lock(self.handle)
            except Exception as e:
                logger.warning(f"Error releasing lock for '{self.key}': {e}")
            finally:
                self.handle = None


class QuorumClient:
    """
    Client for interacting with a Quorum cluster.
    """

    def __init__(
        self,
        servers: List[str],  # ["host1:port1", "host2:port2"]
        client_id: Optional[str] = None,
        max_redirects: int = 10,
        base_backoff_s: float = 0.05,
        max_backoff_s: float = 0.5,
    ) -> None:
        self.servers = list(servers)
        if not self.servers:
            raise ValueError("At least one server address must be provided")
        self.client_id = client_id or f"client-{uuid.uuid4().hex[:8]}"
        self.max_redirects = max_redirects
        self.base_backoff_s = base_backoff_s
        self.max_backoff_s = max_backoff_s

        self._current_leader_address: Optional[str] = self.servers[0]
        self._channels: Dict[str, grpc.aio.Channel] = {}
        self._stubs: Dict[str, quorum_pb2_grpc.QuorumServiceStub] = {}
        self._server_index = 0

    def _get_stub(self, address: str) -> quorum_pb2_grpc.QuorumServiceStub:
        if address not in self._stubs:
            channel = grpc.aio.insecure_channel(address)
            self._channels[address] = channel
            self._stubs[address] = quorum_pb2_grpc.QuorumServiceStub(channel)
        return self._stubs[address]

    def _get_next_fallback_address(self) -> str:
        addr = self.servers[self._server_index % len(self.servers)]
        self._server_index += 1
        return addr

    async def _execute_with_redirect(self, func) -> Any:
        """
        Executes an RPC function with leader redirect following, retry cap,
        and jittered exponential backoff to avoid redirect loops.
        """
        target_addr = self._current_leader_address or self._get_next_fallback_address()
        visited_nodes: Set[str] = set()

        for attempt in range(self.max_redirects):
            try:
                stub = self._get_stub(target_addr)
                resp = await func(stub)

                # Check if non-leader response
                if getattr(resp, "status", None) == quorum_pb2.LOCK_NOT_LEADER:
                    leader_hint = getattr(resp, "leader_address", None)
                    if leader_hint and leader_hint not in visited_nodes:
                        visited_nodes.add(target_addr)
                        target_addr = leader_hint
                        self._current_leader_address = leader_hint
                        if leader_hint not in self.servers:
                            self.servers.append(leader_hint)
                        continue
                    else:
                        # Stale or missing leader hint -> cycle to next known server
                        target_addr = self._get_next_fallback_address()
                        backoff = min(self.max_backoff_s, self.base_backoff_s * (2 ** attempt))
                        jitter = random.uniform(0.01, 0.05)
                        await asyncio.sleep(backoff + jitter)
                        continue

                # Successful leader response
                self._current_leader_address = target_addr
                return resp

            except (grpc.RpcError, Exception) as e:
                logger.debug(f"RPC to {target_addr} failed: {e}. Trying next server.")
                target_addr = self._get_next_fallback_address()
                backoff = min(self.max_backoff_s, self.base_backoff_s * (2 ** attempt))
                jitter = random.uniform(0.01, 0.05)
                await asyncio.sleep(backoff + jitter)

        raise LockNotLeaderError(f"Could not reach an active cluster leader after {self.max_redirects} attempts")

    async def acquire_lock(self, key: str, ttl_s: float = 10.0) -> LockHandle:
        """
        Acquires a distributed lock on key.
        Returns LockHandle with strictly monotonic fencing token.
        Raises LockBusyError if currently locked by another client.
        """
        ttl_ms = int(ttl_s * 1000)
        req = quorum_pb2.AcquireLockRequest(
            key=key,
            client_id=self.client_id,
            ttl_ms=ttl_ms,
        )

        resp: quorum_pb2.AcquireLockResponse = await self._execute_with_redirect(
            lambda stub: stub.AcquireLock(req, timeout=3.0)
        )

        if resp.status == quorum_pb2.LOCK_ACQUIRED:
            return LockHandle(
                key=key,
                client_id=self.client_id,
                fence_token=resp.fence_token,
                expires_at_ms=resp.expires_at_ms,
            )
        elif resp.status == quorum_pb2.LOCK_BUSY:
            raise LockBusyError(resp.message or f"Lock '{key}' is busy")
        else:
            raise QuorumError(resp.message or f"Failed to acquire lock (status {resp.status})")

    async def renew_lock(self, lock: LockHandle, ttl_s: float = 10.0) -> bool:
        """
        Renews an existing lock lease.
        """
        ttl_ms = int(ttl_s * 1000)
        req = quorum_pb2.RenewLockRequest(
            key=lock.key,
            client_id=lock.client_id,
            fence_token=lock.fence_token,
            ttl_ms=ttl_ms,
        )

        resp: quorum_pb2.RenewLockResponse = await self._execute_with_redirect(
            lambda stub: stub.RenewLock(req, timeout=3.0)
        )

        if resp.status == quorum_pb2.LOCK_ACQUIRED:
            lock.expires_at_ms = resp.expires_at_ms
            return True
        return False

    async def release_lock(self, lock: LockHandle) -> bool:
        """
        Explicitly releases an acquired lock.
        """
        req = quorum_pb2.ReleaseLockRequest(
            key=lock.key,
            client_id=lock.client_id,
            fence_token=lock.fence_token,
        )

        resp: quorum_pb2.ReleaseLockResponse = await self._execute_with_redirect(
            lambda stub: stub.ReleaseLock(req, timeout=3.0)
        )

        return resp.status == quorum_pb2.LOCK_ACQUIRED

    async def get_lock(self, key: str) -> Optional[dict]:
        """
        Inspects lock state for a given key.
        """
        req = quorum_pb2.GetLockRequest(key=key)
        resp: quorum_pb2.GetLockResponse = await self._execute_with_redirect(
            lambda stub: stub.GetLock(req, timeout=3.0)
        )

        if resp.is_locked:
            return {
                "key": key,
                "is_locked": True,
                "owner": resp.owner,
                "fence_token": resp.fence_token,
                "remaining_ttl_ms": resp.remaining_ttl_ms,
            }
        return None

    def lock(
        self,
        key: str,
        ttl_s: float = 10.0,
        auto_renew: bool = True,
        renew_interval_s: Optional[float] = None,
        acquire_timeout_s: Optional[float] = None,
    ) -> DistributedLock:
        """
        Returns a context manager for holding a distributed lock with automatic renewal.
        """
        return DistributedLock(
            client=self,
            key=key,
            ttl_s=ttl_s,
            auto_renew=auto_renew,
            renew_interval_s=renew_interval_s,
            acquire_timeout_s=acquire_timeout_s,
        )

    async def watch_leader(self, address: Optional[str] = None) -> AsyncIterator[LeaderInfo]:
        """
        Streams real-time leadership events from the cluster.
        """
        target = address or self.servers[0]
        stub = self._get_stub(target)
        req = quorum_pb2.WatchLeaderRequest(client_id=self.client_id)

        stream = stub.WatchLeader(req)
        async for notif in stream:
            yield LeaderInfo(
                leader_id=notif.leader_id,
                term=notif.term,
                leader_address=notif.leader_address,
                is_leader=notif.is_leader,
            )

    async def close(self) -> None:
        for channel in self._channels.values():
            await channel.close()
        self._channels.clear()
        self._stubs.clear()

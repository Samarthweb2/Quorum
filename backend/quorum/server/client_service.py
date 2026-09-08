"""
gRPC Servicer implementing QuorumService (AcquireLock, RenewLock, ReleaseLock, GetLock, WatchLeader).
Handles leader redirection hints, streaming leadership updates, and client coordination.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Dict, Optional, Set
import grpc

from quorum.proto import quorum_pb2, quorum_pb2_grpc
from quorum.raft.node import RaftNode
from quorum.raft.types import Role
from quorum.state_machine.lock_manager import LockStateMachine

logger = logging.getLogger(__name__)


class QuorumGrpcServicer(quorum_pb2_grpc.QuorumServiceServicer):
    """
    Client-facing gRPC service handler.
    """

    def __init__(
        self,
        node: RaftNode,
        state_machine: LockStateMachine,
        peer_client_addresses: Dict[str, str],
        self_client_address: str,
    ) -> None:
        self.node = node
        self.state_machine = state_machine
        self.peer_client_addresses = peer_client_addresses
        self.self_client_address = self_client_address
        self._watchers: Set[asyncio.Queue[quorum_pb2.LeaderNotification]] = set()

        # Wire node's apply callback to our state machine
        self.node.on_apply_entry = self.state_machine.apply

        # Hook leadership changes
        self._prev_on_leadership_change = self.node.on_leadership_change
        self.node.on_leadership_change = self._handle_leadership_change

    def _get_leader_address(self) -> str:
        if self.node.role == Role.LEADER:
            return self.self_client_address
        if self.node.leader_id:
            return self.peer_client_addresses.get(self.node.leader_id, "")
        return ""

    def _handle_leadership_change(self, role: Role, leader_id: Optional[str], term: int) -> None:
        if self._prev_on_leadership_change:
            self._prev_on_leadership_change(role, leader_id, term)

        leader_addr = self._get_leader_address()
        notif = quorum_pb2.LeaderNotification(
            leader_id=leader_id or "",
            term=term,
            leader_address=leader_addr,
            is_leader=(role == Role.LEADER),
        )
        for q in list(self._watchers):
            try:
                q.put_nowait(notif)
            except Exception:
                pass

    async def AcquireLock(
        self, request: quorum_pb2.AcquireLockRequest, context: grpc.aio.ServicerContext
    ) -> quorum_pb2.AcquireLockResponse:
        if self.node.role != Role.LEADER:
            return quorum_pb2.AcquireLockResponse(
                status=quorum_pb2.LOCK_NOT_LEADER,
                leader_id=self.node.leader_id or "",
                leader_address=self._get_leader_address(),
                message="Node is not the cluster leader",
            )

        now_ms = int(time.time() * 1000)
        data = {
            "key": request.key,
            "client_id": request.client_id,
            "ttl_ms": request.ttl_ms,
        }

        try:
            fut = await self.node.propose("ACQUIRE", data=data, timestamp_ms=now_ms)
            proposed_index = self.node.log_storage.last_log_index
            committed = await asyncio.wait_for(fut, timeout=5.0)

            if not committed:
                return quorum_pb2.AcquireLockResponse(
                    status=quorum_pb2.LOCK_NOT_LEADER,
                    leader_id=self.node.leader_id or "",
                    leader_address=self._get_leader_address(),
                    message="Leadership lost before commit",
                )

            result = self.state_machine.get_result(proposed_index)
            if not result:
                return quorum_pb2.AcquireLockResponse(
                    status=quorum_pb2.LOCK_ERROR,
                    message="Internal error retrieving state machine result",
                )

            status = quorum_pb2.LOCK_ACQUIRED if result.success else quorum_pb2.LOCK_BUSY
            return quorum_pb2.AcquireLockResponse(
                status=status,
                fence_token=result.fence_token,
                expires_at_ms=result.expires_at_ms,
                leader_id=self.node.node_id,
                leader_address=self.self_client_address,
                message=result.message,
            )

        except asyncio.TimeoutError:
            return quorum_pb2.AcquireLockResponse(
                status=quorum_pb2.LOCK_ERROR,
                message="Timeout waiting for quorum commit",
            )
        except Exception as e:
            return quorum_pb2.AcquireLockResponse(
                status=quorum_pb2.LOCK_ERROR,
                message=str(e),
            )

    async def RenewLock(
        self, request: quorum_pb2.RenewLockRequest, context: grpc.aio.ServicerContext
    ) -> quorum_pb2.RenewLockResponse:
        if self.node.role != Role.LEADER:
            return quorum_pb2.RenewLockResponse(
                status=quorum_pb2.LOCK_NOT_LEADER,
                leader_id=self.node.leader_id or "",
                leader_address=self._get_leader_address(),
                message="Node is not the cluster leader",
            )

        now_ms = int(time.time() * 1000)
        data = {
            "key": request.key,
            "client_id": request.client_id,
            "fence_token": request.fence_token,
            "ttl_ms": request.ttl_ms,
        }

        try:
            fut = await self.node.propose("RENEW", data=data, timestamp_ms=now_ms)
            proposed_index = self.node.log_storage.last_log_index
            committed = await asyncio.wait_for(fut, timeout=5.0)

            if not committed:
                return quorum_pb2.RenewLockResponse(
                    status=quorum_pb2.LOCK_NOT_LEADER,
                    leader_id=self.node.leader_id or "",
                    leader_address=self._get_leader_address(),
                    message="Leadership lost before commit",
                )

            result = self.state_machine.get_result(proposed_index)
            if not result:
                return quorum_pb2.RenewLockResponse(
                    status=quorum_pb2.LOCK_ERROR,
                    message="Internal error retrieving state machine result",
                )

            if result.success:
                status = quorum_pb2.LOCK_ACQUIRED
            elif result.status == "EXPIRED":
                status = quorum_pb2.LOCK_EXPIRED
            else:
                status = quorum_pb2.LOCK_INVALID_TOKEN

            return quorum_pb2.RenewLockResponse(
                status=status,
                fence_token=result.fence_token,
                expires_at_ms=result.expires_at_ms,
                leader_id=self.node.node_id,
                leader_address=self.self_client_address,
                message=result.message,
            )

        except Exception as e:
            return quorum_pb2.RenewLockResponse(
                status=quorum_pb2.LOCK_ERROR,
                message=str(e),
            )

    async def ReleaseLock(
        self, request: quorum_pb2.ReleaseLockRequest, context: grpc.aio.ServicerContext
    ) -> quorum_pb2.ReleaseLockResponse:
        if self.node.role != Role.LEADER:
            return quorum_pb2.ReleaseLockResponse(
                status=quorum_pb2.LOCK_NOT_LEADER,
                leader_id=self.node.leader_id or "",
                leader_address=self._get_leader_address(),
                message="Node is not the cluster leader",
            )

        now_ms = int(time.time() * 1000)
        data = {
            "key": request.key,
            "client_id": request.client_id,
            "fence_token": request.fence_token,
        }

        try:
            fut = await self.node.propose("RELEASE", data=data, timestamp_ms=now_ms)
            proposed_index = self.node.log_storage.last_log_index
            committed = await asyncio.wait_for(fut, timeout=5.0)

            if not committed:
                return quorum_pb2.ReleaseLockResponse(
                    status=quorum_pb2.LOCK_NOT_LEADER,
                    leader_id=self.node.leader_id or "",
                    leader_address=self._get_leader_address(),
                    message="Leadership lost before commit",
                )

            result = self.state_machine.get_result(proposed_index)
            status = quorum_pb2.LOCK_ACQUIRED if (result and result.success) else quorum_pb2.LOCK_INVALID_TOKEN
            return quorum_pb2.ReleaseLockResponse(
                status=status,
                leader_id=self.node.node_id,
                leader_address=self.self_client_address,
                message=result.message if result else "",
            )

        except Exception as e:
            return quorum_pb2.ReleaseLockResponse(
                status=quorum_pb2.LOCK_ERROR,
                message=str(e),
            )

    async def GetLock(
        self, request: quorum_pb2.GetLockRequest, context: grpc.aio.ServicerContext
    ) -> quorum_pb2.GetLockResponse:
        now_ms = int(time.time() * 1000)
        lock = self.state_machine.get_lock(request.key, now_ms)
        leader_addr = self._get_leader_address()

        if lock:
            remaining = max(0, lock.expires_at_ms - now_ms)
            return quorum_pb2.GetLockResponse(
                is_locked=True,
                owner=lock.owner,
                fence_token=lock.fence_token,
                remaining_ttl_ms=remaining,
                leader_id=self.node.leader_id or (self.node.node_id if self.node.role == Role.LEADER else ""),
                leader_address=leader_addr,
            )
        return quorum_pb2.GetLockResponse(
            is_locked=False,
            owner="",
            fence_token=0,
            remaining_ttl_ms=0,
            leader_id=self.node.leader_id or (self.node.node_id if self.node.role == Role.LEADER else ""),
            leader_address=leader_addr,
        )

    async def WatchLeader(
        self, request: quorum_pb2.WatchLeaderRequest, context: grpc.aio.ServicerContext
    ):
        queue: asyncio.Queue[quorum_pb2.LeaderNotification] = asyncio.Queue()
        self._watchers.add(queue)

        try:
            # Yield initial status
            init_notif = quorum_pb2.LeaderNotification(
                leader_id=self.node.leader_id or (self.node.node_id if self.node.role == Role.LEADER else ""),
                term=self.node.current_term,
                leader_address=self._get_leader_address(),
                is_leader=(self.node.role == Role.LEADER),
            )
            yield init_notif

            while True:
                if context.done():
                    break
                notif = await queue.get()
                yield notif
        finally:
            self._watchers.discard(queue)

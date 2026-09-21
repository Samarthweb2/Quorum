"""
Deterministic Distributed Lock State Machine.

Tracks active locks, strictly monotonically increasing 64-bit fencing tokens,
and deterministic TTL expiration derived from log entry proposal timestamps.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Dict, Optional
from quorum.raft.storage import LogEntry


@dataclass
class LockRecord:
    key: str
    owner: str
    fence_token: int
    granted_at_ms: int
    expires_at_ms: int

    def is_active(self, current_time_ms: int) -> bool:
        return current_time_ms < self.expires_at_ms


@dataclass
class LockApplyResult:
    success: bool
    status: str  # ACQUIRED, BUSY, RENEWED, RELEASED, INVALID_TOKEN, EXPIRED, QUEUED, RELEASED_AND_PROMOTED, EXPIRED_AND_PROMOTED, CANCELLED
    fence_token: int = 0
    expires_at_ms: int = 0
    message: str = ""
    queue_position: int = 0
    promoted_owner: str = ""
    key: str = ""
    ttl_ms: int = 0


class LockStateMachine:
    """
    In-memory state machine replicated across all Raft nodes.
    Maintains lock ownership, monotonic fencing tokens, and FIFO wait queues.
    """

    def __init__(self) -> None:
        self.locks: Dict[str, LockRecord] = {}
        self.fencing_token_counter: int = 0
        self.last_applied_index: int = 0
        # Wait queues per lock key: list of {"client_id": str, "ttl_ms": int, "enqueued_at_ms": int, "wait_timeout_ms": int}
        self.wait_queues: Dict[str, list[dict]] = {}
        # Cache of results for recent committed entries (key: entry.index -> LockApplyResult)
        self._results_cache: Dict[int, LockApplyResult] = {}

    def _promote_next_waiter(self, key: str, ts: int) -> Optional[LockRecord]:
        """Pops the next non-expired waiter from wait queue and grants the lock."""
        queue = self.wait_queues.get(key, [])
        while queue:
            waiter = queue.pop(0)
            wait_timeout = waiter.get("wait_timeout_ms", 60000)
            if ts <= waiter["enqueued_at_ms"] + wait_timeout:
                self.fencing_token_counter += 1
                new_lock = LockRecord(
                    key=key,
                    owner=waiter["client_id"],
                    fence_token=self.fencing_token_counter,
                    granted_at_ms=ts,
                    expires_at_ms=ts + waiter.get("ttl_ms", 5000),
                )
                self.locks[key] = new_lock
                return new_lock
        return None

    def apply(self, entry: LogEntry) -> LockApplyResult:
        """
        Deterministically applies a committed log entry to the lock state.
        All nodes apply the exact same entries with identical timestamps.
        """
        self.last_applied_index = entry.index
        cmd = entry.command_type
        data = entry.data or {}
        ts = entry.timestamp_ms

        if cmd == "ACQUIRE":
            key = data.get("key", "")
            client_id = data.get("client_id", "")
            ttl_ms = int(data.get("ttl_ms", 5000))
            wait_if_busy = bool(data.get("wait_if_busy", False))
            wait_timeout_ms = int(data.get("wait_timeout_ms", 60000))

            current_lock = self.locks.get(key)
            if current_lock and current_lock.is_active(ts) and current_lock.owner != client_id:
                # Lock is currently held by someone else
                if wait_if_busy:
                    if key not in self.wait_queues:
                        self.wait_queues[key] = []
                    queue = self.wait_queues[key]
                    existing = next((item for item in queue if item["client_id"] == client_id), None)
                    if existing:
                        pos = queue.index(existing) + 1
                    else:
                        queue.append({
                            "client_id": client_id,
                            "ttl_ms": ttl_ms,
                            "enqueued_at_ms": ts,
                            "wait_timeout_ms": wait_timeout_ms,
                        })
                        pos = len(queue)

                    result = LockApplyResult(
                        success=False,
                        status="QUEUED",
                        fence_token=current_lock.fence_token,
                        expires_at_ms=current_lock.expires_at_ms,
                        queue_position=pos,
                        message=f"Lock '{key}' is busy; client '{client_id}' enqueued at position {pos}",
                    )
                else:
                    result = LockApplyResult(
                        success=False,
                        status="BUSY",
                        fence_token=current_lock.fence_token,
                        expires_at_ms=current_lock.expires_at_ms,
                        message=f"Lock '{key}' is currently held by {current_lock.owner}",
                    )
            else:
                # Grant lock with monotonically increasing fencing token
                self.fencing_token_counter += 1
                expires_at_ms = ts + ttl_ms
                new_lock = LockRecord(
                    key=key,
                    owner=client_id,
                    fence_token=self.fencing_token_counter,
                    granted_at_ms=ts,
                    expires_at_ms=expires_at_ms,
                )
                self.locks[key] = new_lock
                if key in self.wait_queues:
                    self.wait_queues[key] = [item for item in self.wait_queues[key] if item["client_id"] != client_id]
                result = LockApplyResult(
                    success=True,
                    status="ACQUIRED",
                    fence_token=new_lock.fence_token,
                    expires_at_ms=new_lock.expires_at_ms,
                    message="Lock acquired successfully",
                )

        elif cmd == "RENEW":
            key = data.get("key", "")
            client_id = data.get("client_id", "")
            token = int(data.get("fence_token", 0))
            ttl_ms = int(data.get("ttl_ms", 5000))

            current_lock = self.locks.get(key)
            if not current_lock or current_lock.owner != client_id or current_lock.fence_token != token:
                result = LockApplyResult(
                    success=False,
                    status="INVALID_TOKEN",
                    message="Lock not found or invalid owner/fencing token",
                )
            elif not current_lock.is_active(ts):
                result = LockApplyResult(
                    success=False,
                    status="EXPIRED",
                    message="Lock has already expired and cannot be renewed",
                )
            else:
                current_lock.expires_at_ms = ts + ttl_ms
                result = LockApplyResult(
                    success=True,
                    status="RENEWED",
                    fence_token=current_lock.fence_token,
                    expires_at_ms=current_lock.expires_at_ms,
                    message="Lock renewed successfully",
                )

        elif cmd == "RELEASE":
            key = data.get("key", "")
            client_id = data.get("client_id", "")
            token = int(data.get("fence_token", 0))

            current_lock = self.locks.get(key)
            if not current_lock or current_lock.owner != client_id or current_lock.fence_token != token:
                result = LockApplyResult(
                    success=False,
                    status="INVALID_TOKEN",
                    message="Lock not found or invalid owner/fencing token",
                )
            else:
                promoted = self._promote_next_waiter(key, ts)
                if promoted:
                    result = LockApplyResult(
                        success=True,
                        status="RELEASED_AND_PROMOTED",
                        fence_token=promoted.fence_token,
                        expires_at_ms=promoted.expires_at_ms,
                        promoted_owner=promoted.owner,
                        key=key,
                        ttl_ms=promoted.expires_at_ms - promoted.granted_at_ms,
                        message=f"Lock released and automatically promoted to '{promoted.owner}'",
                    )
                else:
                    if key in self.locks:
                        del self.locks[key]
                    result = LockApplyResult(
                        success=True,
                        status="RELEASED",
                        fence_token=token,
                        key=key,
                        message="Lock released successfully",
                    )

        elif cmd == "EXPIRE":
            key = data.get("key", "")
            current_lock = self.locks.get(key)
            if current_lock:
                current_lock.expires_at_ms = min(current_lock.expires_at_ms, ts - 1)
                promoted = self._promote_next_waiter(key, ts)
                if promoted:
                    result = LockApplyResult(
                        success=True,
                        status="EXPIRED_AND_PROMOTED",
                        fence_token=promoted.fence_token,
                        expires_at_ms=promoted.expires_at_ms,
                        promoted_owner=promoted.owner,
                        key=key,
                        ttl_ms=promoted.expires_at_ms - promoted.granted_at_ms,
                        message=f"Lock expired and automatically promoted to '{promoted.owner}'",
                    )
                else:
                    result = LockApplyResult(
                        success=True,
                        status="EXPIRED",
                        fence_token=current_lock.fence_token,
                        expires_at_ms=current_lock.expires_at_ms,
                        message="Lock expired",
                    )
            else:
                result = LockApplyResult(success=True, status="OK")

        elif cmd == "CANCEL_WAIT":
            key = data.get("key", "")
            client_id = data.get("client_id", "")
            if key in self.wait_queues:
                self.wait_queues[key] = [w for w in self.wait_queues[key] if w["client_id"] != client_id]
            result = LockApplyResult(success=True, status="CANCELLED", message=f"Cancelled wait for {client_id}")

        else:  # NOOP
            result = LockApplyResult(success=True, status="OK")

        self._results_cache[entry.index] = result
        # Bounded cache eviction to prevent unbounded memory growth
        if len(self._results_cache) > 1000:
            overflow = len(self._results_cache) - 1000
            for old_idx in sorted(self._results_cache.keys())[:overflow]:
                self._results_cache.pop(old_idx, None)

        return result

    def get_result(self, entry_index: int) -> Optional[LockApplyResult]:
        return self._results_cache.get(entry_index)

    def get_lock(self, key: str, current_time_ms: int) -> Optional[LockRecord]:
        lock = self.locks.get(key)
        if lock and lock.is_active(current_time_ms):
            return lock
        return None

    def get_active_locks(self, current_time_ms: int) -> Dict[str, LockRecord]:
        """Returns only currently active locks whose leases have not expired."""
        return {k: v for k, v in self.locks.items() if v.is_active(current_time_ms)}

    def get_wait_queue(self, key: str) -> list[dict]:
        """Returns a copy of the current wait queue for the given key."""
        return list(self.wait_queues.get(key, []))

    def get_queue_position(self, key: str, client_id: str) -> int:
        """Returns 1-based position in the queue, or 0 if not queued."""
        queue = self.wait_queues.get(key, [])
        for idx, item in enumerate(queue):
            if item["client_id"] == client_id:
                return idx + 1
        return 0

    def export_snapshot(self) -> bytes:
        """Serializes current active locks, wait queues, and token counter into bytes."""
        state = {
            "last_applied_index": self.last_applied_index,
            "fencing_token_counter": self.fencing_token_counter,
            "locks": {
                k: {
                    "key": v.key,
                    "owner": v.owner,
                    "fence_token": v.fence_token,
                    "granted_at_ms": v.granted_at_ms,
                    "expires_at_ms": v.expires_at_ms,
                }
                for k, v in self.locks.items()
            },
            "wait_queues": {
                k: [
                    {
                        "client_id": item["client_id"],
                        "ttl_ms": item.get("ttl_ms", 5000),
                        "enqueued_at_ms": item.get("enqueued_at_ms", 0),
                        "wait_timeout_ms": item.get("wait_timeout_ms", 60000),
                    }
                    for item in q
                ]
                for k, q in self.wait_queues.items()
            },
        }
        return json.dumps(state).encode("utf-8")

    def import_snapshot(self, data: bytes) -> None:
        """Restores state machine from serialized snapshot bytes."""
        state = json.loads(data.decode("utf-8"))
        self.last_applied_index = state.get("last_applied_index", 0)
        self.fencing_token_counter = state.get("fencing_token_counter", 0)
        self.locks = {}
        for k, v in state.get("locks", {}).items():
            self.locks[k] = LockRecord(
                key=v["key"],
                owner=v["owner"],
                fence_token=v["fence_token"],
                granted_at_ms=v["granted_at_ms"],
                expires_at_ms=v["expires_at_ms"],
            )
        self.wait_queues = {}
        for k, q in state.get("wait_queues", {}).items():
            self.wait_queues[k] = list(q)
        self._results_cache.clear()

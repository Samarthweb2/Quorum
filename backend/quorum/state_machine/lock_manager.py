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
    status: str  # ACQUIRED, BUSY, RENEWED, RELEASED, INVALID_TOKEN, EXPIRED
    fence_token: int = 0
    expires_at_ms: int = 0
    message: str = ""


class LockStateMachine:
    """
    In-memory state machine replicated across all Raft nodes.
    Maintains lock ownership and monotonic fencing tokens.
    """

    def __init__(self) -> None:
        self.locks: Dict[str, LockRecord] = {}
        self.fencing_token_counter: int = 0
        self.last_applied_index: int = 0
        # Cache of results for recent committed entries (key: entry.index -> LockApplyResult)
        self._results_cache: Dict[int, LockApplyResult] = {}

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

            current_lock = self.locks.get(key)
            if current_lock and current_lock.is_active(ts) and current_lock.owner != client_id:
                # Lock is currently held by someone else
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
                del self.locks[key]
                result = LockApplyResult(
                    success=True,
                    status="RELEASED",
                    fence_token=token,
                    message="Lock released successfully",
                )

        else:  # NOOP
            result = LockApplyResult(success=True, status="OK")

        self._results_cache[entry.index] = result
        return result

    def get_result(self, entry_index: int) -> Optional[LockApplyResult]:
        return self._results_cache.get(entry_index)

    def get_lock(self, key: str, current_time_ms: int) -> Optional[LockRecord]:
        lock = self.locks.get(key)
        if lock and lock.is_active(current_time_ms):
            return lock
        return None

    def export_snapshot(self) -> bytes:
        """Serializes current active locks and token counter into bytes."""
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
        self._results_cache.clear()

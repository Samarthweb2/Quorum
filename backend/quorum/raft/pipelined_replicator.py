"""
Asynchronous Pipelined Replication Loop for Raft.

Implements optimistic windowing using an asyncio.Semaphore to dispatch
AppendEntries RPCs to followers concurrently without waiting for sequential
round-trip latencies or local disk fsync.
"""

from __future__ import annotations

import asyncio
import inspect
import logging
from typing import Any, Callable, List, Optional

from quorum.raft.entry_cache import CachedEntry, InflightLogCache
from quorum.raft.types import AppendEntriesArgs, AppendEntriesReply

logger = logging.getLogger(__name__)


class PeerReplicationPipeline:
    """Optimistic streaming replication pipeline for a single Raft follower."""

    def __init__(
        self,
        peer_id: str,
        transport: Any,
        log_cache: InflightLogCache,
        last_log_index: int = 0,
        max_inflight: int = 10,
        current_term: int = 1,
        leader_id: str = "",
        commit_index_provider: Optional[Callable[[], int]] = None,
        on_ack: Optional[Callable[[str, int], None]] = None,
    ) -> None:
        self.peer_id = peer_id
        self.transport = transport
        self.log_cache = log_cache
        self.current_term = current_term
        self.leader_id = leader_id
        self.commit_index_provider = commit_index_provider or (lambda: 0)
        self.on_ack = on_ack

        # State tracking (Raft §5.3)
        self.next_index: int = last_log_index + 1
        self.match_index: int = 0
        self.inflight_index: int = last_log_index  # Highest index optimistically dispatched

        self.max_inflight = max_inflight
        self._inflight_sem = asyncio.Semaphore(max_inflight)
        self._trigger_event = asyncio.Event()
        self._running = False
        self._worker_task: Optional[asyncio.Task] = None
        self._tasks: set[asyncio.Task] = set()

    def start(self) -> None:
        """Starts the pipeline sender task."""
        if self._running:
            return
        self._running = True
        self._worker_task = asyncio.create_task(self._pipeline_sender())

    def signal_new_entries(self) -> None:
        """Signals the sender loop that new entries are available in the cache."""
        self._trigger_event.set()

    async def _pipeline_sender(self) -> None:
        while self._running:
            try:
                await self._trigger_event.wait()
            except asyncio.CancelledError:
                break
            self._trigger_event.clear()

            while self._running:
                # Check if there are unpersisted/persisted entries in cache beyond inflight_index
                highest_cached = self.log_cache.entries[-1].index if self.log_cache.entries else 0
                if self.inflight_index >= highest_cached:
                    break

                # 1. Check window capacity
                try:
                    await self._inflight_sem.acquire()
                except asyncio.CancelledError:
                    break

                # 2. Extract slice from in-memory cache
                start_idx = self.inflight_index + 1
                entries: List[CachedEntry] = self.log_cache.get_entries_from(start_idx, max_count=64)
                if not entries:
                    self._inflight_sem.release()
                    break

                batch_end_index = entries[-1].index
                self.inflight_index = batch_end_index

                # 3. Fire and decouple via worker task
                task = asyncio.create_task(self._send_append_entries_rpc(entries, batch_end_index))
                self._tasks.add(task)
                task.add_done_callback(self._tasks.discard)

    async def _send_append_entries_rpc(self, entries: List[CachedEntry], batch_end_index: int) -> None:
        try:
            prev_idx = entries[0].index - 1
            prev_entry = self.log_cache.get_entry(prev_idx)
            prev_term = prev_entry.term if prev_entry else 0

            # Convert CachedEntry to LogEntry / AppendEntriesArgs if transport expects it
            response = await self._dispatch_rpc(prev_idx, prev_term, entries)

            if response is not None and getattr(response, "success", False):
                # Advance match index and next index monotonically
                self.match_index = max(self.match_index, batch_end_index)
                self.next_index = self.match_index + 1
                if self.on_ack:
                    self.on_ack(self.peer_id, self.match_index)
            elif response is not None and not getattr(response, "success", False):
                # Fast recovery on conflict: roll back optimistic pointers
                conflict_idx = getattr(response, "conflict_index", 1) or 1
                self.inflight_index = min(self.inflight_index, conflict_idx - 1)
                self.next_index = conflict_idx
                self._trigger_event.set()
            else:
                # Network error or dropped RPC
                self.inflight_index = self.match_index

        except Exception as e:
            logger.debug(f"Pipelined AppendEntries to {self.peer_id} failed: {e}")
            self.inflight_index = self.match_index
        finally:
            self._inflight_sem.release()

    async def _dispatch_rpc(
        self, prev_idx: int, prev_term: int, entries: List[CachedEntry]
    ) -> Any:
        """Dispatches RPC supporting both dictionary/keyword args and Quorum AppendEntriesArgs."""
        # Check signature of send_append_entries
        method = getattr(self.transport, "send_append_entries", None)
        if not method:
            return None

        sig = inspect.signature(method)
        # If method expects (peer, prev_log_index, prev_log_term, entries)
        if "prev_log_index" in sig.parameters or "peer" in sig.parameters:
            try:
                return await method(
                    peer=self.peer_id,
                    prev_log_index=prev_idx,
                    prev_log_term=prev_term,
                    entries=entries,
                )
            except TypeError:
                pass

        # Otherwise convert to Quorum LogEntry and AppendEntriesArgs
        from quorum.raft.storage import LogEntry

        raft_entries: List[LogEntry] = []
        for e in entries:
            # Check if payload is json/dict or raw bytes
            data = None
            if e.payload:
                try:
                    import json
                    data = json.loads(e.payload.decode("utf-8"))
                except Exception:
                    data = {"raw_payload": e.payload.hex()}
            raft_entries.append(
                LogEntry(
                    index=e.index,
                    term=e.term,
                    command_type=e.command,
                    data=data,
                )
            )

        args = AppendEntriesArgs(
            term=self.current_term,
            leader_id=self.leader_id,
            prev_log_index=prev_idx,
            prev_log_term=prev_term,
            entries=raft_entries,
            leader_commit=self.commit_index_provider(),
        )
        return await method(self.peer_id, args)

    async def stop(self) -> None:
        """Stops the pipeline and cancels background workers."""
        self._running = False
        self._trigger_event.set()
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass

        for t in list(self._tasks):
            t.cancel()
        self._tasks.clear()

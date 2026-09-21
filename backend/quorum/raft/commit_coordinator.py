"""
Consensus Orchestration & Safe Commit Barrier for Pipelined Raft.

Ties together:
1. Group Commit WAL (batched disk fsync loop).
2. In-Memory Ring Buffer Cache (fast in-memory streaming slices).
3. Pipelined Replicators (optimistic concurrent RPCs per peer).
4. Strict Raft Invariant: commit_index <= min(quorum_match_index, persisted_index).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Callable, Dict, List, Optional

from quorum.raft.entry_cache import CachedEntry, InflightLogCache
from quorum.raft.pipelined_replicator import PeerReplicationPipeline
from quorum.raft.wal_group_committer import GroupCommitWAL

logger = logging.getLogger(__name__)


class RaftEngineCommitCoordinator:
    """Coordinates proposal ingestion, replication pipelines, and the safe commit barrier."""

    def __init__(
        self,
        node_id: str,
        peers: List[str],
        wal: GroupCommitWAL,
        cache: InflightLogCache,
        transport: Any = None,
        max_inflight: int = 10,
        on_apply: Optional[Callable[[CachedEntry], None]] = None,
    ) -> None:
        self.node_id = node_id
        self.peers = [p for p in peers if p != node_id]
        self.wal = wal
        self.cache = cache
        self.transport = transport
        self.max_inflight = max_inflight
        self.on_apply = on_apply

        self.current_term: int = 1
        self.commit_index: int = 0
        self.last_applied: int = 0

        # Peer replication pipelines and match indices
        self.pipelines: Dict[str, PeerReplicationPipeline] = {}
        self.match_indices: Dict[str, int] = {p: 0 for p in self.peers}
        # Waiters awaiting commit confirmation: index -> Future
        self._commit_waiters: Dict[int, asyncio.Future] = {}
        self._running = False

        # Link WAL persistence callback to evaluate barrier when fsync finishes
        self.wal.on_persisted = self.on_wal_persisted

        # Setup peer pipelines if transport is present
        self._setup_pipelines()

    def _setup_pipelines(self) -> None:
        self.pipelines.clear()
        if self.transport:
            for peer in self.peers:
                pipeline = PeerReplicationPipeline(
                    peer_id=peer,
                    transport=self.transport,
                    log_cache=self.cache,
                    last_log_index=self.wal.last_log_index,
                    max_inflight=self.max_inflight,
                    current_term=self.current_term,
                    leader_id=self.node_id,
                    commit_index_provider=lambda: self.commit_index,
                    on_ack=self.on_peer_ack,
                )
                self.pipelines[peer] = pipeline

    def set_transport(self, transport: Any) -> None:
        self.transport = transport
        self._setup_pipelines()

    def start(self, initial_index: int = 0) -> None:
        """Starts WAL, cache, and peer pipelines."""
        self._running = True
        self.wal.start(initial_index=initial_index)
        for pipeline in self.pipelines.values():
            pipeline.start()

    async def propose(self, command: str, payload: bytes) -> Any:
        """
        Entry point for clients / gateway.
        Submits proposal, caches it, signals pipelines, and awaits commit.
        """
        if not self._running:
            raise RuntimeError("RaftEngineCommitCoordinator is not running")

        # 1. Submit to Group Commit WAL (asynchronously flushes and fsyncs)
        idx, _persist_fut = await self.wal.submit(self.current_term, command, payload)
        loop = asyncio.get_running_loop()
        commit_fut = loop.create_future()
        self._commit_waiters[idx] = commit_fut

        # 2. Append to In-Memory Cache immediately
        self.cache.append(
            CachedEntry(
                index=idx,
                term=self.current_term,
                command=command,
                payload=payload,
            )
        )

        # 3. Notify replication pipelines (proceeds in parallel with disk fsync)
        for pipeline in self.pipelines.values():
            pipeline.signal_new_entries()

        # In single-node mode, evaluate immediately in case WAL already synced
        if not self.peers:
            self._evaluate_commit_barrier()

        # 4. Await consensus & state machine application
        return await commit_fut

    def on_peer_ack(self, peer_id: str, matched_idx: int) -> None:
        """Invoked when a peer append RPC confirms replication."""
        self.match_indices[peer_id] = max(self.match_indices.get(peer_id, 0), matched_idx)
        if peer_id in self.pipelines:
            self.pipelines[peer_id].match_index = max(
                self.pipelines[peer_id].match_index, matched_idx
            )
        self._evaluate_commit_barrier()

    def on_wal_persisted(self, persisted_idx: int) -> None:
        """Invoked when the local WAL completes disk fsync for a batch."""
        self._evaluate_commit_barrier()

    def _evaluate_commit_barrier(self) -> None:
        """
        Calculates quorum match index and enforces the Raft Safety Invariant:
        commit_index <= min(quorum_match_index, persisted_index)
        """
        if not self._running:
            return

        if self.peers:
            match_indices = [
                self.pipelines[p].match_index if p in self.pipelines else self.match_indices.get(p, 0)
                for p in self.peers
            ]
            # Include leader's own index
            match_indices.append(self.wal.last_log_index)
            match_indices.sort()

            # Majority quorum index (median in 2F + 1 cluster)
            quorum_match_index = match_indices[len(match_indices) // 2]
        else:
            quorum_match_index = self.wal.last_log_index

        # RAFT INVARIANT: Cannot commit beyond what has been physically synced to disk!
        safe_commit_limit = min(quorum_match_index, self.wal.persisted_index)

        if safe_commit_limit > self.commit_index:
            # Advance commit index and resolve client futures
            for idx in range(self.commit_index + 1, safe_commit_limit + 1):
                waiter = self._commit_waiters.pop(idx, None)
                if waiter and not waiter.done():
                    waiter.set_result({"status": "COMMITTED", "index": idx})

            self.commit_index = safe_commit_limit
            self._apply_to_state_machine()

    def _apply_to_state_machine(self) -> None:
        """Applies committed entries sequentially to the state machine."""
        while self.commit_index > self.last_applied:
            self.last_applied += 1
            entry = self.cache.get_entry(self.last_applied)
            if entry and self.on_apply:
                try:
                    self.on_apply(entry)
                except Exception as e:
                    logger.exception(
                        f"[{self.node_id}] Error applying entry {entry.index} to state machine: {e}"
                    )

    async def stop(self) -> None:
        """Gracefully stops all pipelines and WAL."""
        self._running = False
        for pipeline in self.pipelines.values():
            await pipeline.stop()
        await self.wal.stop()

        # Fail any uncommitted futures
        for fut in self._commit_waiters.values():
            if not fut.done():
                fut.set_exception(RuntimeError("Coordinator stopped before commit"))
        self._commit_waiters.clear()

"""
Unit and Integration Tests for Pipelined Raft and Group Commit WAL Engine.

Verifies:
1. Group Commit WAL batching, fsync reduction, and crash recovery.
2. In-Memory Ring Buffer (InflightLogCache) eviction, slicing, and rollback.
3. Pipelined Replicator optimistic windowing with bounded concurrency.
4. Strict Raft Safety Invariant: commit_index <= min(quorum_match_index, persisted_index).
5. End-to-end consensus orchestration and state machine application.
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Any, List
import pytest

from quorum.raft.commit_coordinator import RaftEngineCommitCoordinator
from quorum.raft.entry_cache import CachedEntry, InflightLogCache
from quorum.raft.pipelined_replicator import PeerReplicationPipeline
from quorum.raft.wal_group_committer import GroupCommitWAL


# =============================================================================
# 1. Group Commit WAL Engine Tests
# =============================================================================


@pytest.mark.asyncio
async def test_group_commit_batching_and_fsync_reduction(tmp_path: Path):
    wal_file = str(tmp_path / "test_group.wal")
    wal = GroupCommitWAL(
        wal_path=wal_file,
        max_batch_size=64,
        max_batch_bytes=64 * 1024,
        max_delay_ms=5.0,
    )
    wal.start()

    try:
        # Submit 60 concurrent proposals
        num_proposals = 60
        tasks = []
        for i in range(1, num_proposals + 1):
            tasks.append(
                wal.submit(
                    term=1,
                    command=f"CMD_{i}",
                    payload=f'{{"key": "k{i}", "val": {i}}}'.encode("utf-8"),
                )
            )

        results = await asyncio.gather(*tasks)
        indices = [r[0] for r in results]
        assert indices == list(range(1, num_proposals + 1))

        # Wait for WAL flusher to sync all entries to disk
        timeout = 2.0
        start_t = asyncio.get_event_loop().time()
        while wal.persisted_index < num_proposals:
            if asyncio.get_event_loop().time() - start_t > timeout:
                raise TimeoutError(f"WAL failed to flush: persisted={wal.persisted_index}/{num_proposals}")
            await asyncio.sleep(0.01)

        assert wal.persisted_index == num_proposals
        # Invocations of fsync must be dramatically fewer than number of proposals
        assert wal.fsync_count < 10, f"Expected batched fsyncs < 10, got {wal.fsync_count}"
        assert wal.batch_count >= 1

    finally:
        await wal.stop()

    # Verify recovery and CRC32 verification on disk
    wal_recovered = GroupCommitWAL(wal_path=wal_file)
    entries = wal_recovered.recover()
    assert len(entries) == num_proposals
    for idx, term, cmd, payload in entries:
        assert term == 1
        assert cmd == f"CMD_{idx}"
        assert f'"val": {idx}'.encode("utf-8") in payload


@pytest.mark.asyncio
async def test_group_commit_torn_write_recovery(tmp_path: Path):
    wal_file = str(tmp_path / "torn_write.wal")
    wal = GroupCommitWAL(wal_path=wal_file, max_delay_ms=1.0)
    wal.start()

    try:
        for i in range(1, 11):
            await wal.submit(term=1, command=f"CMD_{i}", payload=b"valid_payload")

        while wal.persisted_index < 10:
            await asyncio.sleep(0.01)
    finally:
        await wal.stop()

    # Append corrupt partial bytes at EOF (simulating sudden crash mid-write)
    with open(wal_file, "ab") as f:
        f.write(b"\x00\x01\x02\x03\xFF\xEE")

    corrupted_size = os.path.getsize(wal_file)

    # Recover WAL and assert corrupt tail is cleanly truncated
    wal_recover = GroupCommitWAL(wal_path=wal_file)
    entries = wal_recover.recover()
    assert len(entries) == 10
    recovered_size = os.path.getsize(wal_file)
    assert recovered_size < corrupted_size


# =============================================================================
# 2. In-Memory Ring Buffer Tests (InflightLogCache)
# =============================================================================


def test_inflight_log_cache_operations():
    cache = InflightLogCache(capacity=5)

    # 1. Contiguous append validation
    cache.append(CachedEntry(index=1, term=1, command="A", payload=b"p1"))
    cache.append(CachedEntry(index=2, term=1, command="B", payload=b"p2"))

    with pytest.raises(ValueError, match="Non-contiguous index append"):
        cache.append(CachedEntry(index=4, term=1, command="D", payload=b"p4"))

    # 2. Capacity eviction
    cache.append(CachedEntry(index=3, term=1, command="C", payload=b"p3"))
    cache.append(CachedEntry(index=4, term=1, command="D", payload=b"p4"))
    cache.append(CachedEntry(index=5, term=1, command="E", payload=b"p5"))
    assert len(cache) == 5
    assert cache.base_index == 0

    # Append 6th item -> index 1 evicted, base_index becomes 2
    cache.append(CachedEntry(index=6, term=1, command="F", payload=b"p6"))
    assert len(cache) == 5
    assert cache.base_index == 2
    assert cache.entries[0].index == 2
    assert cache.entries[-1].index == 6

    # Slicing evicted range returns empty (requires disk WAL fallback)
    assert cache.get_entries_from(1, max_count=5) == []

    # Slicing within active window
    slice_entries = cache.get_entries_from(3, max_count=3)
    assert [e.index for e in slice_entries] == [3, 4, 5]

    # Individual lookups
    assert cache.get_entry(1) is None
    assert cache.get_entry(4).command == "D"
    assert cache.get_entry(10) is None

    # Truncate suffix on log conflict
    cache.truncate_suffix(5)
    assert len(cache) == 3
    assert cache.entries[-1].index == 4


# =============================================================================
# 3. Pipelined Replication Windowing Tests
# =============================================================================


class MockStreamingTransport:
    def __init__(self, delay_s: float = 0.01):
        self.delay_s = delay_s
        self.sent_batches: List[List[CachedEntry]] = []
        self.inflight_count: int = 0
        self.max_observed_inflight: int = 0

    async def send_append_entries(self, peer: str, prev_log_index: int, prev_log_term: int, entries: List[CachedEntry]):
        self.inflight_count += 1
        self.max_observed_inflight = max(self.max_observed_inflight, self.inflight_count)
        self.sent_batches.append(entries)

        if self.delay_s > 0:
            await asyncio.sleep(self.delay_s)

        self.inflight_count -= 1

        class Reply:
            def __init__(self, success: bool, match_index: int):
                self.success = success
                self.match_index = match_index
                self.conflict_index = 0

        return Reply(success=True, match_index=entries[-1].index)


@pytest.mark.asyncio
async def test_pipelined_replication_windowing():
    cache = InflightLogCache(capacity=100)
    for i in range(1, 21):
        cache.append(CachedEntry(index=i, term=1, command=f"C{i}", payload=b"x"))

    transport = MockStreamingTransport(delay_s=0.03)
    pipeline = PeerReplicationPipeline(
        peer_id="peer-1",
        transport=transport,
        log_cache=cache,
        last_log_index=0,
        max_inflight=4,
    )
    pipeline.start()

    try:
        pipeline.signal_new_entries()
        # Allow pipeline to stream optimistically
        timeout = 2.0
        start_t = asyncio.get_event_loop().time()
        while pipeline.match_index < 20:
            if asyncio.get_event_loop().time() - start_t > timeout:
                raise TimeoutError(f"Pipeline stalled: match_index={pipeline.match_index}/20")
            await asyncio.sleep(0.01)

        assert pipeline.match_index == 20
        assert pipeline.next_index == 21
        assert len(transport.sent_batches) > 0

    finally:
        await pipeline.stop()


# =============================================================================
# 4. Strict Raft Commit Barrier Invariant Tests
# =============================================================================


@pytest.mark.asyncio
async def test_strict_commit_barrier_invariant(tmp_path: Path):
    """
    Raft Safety Invariant:
    A leader cannot advance commit_index or resolve client futures until entries
    are BOTH:
    1. Acknowledged by a majority quorum.
    2. Physically fsynced to its local disk WAL (persisted_index).
    """
    wal_file = str(tmp_path / "barrier.wal")
    # Set delay high so disk write does not complete immediately
    wal = GroupCommitWAL(wal_path=wal_file, max_delay_ms=200.0)
    cache = InflightLogCache(capacity=100)

    class ControllableTransport:
        def __init__(self):
            self.peer_ack_callback = None

        async def send_append_entries(self, peer: str, prev_log_index: int, prev_log_term: int, entries: List[CachedEntry]):
            class AckReply:
                success = True
                conflict_index = 0
            return AckReply()

    transport = ControllableTransport()
    coordinator = RaftEngineCommitCoordinator(
        node_id="leader",
        peers=["peer-1", "peer-2"],
        wal=wal,
        cache=cache,
        transport=transport,
    )
    coordinator.start()

    try:
        # 1. Propose entry 1
        idx, _ = await wal.submit(term=1, command="TEST_LOCK", payload=b"payload_1")
        fut = asyncio.get_running_loop().create_future()
        coordinator._commit_waiters[idx] = fut
        cache.append(CachedEntry(index=idx, term=1, command="TEST_LOCK", payload=b"payload_1"))

        # Peers acknowledge immediately!
        coordinator.on_peer_ack("peer-1", 1)
        coordinator.on_peer_ack("peer-2", 1)

        # But WAL disk fsync is still pending! persisted_index is 0.
        assert wal.persisted_index == 0

        # Enforce the barrier
        coordinator._evaluate_commit_barrier()

        # BARRIER INVARIANT CHECK:
        # Despite unanimous peer ACKs, commit_index MUST NOT advance and client future must NOT be done!
        assert coordinator.commit_index == 0
        assert not fut.done()

        # 2. Now trigger local disk WAL persistence
        wal.persisted_index = 1
        coordinator.on_wal_persisted(1)

        # Now that both quorum ACKs AND local fsync are satisfied:
        assert coordinator.commit_index == 1
        assert fut.done()
        result = await fut
        assert result == {"status": "COMMITTED", "index": 1}

    finally:
        await coordinator.stop()


# =============================================================================
# 5. End-to-End Consensus & State Machine Integration Test
# =============================================================================


@pytest.mark.asyncio
async def test_end_to_end_coordinator_consensus(tmp_path: Path):
    wal_file = str(tmp_path / "e2e.wal")
    wal = GroupCommitWAL(wal_path=wal_file, max_delay_ms=2.0)
    cache = InflightLogCache(capacity=1000)

    class FastClusterTransport:
        async def send_append_entries(self, peer: str, prev_log_index: int, prev_log_term: int, entries: List[CachedEntry]):
            class AckReply:
                success = True
                conflict_index = 0
            return AckReply()

    applied_entries: List[CachedEntry] = []

    def state_machine_apply(entry: CachedEntry):
        applied_entries.append(entry)

    coordinator = RaftEngineCommitCoordinator(
        node_id="leader-node",
        peers=["follower-1", "follower-2"],
        wal=wal,
        cache=cache,
        transport=FastClusterTransport(),
        on_apply=state_machine_apply,
    )
    coordinator.start()

    try:
        # Submit 30 concurrent proposals through coordinator
        num_commands = 30
        proposal_tasks = [
            coordinator.propose(f"OP_{i}", f'{{"val": {i}}}'.encode("utf-8"))
            for i in range(1, num_commands + 1)
        ]

        results = await asyncio.gather(*proposal_tasks)

        # All client futures resolved with COMMITTED
        for i, res in enumerate(results, start=1):
            assert res["status"] == "COMMITTED"
            assert res["index"] == i

        assert coordinator.commit_index == num_commands
        assert coordinator.last_applied == num_commands
        assert len(applied_entries) == num_commands
        for i, entry in enumerate(applied_entries, start=1):
            assert entry.index == i
            assert entry.command == f"OP_{i}"

    finally:
        await coordinator.stop()

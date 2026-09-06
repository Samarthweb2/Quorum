"""
Unit and integration tests for Raft Log Replication, Quorum Commits,
Follower Conflict Resolution, and the Figure 8 Safety Rule.
"""

import asyncio
from pathlib import Path
from typing import List
import pytest

from quorum.raft.node import RaftNode
from quorum.raft.storage import LogEntry
from quorum.raft.types import Role
from tests.fake_transport import FakeNetwork, FakeTransport


@pytest.fixture
def fake_network():
    return FakeNetwork()


@pytest.mark.asyncio
async def test_basic_log_replication_and_commit(tmp_path: Path, fake_network: FakeNetwork):
    node_ids = ["node-1", "node-2", "node-3"]
    nodes: dict[str, RaftNode] = {}
    applied_entries: dict[str, List[LogEntry]] = {nid: [] for nid in node_ids}

    for nid in node_ids:
        node = RaftNode(
            node_id=nid,
            peers=node_ids,
            data_dir=tmp_path / nid,
            min_election_timeout_s=0.1,
            max_election_timeout_s=0.2,
            heartbeat_interval_s=0.02,
        )
        node.set_transport(FakeTransport(nid, fake_network))
        fake_network.register_node(nid, node)
        
        # State machine callback
        def make_callback(n_id):
            return lambda entry: applied_entries[n_id].append(entry)
        
        node.on_apply_entry = make_callback(nid)
        nodes[nid] = node

    # Force node-1 to be leader
    nodes["node-1"].election_timer.set_fixed_timeout(0.02)
    nodes["node-2"].election_timer.set_fixed_timeout(0.20)
    nodes["node-3"].election_timer.set_fixed_timeout(0.20)

    for node in nodes.values():
        await node.start()

    try:
        await asyncio.sleep(0.05)
        assert nodes["node-1"].role == Role.LEADER

        # Propose 3 commands
        fut1 = await nodes["node-1"].propose("ACQUIRE", {"key": "db_lock", "client": "worker-1"}, timestamp_ms=100)
        fut2 = await nodes["node-1"].propose("RENEW", {"key": "db_lock", "client": "worker-1"}, timestamp_ms=200)
        fut3 = await nodes["node-1"].propose("RELEASE", {"key": "db_lock", "client": "worker-1"}, timestamp_ms=300)

        res1 = await asyncio.wait_for(fut1, timeout=0.5)
        res2 = await asyncio.wait_for(fut2, timeout=0.5)
        res3 = await asyncio.wait_for(fut3, timeout=0.5)

        assert res1 is True
        assert res2 is True
        assert res3 is True

        # Wait for followers to receive heartbeats and apply commits
        await asyncio.sleep(0.06)

        for nid, node in nodes.items():
            assert node.commit_index == 3
            assert node.last_applied == 3
            assert len(applied_entries[nid]) == 3
            assert applied_entries[nid][0].command_type == "ACQUIRE"
            assert applied_entries[nid][1].command_type == "RENEW"
            assert applied_entries[nid][2].command_type == "RELEASE"
    finally:
        for node in nodes.values():
            await node.stop()


@pytest.mark.asyncio
async def test_follower_log_repair_on_conflict(tmp_path: Path, fake_network: FakeNetwork):
    """
    Follower has conflicting uncommitted entries from a previous term.
    Leader must detect conflict and overwrite follower's uncommitted entries.
    """
    node_ids = ["node-1", "node-2", "node-3"]
    nodes: dict[str, RaftNode] = {}

    for nid in node_ids:
        node = RaftNode(
            node_id=nid,
            peers=node_ids,
            data_dir=tmp_path / nid,
            manual_timer_mode=True,
        )
        node.set_transport(FakeTransport(nid, fake_network))
        fake_network.register_node(nid, node)
        nodes[nid] = node

    # Pre-populate node-3 with conflicting entries
    nodes["node-3"].log_storage.append_entries([
        LogEntry(index=1, term=1, command_type="CMD1"),
        LogEntry(index=2, term=1, command_type="CONFLICTING_CMD2"),
        LogEntry(index=3, term=1, command_type="CONFLICTING_CMD3"),
    ])

    for node in nodes.values():
        await node.start()

    try:
        # Set node-1 to term 1 so election makes it leader in term 2
        nodes["node-1"].current_term = 1
        await nodes["node-1"]._on_election_timeout()
        assert nodes["node-1"].role == Role.LEADER
        assert nodes["node-1"].current_term == 2

        # Node-1 proposes entries at index 1, 2, 3 in Term 2
        fut1 = await nodes["node-1"].propose("CORRECT_CMD1")
        fut2 = await nodes["node-1"].propose("CORRECT_CMD2")
        fut3 = await nodes["node-1"].propose("CORRECT_CMD3")

        await asyncio.gather(fut1, fut2, fut3)

        # Trigger heartbeat to node-3 to repair its log
        # Node-3 will reject prev_log_index=3 (term mismatch), leader decrements next_index to 1,
        # follower truncates suffix at index 1 (term 1 != term 2) and adopts leader's log
        for _ in range(3):
            await nodes["node-1"]._broadcast_append_entries()
            await asyncio.sleep(0.03)

        # Verify node-3's log has been repaired to match leader's log
        assert len(nodes["node-3"].log_storage) == 3
        assert nodes["node-3"].log_storage.get_entry(1).command_type == "CORRECT_CMD1"
        assert nodes["node-3"].log_storage.get_entry(1).term == 2
        assert nodes["node-3"].log_storage.get_entry(2).command_type == "CORRECT_CMD2"
        assert nodes["node-3"].log_storage.get_entry(3).command_type == "CORRECT_CMD3"
    finally:
        for node in nodes.values():
            await node.stop()


@pytest.mark.asyncio
async def test_figure_8_safety_rule(tmp_path: Path, fake_network: FakeNetwork):
    """
    Explicit test of the Figure 8 scenario from Raft Paper Section 5.4.2:
    A leader cannot commit a log entry from a previous term simply because
    it is stored on a majority of servers. Only current-term entries can be
    committed by counting replicas directly; older entries are committed indirectly.
    """
    node_ids = [f"node-{i}" for i in range(1, 6)]
    nodes: dict[str, RaftNode] = {}

    for nid in node_ids:
        node = RaftNode(
            node_id=nid,
            peers=node_ids,
            data_dir=tmp_path / nid,
            manual_timer_mode=True,
        )
        node.set_transport(FakeTransport(nid, fake_network))
        fake_network.register_node(nid, node)
        nodes[nid] = node

    # Step (a): S1 is leader in Term 2 with entries:
    # index 1 (term 1) committed, index 2 (term 2) partially replicated to S1 and S2
    for nid in ["node-1", "node-2"]:
        nodes[nid].log_storage.append_entries([
            LogEntry(index=1, term=1, command_type="CMD_T1"),
            LogEntry(index=2, term=2, command_type="CMD_T2"),
        ])
    for nid in ["node-3", "node-4", "node-5"]:
        nodes[nid].log_storage.append_entries([
            LogEntry(index=1, term=1, command_type="CMD_T1"),
        ])

    for node in nodes.values():
        node.commit_index = 1
        node.last_applied = 1
        await node.start()

    try:
        # S1 becomes leader in Term 4 (votes from S1, S2, S3)
        nodes["node-1"].current_term = 3  # will increment to 4 on election
        await nodes["node-1"]._on_election_timeout()
        assert nodes["node-1"].role == Role.LEADER
        assert nodes["node-1"].current_term == 4

        # S1 replicates its old Term 2 entry (index 2) to S3
        # Match index on node-2 is 2, and now node-3 gets index 2
        nodes["node-1"].next_index["node-3"] = 2
        await nodes["node-1"]._broadcast_append_entries()
        await asyncio.sleep(0.05)

        # Index 2 (term 2) is now replicated on S1, S2, S3 (majority 3/5)!
        # BUT because index 2 has term 2 != current_term (4), Raft Section 5.4.2
        # mandates that S1 MUST NOT advance commit_index to 2 directly!
        assert nodes["node-1"].commit_index == 1, (
            f"FIGURE 8 VIOLATION: Leader committed previous term entry directly! "
            f"commit_index={nodes['node-1'].commit_index}"
        )

        # Now S1 proposes a NEW entry in its current term (Term 4) at index 3
        fut = await nodes["node-1"].propose("CMD_T4")
        # Replicate to majority (S1, S2, S3)
        await asyncio.wait_for(fut, timeout=0.5)

        # NOW both index 2 (term 2) AND index 3 (term 4) are safely committed!
        assert nodes["node-1"].commit_index == 3
        assert nodes["node-1"].log_storage.get_entry(2).command_type == "CMD_T2"
        assert nodes["node-1"].log_storage.get_entry(3).command_type == "CMD_T4"
    finally:
        for node in nodes.values():
            await node.stop()

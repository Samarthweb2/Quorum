"""
Unit and integration tests for Raft Leader Election in isolation using in-memory FakeTransport.
"""

import asyncio
from pathlib import Path
import pytest

from quorum.raft.node import RaftNode
from quorum.raft.storage import LogEntry
from quorum.raft.types import Role
from tests.fake_transport import FakeNetwork, FakeTransport


@pytest.fixture
def fake_network():
    return FakeNetwork()


@pytest.mark.asyncio
async def test_single_node_cluster_election(tmp_path: Path, fake_network: FakeNetwork):
    node = RaftNode(
        node_id="node-1",
        peers=[],
        data_dir=tmp_path / "node1",
        min_election_timeout_s=0.02,
        max_election_timeout_s=0.04,
    )
    node.set_transport(FakeTransport("node-1", fake_network))
    fake_network.register_node("node-1", node)

    await node.start()
    try:
        # Wait for election to trigger
        await asyncio.sleep(0.08)
        assert node.role == Role.LEADER
        assert node.leader_id == "node-1"
        assert node.current_term >= 1
    finally:
        await node.stop()


@pytest.mark.asyncio
async def test_three_node_cluster_deterministic_election(tmp_path: Path, fake_network: FakeNetwork):
    node_ids = ["node-1", "node-2", "node-3"]
    nodes: dict[str, RaftNode] = {}

    for i, nid in enumerate(node_ids):
        node = RaftNode(
            node_id=nid,
            peers=node_ids,
            data_dir=tmp_path / nid,
            min_election_timeout_s=0.1,
            max_election_timeout_s=0.2,
            heartbeat_interval_s=0.02,
        )
        transport = FakeTransport(nid, fake_network)
        node.set_transport(transport)
        fake_network.register_node(nid, node)
        nodes[nid] = node

    # Make node-1 timeout first deterministically
    nodes["node-1"].election_timer.set_fixed_timeout(0.03)
    nodes["node-2"].election_timer.set_fixed_timeout(0.15)
    nodes["node-3"].election_timer.set_fixed_timeout(0.15)

    for node in nodes.values():
        await node.start()

    try:
        # Wait for election and initial heartbeats
        await asyncio.sleep(0.08)

        # Node 1 should have won election
        assert nodes["node-1"].role == Role.LEADER
        assert nodes["node-1"].current_term == 1
        assert nodes["node-1"].leader_id == "node-1"

        # Node 2 and Node 3 should be followers recognizing node-1
        assert nodes["node-2"].role == Role.FOLLOWER
        assert nodes["node-2"].leader_id == "node-1"
        assert nodes["node-2"].current_term == 1

        assert nodes["node-3"].role == Role.FOLLOWER
        assert nodes["node-3"].leader_id == "node-1"
        assert nodes["node-3"].current_term == 1
    finally:
        for node in nodes.values():
            await node.stop()


@pytest.mark.asyncio
async def test_leader_failure_and_reelection(tmp_path: Path, fake_network: FakeNetwork):
    node_ids = ["node-1", "node-2", "node-3"]
    nodes: dict[str, RaftNode] = {}

    for nid in node_ids:
        node = RaftNode(
            node_id=nid,
            peers=node_ids,
            data_dir=tmp_path / nid,
            min_election_timeout_s=0.05,
            max_election_timeout_s=0.10,
            heartbeat_interval_s=0.02,
        )
        node.set_transport(FakeTransport(nid, fake_network))
        fake_network.register_node(nid, node)
        nodes[nid] = node

    nodes["node-1"].election_timer.set_fixed_timeout(0.02)
    nodes["node-2"].election_timer.set_fixed_timeout(0.08)
    nodes["node-3"].election_timer.set_fixed_timeout(0.08)

    for node in nodes.values():
        await node.start()

    try:
        await asyncio.sleep(0.05)
        assert nodes["node-1"].role == Role.LEADER
        term1 = nodes["node-1"].current_term

        # Kill leader node-1
        await nodes["node-1"].stop()
        fake_network.unregister_node("node-1")

        # Give node-2 a shorter timeout to become new leader
        nodes["node-2"].election_timer.set_fixed_timeout(0.04)
        nodes["node-3"].election_timer.set_fixed_timeout(0.12)
        nodes["node-2"].election_timer.reset()

        # Wait up to 0.4s for node-2 to win re-election
        for _ in range(10):
            if nodes["node-2"].role == Role.LEADER:
                break
            await asyncio.sleep(0.04)

        # Node 2 should become new leader in Term 2
        assert nodes["node-2"].role == Role.LEADER
        assert nodes["node-2"].current_term > term1
        assert nodes["node-3"].role == Role.FOLLOWER
        assert nodes["node-3"].leader_id == "node-2"
        assert nodes["node-3"].current_term == nodes["node-2"].current_term
    finally:
        for node in nodes.values():
            if node.is_running:
                await node.stop()


@pytest.mark.asyncio
async def test_candidate_up_to_date_log_check(tmp_path: Path, fake_network: FakeNetwork):
    """
    Raft Section 5.4.1: If logs have last entries with different terms,
    the log with later term is more up-to-date.
    If logs end with same term, whichever log is longer is more up-to-date.
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

    # Give node-2 a longer log at term 2
    nodes["node-2"].log_storage.append_entries([
        LogEntry(index=1, term=1, command_type="CMD1"),
        LogEntry(index=2, term=2, command_type="CMD2"),
    ])
    # Give node-1 a shorter/stale log (only term 1)
    nodes["node-1"].log_storage.append_entries([
        LogEntry(index=1, term=1, command_type="CMD1"),
    ])
    # Give node-3 same log as node-2
    nodes["node-3"].log_storage.append_entries([
        LogEntry(index=1, term=1, command_type="CMD1"),
        LogEntry(index=2, term=2, command_type="CMD2"),
    ])

    for node in nodes.values():
        await node.start()

    try:
        # Trigger node-1 (stale log) to start election
        await nodes["node-1"]._on_election_timeout()

        # Node 2 and 3 should deny vote because node-1's log is stale
        assert nodes["node-1"].role == Role.CANDIDATE  # Couldn't win quorum
        assert nodes["node-2"].voted_for != "node-1"
        assert nodes["node-3"].voted_for != "node-1"

        # Now trigger node-2 (up-to-date log) to start election
        await nodes["node-2"]._on_election_timeout()

        # Node 2 should win election because node-3 grants vote
        assert nodes["node-2"].role == Role.LEADER
    finally:
        for node in nodes.values():
            await node.stop()


@pytest.mark.asyncio
async def test_leader_higher_term_stepdown(tmp_path: Path, fake_network: FakeNetwork):
    node_ids = ["node-1", "node-2"]
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

    for node in nodes.values():
        await node.start()

    try:
        # Make node-1 leader in term 1
        await nodes["node-1"]._on_election_timeout()
        assert nodes["node-1"].role == Role.LEADER
        assert nodes["node-1"].current_term == 1

        # Node-2 starts election in term 2
        await nodes["node-2"]._on_election_timeout()

        # Node-1 should step down to follower
        assert nodes["node-1"].role == Role.FOLLOWER
        assert nodes["node-1"].current_term >= 2
    finally:
        for node in nodes.values():
            await node.stop()

@pytest.mark.asyncio
async def test_five_node_cluster_election(tmp_path: Path, fake_network: FakeNetwork):
    node_ids = [f"node-{i}" for i in range(1, 6)]
    nodes: dict[str, RaftNode] = {}

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
        nodes[nid] = node

    nodes["node-1"].election_timer.set_fixed_timeout(0.02)
    for i in range(2, 6):
        nodes[f"node-{i}"].election_timer.set_fixed_timeout(0.15)

    for node in nodes.values():
        await node.start()

    try:
        await asyncio.sleep(0.06)
        assert nodes["node-1"].role == Role.LEADER
        assert nodes["node-1"].current_term == 1
        for i in range(2, 6):
            assert nodes[f"node-{i}"].role == Role.FOLLOWER
            assert nodes[f"node-{i}"].leader_id == "node-1"
    finally:
        for node in nodes.values():
            await node.stop()


@pytest.mark.asyncio
async def test_split_vote_randomized_recovery(tmp_path: Path, fake_network: FakeNetwork):
    node_ids = ["node-1", "node-2", "node-3"]
    nodes: dict[str, RaftNode] = {}

    for nid in node_ids:
        node = RaftNode(
            node_id=nid,
            peers=node_ids,
            data_dir=tmp_path / nid,
            min_election_timeout_s=0.04,
            max_election_timeout_s=0.10,
            heartbeat_interval_s=0.015,
        )
        node.set_transport(FakeTransport(nid, fake_network))
        fake_network.register_node(nid, node)
        nodes[nid] = node

    for node in nodes.values():
        await node.start()

    try:
        # With randomized timers (0.04 - 0.10s), wait up to 0.8s for leader to emerge
        leader = None
        for _ in range(20):
            leaders = [n for n in nodes.values() if n.role == Role.LEADER]
            if len(leaders) == 1:
                leader = leaders[0]
                break
            await asyncio.sleep(0.04)

        assert leader is not None, "A single leader should have emerged from randomized election"

        for node in nodes.values():
            if node != leader:
                assert node.role == Role.FOLLOWER
                assert node.leader_id == leader.node_id
    finally:
        for node in nodes.values():
            await node.stop()


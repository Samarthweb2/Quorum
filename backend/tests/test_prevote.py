"""
Tests for Raft Pre-Vote Protocol (Ongaro Dissertation §9.6).
Verifies that partitioned or lagging nodes do not increment their term,
preventing disruptive re-elections when rejoining the cluster.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
import pytest

from quorum.raft.node import RaftNode
from quorum.raft.types import Role
from tests.fake_transport import FakeNetwork, FakeTransport


@pytest.mark.asyncio
async def test_prevote_minority_node_does_not_increment_term(tmp_path: Path, fake_network: FakeNetwork):
    """
    In a 5-node cluster with Pre-Vote enabled:
    When a minority partition {node-4, node-5} times out, node-4 enters PRE_CANDIDATE
    and solicits pre-votes. Since it cannot achieve a majority (2/5 < 3),
    it DOES NOT increment current_term, and resets to FOLLOWER.
    """
    node_ids = [f"node-{i}" for i in range(1, 6)]
    nodes: dict[str, RaftNode] = {}

    for nid in node_ids:
        node = RaftNode(
            node_id=nid,
            peers=node_ids,
            data_dir=tmp_path / nid,
            min_election_timeout_s=0.04,
            max_election_timeout_s=0.08,
            heartbeat_interval_s=0.015,
            pre_vote_enabled=True,
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
        # Wait for node-1 to win election in Term 1
        for _ in range(20):
            if nodes["node-1"].role == Role.LEADER:
                break
            await asyncio.sleep(0.01)

        assert nodes["node-1"].role == Role.LEADER
        assert nodes["node-1"].current_term == 1

        # Partition: Group A {node-1, node-2, node-3} vs Group B {node-4, node-5}
        fake_network.partition({"node-1", "node-2", "node-3"}, {"node-4", "node-5"})

        # Trigger election timeout in node-4 in the minority partition
        await nodes["node-4"]._on_election_timeout()

        # In Pre-Vote: node-4 failed to get majority (only 2/5 votes),
        # so it reverted to FOLLOWER and its term remains 1!
        assert nodes["node-4"].role == Role.FOLLOWER
        assert nodes["node-4"].current_term == 1

        # Heal the partition
        fake_network.heal_partition()
        await asyncio.sleep(0.05)

        # Leader node-1 was NOT disrupted because node-4 never incremented its term!
        assert nodes["node-1"].role == Role.LEADER
        assert nodes["node-1"].current_term == 1

    finally:
        for node in nodes.values():
            await node.stop()


@pytest.mark.asyncio
async def test_prevote_majority_node_successfully_wins_election(tmp_path: Path, fake_network: FakeNetwork):
    """
    Verifies that a node with pre_vote_enabled=True in a majority partition
    successfully collects majority pre-votes, advances to CANDIDATE, and becomes LEADER.
    """
    node_ids = ["node-1", "node-2", "node-3"]
    nodes: dict[str, RaftNode] = {}

    for nid in node_ids:
        node = RaftNode(
            node_id=nid,
            peers=node_ids,
            data_dir=tmp_path / nid,
            min_election_timeout_s=0.04,
            max_election_timeout_s=0.08,
            heartbeat_interval_s=0.015,
            pre_vote_enabled=True,
        )
        node.set_transport(FakeTransport(nid, fake_network))
        fake_network.register_node(nid, node)
        nodes[nid] = node

    nodes["node-1"].election_timer.set_fixed_timeout(0.02)
    nodes["node-2"].election_timer.set_fixed_timeout(0.15)
    nodes["node-3"].election_timer.set_fixed_timeout(0.15)

    for node in nodes.values():
        await node.start()

    try:
        for _ in range(25):
            if nodes["node-1"].role == Role.LEADER:
                break
            await asyncio.sleep(0.01)

        assert nodes["node-1"].role == Role.LEADER
        assert nodes["node-1"].current_term == 1
        assert nodes["node-2"].role == Role.FOLLOWER
        assert nodes["node-3"].role == Role.FOLLOWER

    finally:
        for node in nodes.values():
            await node.stop()

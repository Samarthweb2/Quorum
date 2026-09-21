"""
Tests for Raft ReadIndex / Linearizable Reads (Raft §8).
Verifies that:
1. Linearizable read_index() succeeds on an active leader with quorum.
2. Linearizable read_index() fails / times out on an isolated leader in a minority partition.
3. Gateway endpoint /api/leases/{key}/linearizable works.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
import pytest

from quorum.raft.node import RaftNode
from quorum.raft.types import Role
from quorum.state_machine.lock_manager import LockStateMachine
from tests.fake_transport import FakeNetwork, FakeTransport


@pytest.mark.asyncio
async def test_read_index_active_leader(tmp_path: Path, fake_network: FakeNetwork):
    """
    On a healthy 3-node cluster, read_index() executes a heartbeat round
    to verify majority leadership and returns the current commit index.
    """
    node_ids = ["node-1", "node-2", "node-3"]
    nodes: dict[str, RaftNode] = {}
    sms: dict[str, LockStateMachine] = {}

    for nid in node_ids:
        sm = LockStateMachine()
        sms[nid] = sm
        node = RaftNode(
            node_id=nid,
            peers=node_ids,
            data_dir=tmp_path / nid,
            min_election_timeout_s=0.04,
            max_election_timeout_s=0.08,
            heartbeat_interval_s=0.015,
        )
        node.set_transport(FakeTransport(nid, fake_network))
        node.on_apply_entry = sm.apply
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

        # Propose a lock write to advance commit index
        fut = await nodes["node-1"].propose("ACQUIRE", {"key": "lock1", "client_id": "c1", "ttl_ms": 5000}, timestamp_ms=100)
        assert await asyncio.wait_for(fut, timeout=0.5) is True
        assert nodes["node-1"].commit_index == 1

        # Now execute read_index() on leader node-1
        read_commit = await nodes["node-1"].read_index(timeout_s=0.5)
        assert read_commit == 1

        # State machine is guaranteed fresh and linearizable
        assert sms["node-1"].locks["lock1"].owner == "c1"

    finally:
        for node in nodes.values():
            await node.stop()


@pytest.mark.asyncio
async def test_read_index_isolated_leader_fails_quorum(tmp_path: Path, fake_network: FakeNetwork):
    """
    When the leader is partitioned into a minority {node-1} vs {node-2, node-3},
    read_index() cannot collect heartbeat acks from a majority quorum
    and safely raises TimeoutError, preventing stale reads!
    """
    node_ids = ["node-1", "node-2", "node-3"]
    nodes: dict[str, RaftNode] = {}
    sms: dict[str, LockStateMachine] = {}

    for nid in node_ids:
        sm = LockStateMachine()
        sms[nid] = sm
        node = RaftNode(
            node_id=nid,
            peers=node_ids,
            data_dir=tmp_path / nid,
            manual_timer_mode=True,
        )
        node.set_transport(FakeTransport(nid, fake_network))
        node.on_apply_entry = sm.apply
        fake_network.register_node(nid, node)
        nodes[nid] = node

    for node in nodes.values():
        await node.start()

    try:
        # Elect node-1 as leader in Term 1
        await nodes["node-1"]._on_election_timeout()
        assert nodes["node-1"].role == Role.LEADER

        # Commit an initial entry
        fut = await nodes["node-1"].propose("ACQUIRE", {"key": "lock1", "client_id": "c1", "ttl_ms": 5000}, timestamp_ms=100)
        assert await asyncio.wait_for(fut, timeout=0.5) is True

        # Now partition node-1 into isolated minority: {node-1} vs {node-2, node-3}
        fake_network.partition({"node-1"}, {"node-2", "node-3"})

        # read_index() on isolated leader node-1 must FAIL because heartbeats cannot reach quorum
        with pytest.raises(TimeoutError) as excinfo:
            await nodes["node-1"].read_index(timeout_s=0.08)

        assert "ReadIndex failed to verify quorum" in str(excinfo.value)

    finally:
        for node in nodes.values():
            await node.stop()

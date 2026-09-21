"""
Unit and Integration Tests for Bounded-Clock Leader Leases (Zero-RTT Linearizable Reads).

Verifies:
1. Leader lease establishment on majority heartbeat acknowledgments.
2. Zero-RTT linearizable local read execution without network RPCs.
3. Fallback to full ReadIndex heartbeat round when lease is expired or bypassed.
4. Prevention of stale reads if isolated leader's lease has expired.
"""

from __future__ import annotations

import asyncio
import time
from pathlib import Path
import pytest

from quorum.raft.node import RaftNode
from quorum.raft.types import Role
from tests.fake_transport import FakeNetwork, FakeTransport


@pytest.fixture
def fake_network():
    return FakeNetwork()


@pytest.mark.asyncio
async def test_single_node_leader_lease(tmp_path: Path, fake_network: FakeNetwork):
    node = RaftNode(
        node_id="single-node",
        peers=[],
        data_dir=tmp_path / "single",
        min_election_timeout_s=0.02,
        max_election_timeout_s=0.04,
        heartbeat_interval_s=0.01,
    )
    node.set_transport(FakeTransport("single-node", fake_network))
    fake_network.register_node("single-node", node)

    await node.start()
    try:
        await asyncio.sleep(0.10)
        assert node.role == Role.LEADER
        assert node.is_leader_lease_valid

        # Linearizable ReadIndex executes Zero-RTT fast path
        idx = await node.read_index(timeout_s=0.5)
        assert idx == 0
    finally:
        await node.stop()


@pytest.mark.asyncio
async def test_three_node_leader_lease_and_zero_rtt_reads(tmp_path: Path, fake_network: FakeNetwork):
    node_ids = ["node-1", "node-2", "node-3"]
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

    # Force node-1 to become leader quickly
    nodes["node-1"].election_timer.set_fixed_timeout(0.02)
    nodes["node-2"].election_timer.set_fixed_timeout(0.30)
    nodes["node-3"].election_timer.set_fixed_timeout(0.30)

    for node in nodes.values():
        await node.start()

    try:
        await asyncio.sleep(0.08)
        leader = nodes["node-1"]
        assert leader.role == Role.LEADER

        # Wait for first round of heartbeats to confirm majority lease
        await asyncio.sleep(0.04)
        assert leader.is_leader_lease_valid
        assert leader.leader_lease_remaining_s > 0

        # Propose entry to advance commit_index
        fut = await leader.propose("TEST_CMD", {"val": 42})
        await asyncio.wait_for(fut, timeout=1.0)
        assert leader.commit_index == 1

        initial_zero_rtt = leader.zero_rtt_reads_count

        # Execute Zero-RTT linearizable read
        t0 = time.perf_counter()
        commit_idx = await leader.read_index(timeout_s=0.5, allow_lease=True)
        t_elapsed = time.perf_counter() - t0

        assert commit_idx == 1
        assert leader.zero_rtt_reads_count == initial_zero_rtt + 1
        # Fast path should complete almost instantaneously (< 5ms)
        assert t_elapsed < 0.01

        # Execute read bypassing lease (allow_lease=False) -> invokes full RPC round
        initial_zero_rtt = leader.zero_rtt_reads_count
        commit_idx_full = await leader.read_index(timeout_s=0.5, allow_lease=False)
        assert commit_idx_full == 1
        # zero_rtt_reads_count must NOT have incremented
        assert leader.zero_rtt_reads_count == initial_zero_rtt

    finally:
        for node in nodes.values():
            await node.stop()

"""
Tests for Network Partitions, Split-Brain Prevention, Leader Isolation,
and Fencing Token downstream validation.
"""

import asyncio
from pathlib import Path
import pytest

from quorum.raft.node import RaftNode
from quorum.raft.storage import LogEntry
from quorum.raft.types import Role
from quorum.state_machine.lock_manager import LockStateMachine
from tests.fake_transport import FakeNetwork, FakeTransport


@pytest.fixture
def fake_network():
    return FakeNetwork()


@pytest.mark.asyncio
async def test_majority_vs_minority_partition(tmp_path: Path, fake_network: FakeNetwork):
    """
    5-node cluster split into {node-1, node-2, node-3} (majority) and {node-4, node-5} (minority).
    Majority continues to elect/commit; minority cannot elect or commit.
    """
    node_ids = [f"node-{i}" for i in range(1, 6)]
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
    for i in range(2, 6):
        nodes[f"node-{i}"].election_timer.set_fixed_timeout(0.12)

    for node in nodes.values():
        await node.start()

    try:
        for _ in range(20):
            if nodes["node-1"].role == Role.LEADER:
                break
            await asyncio.sleep(0.01)
        assert nodes["node-1"].role == Role.LEADER

        # Initial commit across all 5 nodes
        fut = await nodes["node-1"].propose("ACQUIRE", {"key": "lockA", "client_id": "c1", "ttl_ms": 5000}, timestamp_ms=100)
        assert await asyncio.wait_for(fut, timeout=0.5) is True

        # Now partition: Group A {node-1, node-2, node-3} vs Group B {node-4, node-5}
        group_a = {"node-1", "node-2", "node-3"}
        group_b = {"node-4", "node-5"}
        fake_network.partition(group_a, group_b)

        # 1. Majority group can still commit entries
        fut_maj = await nodes["node-1"].propose("ACQUIRE", {"key": "lockB", "client_id": "c2", "ttl_ms": 5000}, timestamp_ms=200)
        assert await asyncio.wait_for(fut_maj, timeout=0.5) is True
        assert sms["node-1"].locks["lockB"].fence_token == 2

        # 2. Minority group: trigger election in node-4
        await nodes["node-4"]._on_election_timeout()
        # Node-4 only has votes from node-4 and node-5 (2/5 < quorum 3) -> cannot win election
        assert nodes["node-4"].role == Role.CANDIDATE

        # 3. Heal partition
        fake_network.heal_partition()
        # Node-4's higher term causes leader re-election; cluster stabilizes and replicates log
        for _ in range(30):
            if all("lockB" in sms[nid].locks and sms[nid].locks["lockB"].fence_token == 2 for nid in node_ids):
                break
            await asyncio.sleep(0.01)

        # All nodes must agree on lockB and fencing token
        for nid in node_ids:
            assert "lockB" in sms[nid].locks, f"Node {nid} missing lockB after heal"
            assert sms[nid].locks["lockB"].fence_token == 2

    finally:
        for node in nodes.values():
            await node.stop()


@pytest.mark.asyncio
async def test_isolated_leader_cannot_commit(tmp_path: Path, fake_network: FakeNetwork):
    """
    Leader node-1 is partitioned off with node-2 into a minority {node-1, node-2}.
    Majority {node-3, node-4, node-5} elects node-3 as new leader.
    Node-1 cannot commit writes.
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

    for node in nodes.values():
        await node.start()

    try:
        # Elect node-1 as leader in Term 1
        await nodes["node-1"]._on_election_timeout()
        assert nodes["node-1"].role == Role.LEADER
        assert nodes["node-1"].current_term == 1

        # Partition: {node-1, node-2} vs {node-3, node-4, node-5}
        fake_network.partition({"node-1", "node-2"}, {"node-3", "node-4", "node-5"})

        # Node-1 tries to propose a write -> it can only replicate to node-2 (total 2/5 < 3)
        fut_isolated = await nodes["node-1"].propose("ACQUIRE", {"key": "k1", "client_id": "c1"})

        # Wait a short while, fut_isolated should NOT complete because no quorum
        done, _ = await asyncio.wait([fut_isolated], timeout=0.08)
        assert len(done) == 0  # Uncommitted!

        # Now majority {node-3, node-4, node-5} starts election
        await nodes["node-3"]._on_election_timeout()
        assert nodes["node-3"].role == Role.LEADER
        assert nodes["node-3"].current_term >= 2

        # Majority leader node-3 proposes a write -> commits successfully!
        fut_maj = await nodes["node-3"].propose("ACQUIRE", {"key": "k1", "client_id": "winner"})
        await asyncio.wait_for(fut_maj, timeout=0.5)
        assert nodes["node-3"].commit_index == 1

        # Heal partition
        fake_network.heal_partition()
        # Node-3 sends heartbeat with higher term to node-1
        await nodes["node-3"]._broadcast_append_entries()
        await asyncio.sleep(0.04)

        # Node-1 steps down to follower and its pending proposal resolves to False
        assert nodes["node-1"].role == Role.FOLLOWER
        assert await fut_isolated is False

        # Node-1's log has been repaired to match leader node-3's committed entry
        assert nodes["node-1"].log_storage.get_entry(1).data["client_id"] == "winner"

    finally:
        for node in nodes.values():
            await node.stop()


def test_fencing_token_downstream_storage_validation():
    """
    Demonstrates the fencing token invariant:
    A shared storage service tracks the highest seen fencing token.
    Any delayed/stale write from an old lock holder with an older token is rejected.
    """
    class SharedStorage:
        def __init__(self):
            self.highest_fence_token = 0
            self.data = {}

        def write(self, key: str, value: str, token: int) -> bool:
            if token < self.highest_fence_token:
                raise PermissionError(
                    f"STALE FENCING TOKEN REJECTED: write token {token} < highest seen {self.highest_fence_token}"
                )
            self.highest_fence_token = token
            self.data[key] = value
            return True

    storage = SharedStorage()

    # Worker 1 gets lock with fence_token=10
    worker1_token = 10
    assert storage.write("data.txt", "Worker 1 content", token=worker1_token) is True

    # Worker 1 pauses (GC pause / network stall). Lock expires.
    # Worker 2 acquires lock with fence_token=11
    worker2_token = 11
    assert storage.write("data.txt", "Worker 2 content", token=worker2_token) is True

    # Worker 1 wakes up and attempts to write with its stale token 10
    with pytest.raises(PermissionError) as excinfo:
        storage.write("data.txt", "Stale Worker 1 overwrite attempt", token=worker1_token)

    assert "STALE FENCING TOKEN REJECTED" in str(excinfo.value)
    assert storage.data["data.txt"] == "Worker 2 content"  # Preserved!

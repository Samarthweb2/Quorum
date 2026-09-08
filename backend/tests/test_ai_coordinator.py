"""
Unit and Integration Tests for Quorum AI Agent Coordination.
"""

import asyncio
import pytest
from quorum.ai.tools import (
    QuorumLockTool,
    QuorumAgentGuard,
    FencedStorageTarget,
    StaleFenceTokenException,
)
from quorum.ai.coordinator import AgentSwarmCoordinator
from quorum.gateway.cluster_controller import ClusterController


class MockClient:
    def __init__(self):
        self.fence_counter = 100
        self.locks = {}

    async def acquire_lock(self, key: str, client_id: str, ttl_ms: int = 5000):
        self.fence_counter += 1
        self.locks[key] = (client_id, self.fence_counter)
        return {
            "success": True,
            "status": "LOCK_ACQUIRED",
            "fence_token": self.fence_counter,
            "expires_at_ms": 9999999999,
        }

    async def renew_lock(self, key: str, client_id: str, fence_token: int, ttl_ms: int = 5000):
        return {"success": True, "fence_token": fence_token}

    async def release_lock(self, key: str, client_id: str, fence_token: int):
        self.locks.pop(key, None)
        return {"success": True, "fence_token": fence_token}


def test_quorum_lock_tool_schema():
    mock_client = MockClient()
    tool = QuorumLockTool(client=mock_client, agent_id="agent-test")
    assert tool.name == "quorum_distributed_lock"
    assert "distributed lock" in tool.description.lower()
    assert tool.args_schema is not None


@pytest.mark.asyncio
async def test_quorum_lock_tool_lifecycle():
    mock_client = MockClient()
    tool = QuorumLockTool(client=mock_client, agent_id="agent-test")

    # Acquire
    res = await tool._arun("acquire", "test-resource", ttl_ms=3000)
    assert res["success"] is True
    assert res["fence_token"] == 101

    # Renew
    res_renew = await tool._arun("renew", "test-resource", fence_token=101)
    assert res_renew["success"] is True

    # Release
    res_rel = await tool._arun("release", "test-resource", fence_token=101)
    assert res_rel["success"] is True
    assert "test-resource" not in mock_client.locks


@pytest.mark.asyncio
async def test_quorum_agent_guard_context_manager():
    mock_client = MockClient()
    async with QuorumAgentGuard(mock_client, "order-checkout", "agent-shopper", ttl_ms=2000, auto_renew=False) as guard:
        assert guard.fence_token == 101
        assert "order-checkout" in mock_client.locks

    # Lock should be released on exit
    assert "order-checkout" not in mock_client.locks


def test_fenced_storage_monotonic_safety():
    storage = FencedStorageTarget()
    storage.reset("shared-db", {"records": 10})

    # Token 10: initial write succeeds
    r1 = storage.execute_mutation("shared-db", "worker-1", 10, {"records": 5})
    assert r1["status"] == "COMMITTED"
    assert r1["result_state"]["records"] == 15
    assert storage.max_fence_tokens["shared-db"] == 10

    # Token 12: higher token succeeds
    r2 = storage.execute_mutation("shared-db", "worker-2", 12, {"records": -3})
    assert r2["status"] == "COMMITTED"
    assert r2["result_state"]["records"] == 12
    assert storage.max_fence_tokens["shared-db"] == 12

    # Token 11: stale token is REJECTED with StaleFenceTokenException
    with pytest.raises(StaleFenceTokenException) as exc_info:
        storage.execute_mutation("shared-db", "worker-zombie", 11, {"records": 100})

    assert "Fencing validation failed" in str(exc_info.value)
    assert "stale token #11" in str(exc_info.value)
    # State should remain untouched
    assert storage.storage["shared-db"]["records"] == 12



@pytest.mark.asyncio
async def test_coordinator_safe_swarm():
    controller = ClusterController(node_ids=["node-1", "node-2", "node-3"])
    await controller.initialize_cluster()

    try:
        # Wait for leader
        for _ in range(25):
            if controller.get_leader():
                break
            await asyncio.sleep(0.1)

        coordinator = AgentSwarmCoordinator(controller)
        res = await coordinator.run_safe_swarm("test-ledger")
        assert res["success"] is True
        assert len(res["steps"]) > 0
        assert res["max_fence_token"] >= 3
        assert res["final_state"]["balance_usd"] == 11950.0

    finally:
        await controller.shutdown()


@pytest.mark.asyncio
async def test_coordinator_zombie_mitigation():
    controller = ClusterController(node_ids=["node-1", "node-2", "node-3"])
    await controller.initialize_cluster()

    try:
        # Wait for leader
        for _ in range(25):
            if controller.get_leader():
                break
            await asyncio.sleep(0.1)

        coordinator = AgentSwarmCoordinator(controller)
        res = await coordinator.run_zombie_mitigation("zombie-ledger")
        assert res["success"] is True
        assert res["zombie_write_rejected"] is True
        assert res["token_alpha"] < res["token_beta"]

    finally:
        await controller.shutdown()

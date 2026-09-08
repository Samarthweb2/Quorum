"""
Tests for Quorum Gateway REST APIs, WebSocket streaming, and Chaos Simulator.
"""

import asyncio
import pytest
from httpx import AsyncClient, ASGITransport
from quorum.gateway import app as app_module
from quorum.gateway.cluster_controller import ClusterController


@pytest.fixture
async def client():
    # Explicitly ensure controller is initialized for ASGI transport tests
    if app_module.controller is None:
        app_module.controller = ClusterController(
            node_ids=["node-1", "node-2", "node-3", "node-4", "node-5"],
            on_broadcast_event=app_module.broadcast_to_websockets,
        )
        await app_module.controller.initialize_cluster()

    async with AsyncClient(transport=ASGITransport(app=app_module.app), base_url="http://test") as ac:
        # Allow leader election to settle
        for _ in range(20):
            stat = await ac.get("/api/cluster/status")
            if stat.status_code == 200 and stat.json().get("leader_id"):
                break
            await asyncio.sleep(0.05)
        yield ac


@pytest.mark.asyncio
async def test_gateway_cluster_status(client: AsyncClient):
    resp = await client.get("/api/cluster/status")
    assert resp.status_code == 200
    data = resp.json()

    assert data["total_nodes"] == 5
    assert len(data["nodes"]) == 5
    assert data["alive_nodes"] == 5
    assert data["health"] in ("HEALTHY", "ELECTION_IN_PROGRESS")


@pytest.mark.asyncio
async def test_gateway_lock_lifecycle(client: AsyncClient):
    # 1. Acquire Lock
    res = await client.post("/api/locks/acquire", json={
        "key": "test-distributed-lock",
        "client_id": "test-client-1",
        "ttl_ms": 3000,
    })
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["fence_token"] >= 1
    token = data["fence_token"]

    # 2. Status shows lock
    stat = await client.get("/api/cluster/status")
    locks = stat.json()["active_locks"]
    assert any(l["key"] == "test-distributed-lock" for l in locks)

    # 3. Renew Lock
    renew_res = await client.post("/api/locks/renew", json={
        "key": "test-distributed-lock",
        "client_id": "test-client-1",
        "fence_token": token,
        "ttl_ms": 4000,
    })
    assert renew_res.status_code == 200
    assert renew_res.json()["success"] is True

    # 4. Release Lock
    rel_res = await client.post("/api/locks/release", json={
        "key": "test-distributed-lock",
        "client_id": "test-client-1",
        "fence_token": token,
    })
    assert rel_res.status_code == 200
    assert rel_res.json()["success"] is True


@pytest.mark.asyncio
async def test_gateway_chaos_partition_and_heal(client: AsyncClient):
    # 1. Create 3 vs 2 partition
    res = await client.post("/api/chaos/partition", json={
        "partitions": [["node-1", "node-2", "node-3"], ["node-4", "node-5"]]
    })
    assert res.status_code == 200
    assert res.json()["success"] is True

    stat = await client.get("/api/cluster/status")
    assert stat.json()["is_partitioned"] is True

    # 2. Heal partition
    heal_res = await client.post("/api/chaos/heal")
    assert heal_res.status_code == 200
    assert heal_res.json()["success"] is True

    stat2 = await client.get("/api/cluster/status")
    assert stat2.json()["is_partitioned"] is False


@pytest.mark.asyncio
async def test_gateway_zombie_worker_simulation(client: AsyncClient):
    res = await client.post("/api/chaos/simulate-zombie", json={"resource_name": "db-orders"})
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert len(data["steps"]) == 6
    # Step 6 must be WRITE_REJECTED (fencing token verification)
    assert data["steps"][5]["status"] == "WRITE_REJECTED"

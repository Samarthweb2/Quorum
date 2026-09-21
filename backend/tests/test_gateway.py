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


@pytest.mark.asyncio
async def test_gateway_nodes_summary(client: AsyncClient):
    res = await client.get("/api/nodes")
    assert res.status_code == 200
    nodes = res.json()
    assert len(nodes) == 5
    for node in nodes:
        assert "id" in node
        assert "role" in node
        assert node["role"] in ("leader", "follower", "candidate", "offline")
        assert "current_term" in node
        assert "commit_index" in node
        assert "last_heartbeat_at" in node
        assert "log_length" in node


@pytest.mark.asyncio
async def test_gateway_leases_api_and_history(client: AsyncClient):
    # 1. Acquire Lease
    key = "lease-api-test"
    acq_res = await client.post("/api/leases/acquire", json={
        "key": key,
        "owner_id": "test-owner-7",
        "ttl_ms": 6000,
    })
    assert acq_res.status_code == 200
    acq_data = acq_res.json()
    assert acq_data["success"] is True
    token = acq_data["fence_token"]
    assert token >= 1

    # 2. Get Leases
    leases_res = await client.get("/api/leases")
    assert leases_res.status_code == 200
    leases = leases_res.json()
    matching = [l for l in leases if l["key"] == key]
    assert len(matching) == 1
    assert matching[0]["owner_id"] == "test-owner-7"
    assert matching[0]["fencing_token"] == token
    assert matching[0]["is_active"] is True

    # 3. Get Lease History
    hist_res = await client.get(f"/api/leases/{key}/history")
    assert hist_res.status_code == 200
    hist = hist_res.json()
    assert len(hist) >= 1
    assert hist[0]["event_type"] == "LEASE_ACQUIRED"
    assert hist[0]["fence_token"] == token

    # 4. Renew Lease
    renew_res = await client.post(f"/api/leases/{key}/renew", json={
        "owner_id": "test-owner-7",
        "fence_token": token,
        "ttl_ms": 10000,
    })
    assert renew_res.status_code == 200
    assert renew_res.json()["success"] is True

    # Check history after renew
    hist_res2 = await client.get(f"/api/leases/{key}/history")
    hist2 = hist_res2.json()
    assert len(hist2) >= 2
    assert hist2[-1]["event_type"] == "LEASE_RENEWED"

    # 5. Release Lease
    rel_res = await client.post(f"/api/leases/{key}/release", json={
        "owner_id": "test-owner-7",
        "fence_token": token,
    })
    assert rel_res.status_code == 200
    assert rel_res.json()["success"] is True

    # Check history after release
    hist_res3 = await client.get(f"/api/leases/{key}/history")
    hist3 = hist_res3.json()
    assert len(hist3) >= 3
    assert hist3[-1]["event_type"] == "LEASE_RELEASED"


@pytest.mark.asyncio
async def test_gateway_admin_compact_wal(client: AsyncClient):
    res = await client.post("/api/admin/compact-wal")
    assert res.status_code == 200
    data = res.json()
    assert "success" in data
    assert "node_id" in data
    assert "last_included_index" in data


@pytest.mark.asyncio
async def test_gateway_admin_simulate_zombie(client: AsyncClient):
    res = await client.post("/api/admin/simulate/zombie", json={"resource_name": "inventory-db"})
    assert res.status_code == 200
    data = res.json()
    assert data["is_simulation"] is True
    assert data["success"] is True
    assert len(data["steps"]) == 6


@pytest.mark.asyncio
async def test_gateway_get_locks_api_symmetry(client: AsyncClient):
    # 1. Acquire via /api/locks/acquire
    res = await client.post("/api/locks/acquire", json={
        "key": "symmetry-lock",
        "client_id": "client-sym",
        "ttl_ms": 5000,
    })
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    # Verify dual fencing token fields
    assert "fence_token" in data
    assert "fencing_token" in data
    assert data["fence_token"] == data["fencing_token"]

    # 2. Query via GET /api/locks alias
    locks_res = await client.get("/api/locks")
    assert locks_res.status_code == 200
    locks = locks_res.json()
    assert any(l["key"] == "symmetry-lock" for l in locks)

    # 3. Query history via GET /api/locks/{key}/history alias
    hist_res = await client.get("/api/locks/symmetry-lock/history")
    assert hist_res.status_code == 200
    assert len(hist_res.json()) >= 1

    # Cleanup
    await client.post("/api/locks/release", json={
        "key": "symmetry-lock",
        "client_id": "client-sym",
        "fence_token": data["fence_token"],
    })


@pytest.mark.asyncio
async def test_gateway_active_locks_filters_expired(client: AsyncClient):
    # Acquire a very short TTL lock
    res = await client.post("/api/locks/acquire", json={
        "key": "fast-expiring-lock",
        "client_id": "ephemeral-client",
        "ttl_ms": 150,
    })
    assert res.status_code == 200
    assert res.json()["success"] is True

    # Immediately check: should be in active_locks
    stat1 = await client.get("/api/cluster/status")
    active1 = stat1.json()["active_locks"]
    assert any(l["key"] == "fast-expiring-lock" for l in active1)

    # Wait for lease to expire
    await asyncio.sleep(0.25)

    # After expiration: must NOT appear in active_locks or GET /api/leases
    stat2 = await client.get("/api/cluster/status")
    active2 = stat2.json()["active_locks"]
    assert not any(l["key"] == "fast-expiring-lock" for l in active2)

    leases_res = await client.get("/api/leases")
    leases = leases_res.json()
    assert not any(l["key"] == "fast-expiring-lock" for l in leases)


@pytest.mark.asyncio
async def test_zombie_simulation_follower_state_machine_consistency(client: AsyncClient):
    # Run zombie simulation
    sim_res = await client.post("/api/chaos/simulate-zombie", json={"resource_name": "consistency-check-db"})
    assert sim_res.status_code == 200
    assert sim_res.json()["success"] is True

    # Wait briefly for replication of releases/state machine updates
    await asyncio.sleep(0.15)

    # Verify that all alive nodes' state machines are synchronized and do not diverge
    leader_sm = app_module.controller.state_machines[app_module.controller.get_leader().node_id]
    for nid, sm in app_module.controller.state_machines.items():
        # Fencing token counters must be in agreement
        assert sm.fencing_token_counter == leader_sm.fencing_token_counter


@pytest.mark.asyncio
async def test_gateway_lock_wait_queue_and_linearizable_read(client: AsyncClient):
    # 1. Worker Alpha acquires contested-res
    acq1 = await client.post("/api/leases/acquire", json={
        "key": "contested-res",
        "client_id": "worker-alpha",
        "ttl_ms": 5000,
    })
    assert acq1.status_code == 200
    token1 = acq1.json()["fence_token"]
    assert token1 > 0

    # 2. Worker Beta requests with wait_if_busy=True
    acq2 = await client.post("/api/leases/acquire", json={
        "key": "contested-res",
        "client_id": "worker-beta",
        "ttl_ms": 4000,
        "wait_if_busy": True,
        "wait_timeout_ms": 15000,
    })
    assert acq2.status_code == 200
    res2 = acq2.json()
    assert res2["status"] == "QUEUED"
    assert res2["queue_position"] == 1

    # 3. Check queue endpoint
    q_res = await client.get("/api/leases/contested-res/queue")
    assert q_res.status_code == 200
    q_data = q_res.json()["queue"]
    assert len(q_data) == 1
    assert q_data[0]["client_id"] == "worker-beta"

    # 4. Check linearizable read endpoint
    lin_res = await client.get("/api/leases/contested-res/linearizable")
    assert lin_res.status_code == 200
    lin_data = lin_res.json()
    assert lin_data["success"] is True
    assert lin_data["is_locked"] is True
    assert lin_data["owner"] == "worker-alpha"
    assert lin_data["wait_queue_length"] == 1

    # 5. Worker Alpha releases -> Worker Beta auto-promoted
    rel1 = await client.post("/api/leases/contested-res/release", json={
        "client_id": "worker-alpha",
        "fence_token": token1,
    })
    assert rel1.status_code == 200
    rel1_data = rel1.json()
    assert rel1_data["status"] == "RELEASED_AND_PROMOTED"
    assert rel1_data["promoted_owner"] == "worker-beta"
    assert rel1_data["fence_token"] > token1

    # 6. Verify via linearizable read that Beta is now the owner
    lin2 = await client.get("/api/leases/contested-res/linearizable")
    assert lin2.json()["owner"] == "worker-beta"




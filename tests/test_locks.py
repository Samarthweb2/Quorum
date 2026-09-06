import asyncio
import socket
from pathlib import Path
import pytest

from quorum.client.client import DistributedLock, LockBusyError, QuorumClient
from quorum.raft.types import Role
from quorum.server.server import QuorumServer


def get_free_ports(count: int = 3) -> list[int]:
    sockets = [socket.socket(socket.AF_INET, socket.SOCK_STREAM) for _ in range(count)]
    ports = []
    for s in sockets:
        s.bind(("", 0))
        ports.append(s.getsockname()[1])
    for s in sockets:
        s.close()
    return ports


@pytest.fixture
async def three_node_cluster(tmp_path: Path):
    """Spawns 3 real QuorumServer nodes on dynamic free loopback ports."""
    ports = get_free_ports(3)
    node_ids = ["node-1", "node-2", "node-3"]
    peer_addresses = {nid: f"127.0.0.1:{ports[i]}" for i, nid in enumerate(node_ids)}

    servers = []
    for i, nid in enumerate(node_ids):
        # Remove self from peers
        peers = {k: v for k, v in peer_addresses.items() if k != nid}
        srv = QuorumServer(
            node_id=nid,
            peer_addresses=peers,
            listen_address=f"127.0.0.1:{ports[i]}",
            data_dir=tmp_path / nid,
            advertised_client_address=f"127.0.0.1:{ports[i]}",
            min_election_timeout_s=0.20,
            max_election_timeout_s=0.40,
            heartbeat_interval_s=0.05,
        )
        await srv.start()
        servers.append(srv)

    # Allow leader election to stabilize
    await asyncio.sleep(0.5)

    client_endpoints = [f"127.0.0.1:{p}" for p in ports]
    yield client_endpoints, servers

    for srv in servers:
        await srv.stop()


@pytest.mark.asyncio
async def test_grpc_cluster_election_and_lock_lifecycle(three_node_cluster):
    endpoints, servers = three_node_cluster

    client1 = QuorumClient(servers=endpoints, client_id="worker-1")
    client2 = QuorumClient(servers=endpoints, client_id="worker-2")

    try:
        # 1. Acquire lock from client1
        lock1 = await client1.acquire_lock("batch-processor", ttl_s=5.0)
        assert lock1.fence_token == 1
        assert lock1.client_id == "worker-1"

        # 2. Client2 attempts to acquire same key -> should fail with LockBusyError
        with pytest.raises(LockBusyError):
            await client2.acquire_lock("batch-processor", ttl_s=5.0)

        # 3. Client1 renews lock
        renewed = await client1.renew_lock(lock1, ttl_s=10.0)
        assert renewed is True

        # 4. Client1 releases lock
        released = await client1.release_lock(lock1)
        assert released is True

        # 5. Client2 now acquires lock -> fence token must strictly increase (token = 2)
        lock2 = await client2.acquire_lock("batch-processor", ttl_s=5.0)
        assert lock2.fence_token == 2
        assert lock2.client_id == "worker-2"

        await client2.release_lock(lock2)
    finally:
        await client1.close()
        await client2.close()


@pytest.mark.asyncio
async def test_distributed_lock_context_manager_and_auto_renewal(three_node_cluster):
    endpoints, _ = three_node_cluster
    client = QuorumClient(servers=endpoints, client_id="renew-worker")

    try:
        # Hold lock with TTL=0.3s for 0.7s with auto_renew=True
        async with client.lock("long-task", ttl_s=0.3, auto_renew=True, renew_interval_s=0.1) as lock:
            assert lock.fence_token >= 1
            await asyncio.sleep(0.5)  # Elapsed time > initial TTL, auto-renewal should keep it alive

            # Verify lock is still active
            status = await client.get_lock("long-task")
            assert status is not None
            assert status["is_locked"] is True
            assert status["owner"] == "renew-worker"

        # After context exit, lock must be released
        await asyncio.sleep(0.05)
        status_after = await client.get_lock("long-task")
        assert status_after is None
    finally:
        await client.close()


@pytest.mark.asyncio
async def test_lock_ttl_auto_expiration(three_node_cluster):
    endpoints, _ = three_node_cluster
    client1 = QuorumClient(servers=endpoints, client_id="short-lived-worker")
    client2 = QuorumClient(servers=endpoints, client_id="takeover-worker")

    try:
        # Acquire lock with short TTL (0.15s) and no auto-renewal
        lock1 = await client1.acquire_lock("expiring-task", ttl_s=0.15)
        assert lock1.fence_token >= 1

        # Wait for TTL to expire
        await asyncio.sleep(0.3)

        # Client 2 should now be able to acquire lock without explicit release
        lock2 = await client2.acquire_lock("expiring-task", ttl_s=2.0)
        assert lock2.fence_token > lock1.fence_token
        assert lock2.client_id == "takeover-worker"

        await client2.release_lock(lock2)
    finally:
        await client1.close()
        await client2.close()


@pytest.mark.asyncio
async def test_follower_transparent_redirect(three_node_cluster):
    """
    Connects client directly to a non-leader follower endpoint.
    Client SDK should follow redirect hint to leader transparently.
    """
    endpoints, servers = three_node_cluster

    # Find a follower
    follower_srv = next(s for s in servers if s.node.role != Role.LEADER)
    follower_endpoint = follower_srv.listen_address

    # Initialize client targeting only the follower's address first
    client = QuorumClient(servers=[follower_endpoint] + endpoints, client_id="redirect-tester")

    try:
        lock = await client.acquire_lock("redirected-key", ttl_s=3.0)
        assert lock.fence_token >= 1
        await client.release_lock(lock)
    finally:
        await client.close()


@pytest.mark.asyncio
async def test_watch_leader_stream(three_node_cluster):
    endpoints, servers = three_node_cluster
    client = QuorumClient(servers=endpoints, client_id="leader-watcher")

    try:
        events = []
        async def _reader():
            async for notif in client.watch_leader(endpoints[0]):
                events.append(notif)
                if len(events) >= 1:
                    break

        reader_task = asyncio.create_task(_reader())
        await asyncio.wait_for(reader_task, timeout=2.0)

        assert len(events) >= 1
        assert events[0].leader_id != ""
        assert events[0].term >= 1
    finally:
        await client.close()


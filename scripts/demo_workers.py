"""
Demo: Multiple competing background workers coordinating through Quorum.
Demonstrates distributed lock mutual exclusion, background auto-renewal, and monotonic fencing tokens.
"""

import asyncio
import logging
import random
import sys
import tempfile
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.resolve()))

from quorum.client.client import LockBusyError, QuorumClient
from quorum.server.server import QuorumServer

logging.basicConfig(level=logging.WARNING, format="%(asctime)s [%(levelname)s] %(message)s")


async def run_worker(worker_id: str, endpoints: list[str], runs: int = 3):
    client = QuorumClient(servers=endpoints, client_id=worker_id)
    print(f"[{worker_id}] Started and waiting to compete for lock 'daily-report-generator'...")

    for i in range(runs):
        # Stagger attempts
        await asyncio.sleep(random.uniform(0.05, 0.2))

        try:
            print(f"[{worker_id}] Attempting to acquire lock 'daily-report-generator' (Round {i+1})...")
            async with client.lock("daily-report-generator", ttl_s=1.0, auto_renew=True, acquire_timeout_s=3.0) as lock:
                print(f"  >>> [{worker_id}] *** LOCK ACQUIRED! *** Fencing Token = {lock.fence_token} (expires_at={lock.expires_at_ms})")
                print(f"      [{worker_id}] Executing critical task for 0.4s (auto-renewing in background)...")
                await asyncio.sleep(0.4)
                print(f"      [{worker_id}] Finished critical task. Releasing lock.")

            print(f"  <<< [{worker_id}] Lock released.\n")
        except TimeoutError:
            print(f"[{worker_id}] Timed out waiting for lock in round {i+1}.")
        except Exception as e:
            print(f"[{worker_id}] Error: {e}")

    await client.close()
    print(f"[{worker_id}] Completed all rounds.")


async def main():
    print("=" * 80)
    print("  QUORUM DEMO: COMPETING DISTRIBUTED WORKERS COORDINATION")
    print("=" * 80)

    tmp_dir = Path(tempfile.mkdtemp(prefix="quorum_demo_"))
    ports = [50251, 50252, 50253]
    node_ids = ["node-1", "node-2", "node-3"]
    peer_addresses = {nid: f"127.0.0.1:{ports[i]}" for i, nid in enumerate(node_ids)}

    servers = []
    for i, nid in enumerate(node_ids):
        peers = {k: v for k, v in peer_addresses.items() if k != nid}
        srv = QuorumServer(
            node_id=nid,
            peer_addresses=peers,
            listen_address=f"127.0.0.1:{ports[i]}",
            data_dir=tmp_dir / nid,
            advertised_client_address=f"127.0.0.1:{ports[i]}",
            min_election_timeout_s=0.08,
            max_election_timeout_s=0.15,
            heartbeat_interval_s=0.02,
        )
        await srv.start()
        servers.append(srv)

    print("Booted 3-node Quorum cluster on 127.0.0.1:50251-50253. Waiting for leader election...")
    await asyncio.sleep(0.3)

    endpoints = [f"127.0.0.1:{p}" for p in ports]

    # Spawn 3 competing workers
    workers = [
        asyncio.create_task(run_worker("Worker-Alpha", endpoints, runs=2)),
        asyncio.create_task(run_worker("Worker-Beta", endpoints, runs=2)),
        asyncio.create_task(run_worker("Worker-Gamma", endpoints, runs=2)),
    ]

    await asyncio.gather(*workers)

    print("\nStopping Quorum cluster...")
    for srv in servers:
        await srv.stop()
    print("[DONE] Demo finished successfully!")


if __name__ == "__main__":
    asyncio.run(main())

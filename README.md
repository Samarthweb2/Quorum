# Quorum

**Quorum** is a production-grade distributed lock and leader-election service built from scratch in Python 3 using `asyncio` and `grpcio`, implementing the **Raft consensus algorithm** (no external consensus libraries, 100% hand-rolled).

A cluster of Quorum nodes elects a single leader and maintains strict linearizable coordination even during node crashes, network partitions, and process restarts without split-brain.

---

## Features

- **Hand-Rolled Raft Consensus Engine**:
  - Leader election with seedable randomized timeouts to prevent split votes.
  - Periodic heartbeats and step-downs on higher term discovery.
  - Quorum-based log replication with fast follower conflict repair.
  - **Strict Section 5.4.2 Figure 8 Safety Rule**: Leaders never commit older term entries directly by counting replicas alone.
- **Atomic Write-Ahead Log (WAL) & Durability**:
  - Framed binary records with CRC32 checksums and length headers.
  - Explicit `os.fsync` on every state mutation and log append.
  - Automatic crash recovery that detects and truncates torn writes at the file tail cleanly.
- **Deterministic Distributed Lock State Machine**:
  - Mutual exclusion across cluster keys (`ACQUIRE`, `RENEW`, `RELEASE`).
  - **Strictly Monotonically Increasing 64-Bit Fencing Tokens**: Every granted lock receives an incremented token to protect downstream storage from stale or deposed workers.
  - Deterministic TTL expiration derived from proposal timestamps.
- **Client SDK & Auto-Renewal**:
  - Transparent leader auto-discovery and redirect following.
  - Jittered exponential backoff and retry caps (`max_redirects`) to prevent redirect loops.
  - Python `async with client.lock(...)` context manager with background renewal task.
  - Real-time `WatchLeader()` streaming updates.
- **Comprehensive Failure-Injection Test Suite**:
  - In-process / multi-node test harness supporting simulated packet dropping and network partitions.
  - 26 automated unit and integration tests covering crashes mid-write, 3-vs-2 partitions, and Figure 8 corner cases.

---

## Architecture

```
                                  +---------------------------------------+
                                  |            Client Applications        |
                                  +---------------------------------------+
                                       |              |              |
                                 gRPC  |        gRPC  |        gRPC  |
                                       v              v              v
+---------------------------------------------------------------------------------------------------------+
|                                              QUORUM CLUSTER                                             |
|                                                                                                         |
|   +--------------------------+    +--------------------------+    +--------------------------+          |
|   |         Node 1           |    |         Node 2           |    |         Node 3           |          |
|   |     (Follower/Leader)    |<-->|     (Follower/Leader)    |<-->|     (Follower/Leader)    |          |
|   |                          |    |                          |    |                          |          |
|   | +----------------------+ |    | +----------------------+ |    | +----------------------+ |          |
|   | |   gRPC Client API    | |    | |   gRPC Client API    | |    | |   gRPC Client API    | |          |
|   | +----------------------+ |    | +----------------------+ |    | +----------------------+ |          |
|   | |   Raft Peer Service  | |    | |   Raft Peer Service  | |    | |   Raft Peer Service  | |          |
|   | +----------------------+ |    | +----------------------+ |    | +----------------------+ |          |
|   | |   Raft Engine (Core) | |    | |   Raft Engine (Core) | |    | |   Raft Engine (Core) | |          |
|   | +----------------------+ |    | +----------------------+ |    | +----------------------+ |          |
|   | |  Lock State Machine  | |    | |  Lock State Machine  | |    | |  Lock State Machine  | |          |
|   | +----------------------+ |    | +----------------------+ |    | +----------------------+ |          |
|   | | Persistent WAL Store | |    | | Persistent WAL Store | |    | | Persistent WAL Store | |          |
|   | +----------------------+ |    | +----------------------+ |    | +----------------------+ |          |
|   +--------------------------+    +--------------------------+    +--------------------------+          |
|                                                                                                         |
+---------------------------------------------------------------------------------------------------------+
```

---

## Why Fencing Tokens Matter

Distributed locks alone without fencing tokens cannot guarantee mutual exclusion in real-world distributed systems where client processes experience GC pauses, network delays, or crash-restart cycles:

```
Client 1: [Acquires Lock (Token 1)] --------(GC Pause / Stalled)-----------------> [Tries to Write (Token 1)] -> REJECTED!
                                                |
                                          (Lock Expires)
                                                |
Client 2:                               [Acquires Lock (Token 2)] -> [Writes (Token 2)] -> ACCEPTED!
```

When a client acquires a lock with Quorum, it receives a **strictly monotonically increasing fencing token**. Downstream resources (databases, file systems) record the highest fencing token seen and reject any write from a deposed leader with an older token.

---

## Project Structure

```
Quorum/
├── frontend/             # React + Vite Dark-Theme Web Dashboard
│   ├── src/
│   │   ├── components/   # Consensus Topology, Lock Studio, WAL Inspector, Chaos Sandbox
│   │   ├── App.jsx       # Main state manager & WebSocket event handler
│   │   └── index.css     # Glassmorphism design tokens & glowing animations
│   └── package.json
├── api/                  # Public REST & WebSocket Gateway entrypoint
├── quorum/               # Core Raft Consensus & Distributed Lock Server (Backend)
│   ├── raft/             # Consensus Engine (node.py, storage.py, timer.py, transport.py)
│   ├── state_machine/    # Deterministic Lock State Machine & Monotonic Fencing Tokens
│   ├── server/           # gRPC Raft and Client Services
│   ├── client/           # Client SDK (context manager, auto-renewal, failover)
│   └── gateway/          # FastAPI & WebSocket streaming cluster controller
├── database/             # Storage and persistence abstraction layer
├── proto/                # Protocol Buffers definitions (quorum.proto, raft.proto)
├── scripts/              # Operational and Demo Scripts
│   ├── run_dashboard.py  # One-command Web Visualizer launcher
│   ├── demo_workers.py   # Competing workers distributed coordination demo
│   └── failure_injection.py
└── tests/                # 30 Unit, Integration, Chaos, and Gateway verification tests
```

---

## Quickstart

### 1. Launch Interactive Web Visualizer Dashboard

Start a 5-node cluster with real-time consensus topology, live WAL inspector, lock studio, and click-to-partition chaos simulator:

```bash
# Install backend dependencies
pip install -e ".[dev,gateway]"

# Launch Web Dashboard + Cluster Gateway on http://localhost:8000
python scripts/run_dashboard.py
```

### 2. Run Test Suite

Run all 30 automated verification tests:

```bash
pytest tests/ -v
```

### 3. Run Live Failure Injection Demos

```bash
# Execute automated failure injection (Kill leader mid-write, 3v2 partition, fencing token check)
python scripts/failure_injection.py

# Execute competing distributed workers demo
python scripts/demo_workers.py
```

### 4. Deploy 5-Node Cluster via Docker Compose

```bash
docker compose up --build
```

Nodes will be available on ports `50051`, `50052`, `50053`, `50054`, `50055`.

---

## Python Client SDK Usage

```python
import asyncio
from quorum.client.client import QuorumClient, LockBusyError

async def main():
    # Connect to any cluster nodes (client auto-discovers and follows leader)
    endpoints = ["127.0.0.1:50051", "127.0.0.1:50052", "127.0.0.1:50053"]
    client = QuorumClient(servers=endpoints, client_id="my-worker-1")

    # Example 1: Context Manager with automatic background lease renewal
    async with client.lock("primary-db-writer", ttl_s=10.0, auto_renew=True) as lock:
        print(f"Acquired lock! Fencing Token: {lock.fence_token}")
        # Perform critical operations safely...
        await asyncio.sleep(2.0)

    # Example 2: Manual Acquire / Release
    try:
        lock = await client.acquire_lock("batch-processor", ttl_s=5.0)
        print(f"Acquired lock with token {lock.fence_token}")
        await client.release_lock(lock)
    except LockBusyError:
        print("Lock is currently held by another worker")

    # Example 3: Stream Leadership Events
    async for notif in client.watch_leader():
        print(f"Leader update: ID={notif.leader_id}, Term={notif.term}, IsLeader={notif.is_leader}")
        break

    await client.close()

if __name__ == "__main__":
    asyncio.run(main())
```

---

## Failure Scenarios Tested & Verified

| Test Suite | Scenario | Invariant Verified | Outcome |
| :--- | :--- | :--- | :--- |
| `tests/test_storage.py` | Torn write mid-header / mid-payload | WAL crash recovery truncates uncommitted trailing garbage and restores 100% of committed log entries with CRC32 verification. | **PASS** |
| `tests/test_election.py` | Split vote & randomized timeout recovery | Simultaneous candidates back off with randomized PRNG; single leader emerges cleanly without livelock. | **PASS** |
| `tests/test_election.py` | Higher term stepdown | Leaders and candidates immediately revert to Follower upon receiving RPCs with higher terms. | **PASS** |
| `tests/test_replication.py` | Follower conflict repair | Follower with diverging uncommitted entries truncates conflicting suffix and adopts leader log. | **PASS** |
| `tests/test_replication.py` | **Figure 8 Safety Rule** (Raft §5.4.2) | Leader in Term 4 replicating an older Term 2 entry across a majority does NOT commit it until a current Term 4 entry is committed. | **PASS** |
| `tests/test_locks.py` | Distributed lock mutual exclusion | Only 1 worker can hold lock simultaneously; secondary acquire raises `LockBusyError`. | **PASS** |
| `tests/test_locks.py` | Background auto-renewal | Lock lease automatically renewed in background; remains held across extended execution periods. | **PASS** |
| `tests/test_locks.py` | Follower transparent redirect | Client requests sent to follower nodes follow leader hint without infinite redirect loops. | **PASS** |
| `tests/test_partitions.py` | 5-node partition (3 vs 2) | Majority partition (3 nodes) continues serving writes; minority partition (2 nodes) fails elections. Upon heal, all 5 nodes synchronize seamlessly. | **PASS** |
| `tests/test_partitions.py` | Fencing token downstream validation | Deposed worker attempting late write with stale token is rejected by storage backend. | **PASS** |

---

## License

MIT

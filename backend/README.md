# Quorum Backend

A distributed lock and leader-election service implementing Raft consensus from scratch in Python.

## Components
- **Raft Consensus Engine**: Follower, Candidate, Leader states, randomized election timeouts, log replication, snapshotting & WAL compaction.
- **Lock State Machine**: Deterministic distributed leases with monotonically increasing 64-bit fencing tokens.
- **FastAPI Gateway & WebSocket Stream**: Real-time event broadcasting, REST management APIs, chaos injection controls.
- **AI Agent Swarm Coordinator**: Multi-agent collaborative lock arbitration.

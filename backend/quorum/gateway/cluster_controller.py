"""
Cluster Controller & Intercepted Transport for Quorum Web Visualizer.

Provides:
1. Live multi-node Raft cluster lifecycle (start, stop, restart).
2. Intercepted networking to capture and stream RPC pulses (RequestVote, AppendEntries, Heartbeats).
3. Dynamic Chaos Engineering (Network partitions 3v2, packet drops, node kills).
4. Direct state queries for WAL logs, active locks, fencing tokens, and election countdowns.
5. Simulated downstream storage engine for live Zombie Worker fencing demonstration.
"""

from __future__ import annotations

import asyncio
import logging
import random
import shutil
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

from quorum.raft.node import RaftNode
from quorum.raft.storage import LogEntry
from quorum.raft.transport import RaftTransport
from quorum.raft.types import (
    AppendEntriesArgs,
    AppendEntriesReply,
    RequestVoteArgs,
    RequestVoteReply,
    Role,
)
from quorum.state_machine.lock_manager import LockStateMachine

logger = logging.getLogger("quorum.gateway.controller")


@dataclass
class RpcEvent:
    timestamp_ms: int
    from_node: str
    to_node: str
    rpc_type: str  # "RequestVote" | "AppendEntries" | "Heartbeat"
    term: int
    success: Optional[bool] = None
    dropped: bool = False
    details: Dict[str, Any] = None


class InterceptedNetwork:
    """
    In-memory networked transport supporting live event interception,
    dynamic network partitioning, packet dropping, and latency simulation.
    """

    def __init__(self, on_rpc_event: Optional[Callable[[Dict[str, Any]], None]] = None) -> None:
        self.nodes: Dict[str, RaftNode] = {}
        self.stopped_nodes: Set[str] = set()
        # Partitions: list of disjoint sets of node_ids. Nodes can only talk if in the same set.
        self.partitions: Optional[List[Set[str]]] = None
        self.packet_loss_rate: float = 0.0
        self.latency_ms: float = 0.0
        self.on_rpc_event = on_rpc_event
        self._lock = asyncio.Lock()

    def register_node(self, node_id: str, node: RaftNode) -> None:
        self.nodes[node_id] = node

    def is_connected(self, node1: str, node2: str) -> bool:
        if node1 in self.stopped_nodes or node2 in self.stopped_nodes:
            return False
        if not self.partitions:
            return True
        for part in self.partitions:
            if node1 in part and node2 in part:
                return True
        return False

    def emit_event(self, event: Dict[str, Any]) -> None:
        if self.on_rpc_event:
            try:
                self.on_rpc_event(event)
            except Exception as e:
                logger.debug(f"Error calling rpc event hook: {e}")

    async def send_request_vote(self, from_node: str, to_node: str, args: RequestVoteArgs) -> Optional[RequestVoteReply]:
        now_ms = int(time.time() * 1000)
        connected = self.is_connected(from_node, to_node)
        dropped = not connected or (self.packet_loss_rate > 0 and random.random() < self.packet_loss_rate)

        event_payload = {
            "type": "RPC_PULSE",
            "timestamp_ms": now_ms,
            "from_node": from_node,
            "to_node": to_node,
            "rpc_type": "RequestVote",
            "term": args.term,
            "dropped": dropped,
            "candidate_id": args.candidate_id,
            "last_log_index": args.last_log_index,
        }

        if dropped:
            event_payload["success"] = False
            self.emit_event(event_payload)
            return None

        if self.latency_ms > 0:
            await asyncio.sleep(self.latency_ms / 1000.0)

        target = self.nodes.get(to_node)
        if not target or to_node in self.stopped_nodes:
            event_payload["success"] = False
            event_payload["dropped"] = True
            self.emit_event(event_payload)
            return None

        try:
            reply = await target.handle_request_vote(args)
            event_payload["success"] = reply.vote_granted
            event_payload["reply_term"] = reply.term
            self.emit_event(event_payload)
            return reply
        except Exception as e:
            logger.error(f"Error handling RequestVote at {to_node}: {e}")
            return None

    async def send_append_entries(self, from_node: str, to_node: str, args: AppendEntriesArgs) -> Optional[AppendEntriesReply]:
        now_ms = int(time.time() * 1000)
        connected = self.is_connected(from_node, to_node)
        dropped = not connected or (self.packet_loss_rate > 0 and random.random() < self.packet_loss_rate)
        is_heartbeat = len(args.entries) == 0

        event_payload = {
            "type": "RPC_PULSE",
            "timestamp_ms": now_ms,
            "from_node": from_node,
            "to_node": to_node,
            "rpc_type": "Heartbeat" if is_heartbeat else "AppendEntries",
            "term": args.term,
            "dropped": dropped,
            "is_heartbeat": is_heartbeat,
            "entries_count": len(args.entries),
            "prev_log_index": args.prev_log_index,
            "leader_commit": args.leader_commit,
        }

        if dropped:
            event_payload["success"] = False
            self.emit_event(event_payload)
            return None

        if self.latency_ms > 0:
            await asyncio.sleep(self.latency_ms / 1000.0)

        target = self.nodes.get(to_node)
        if not target or to_node in self.stopped_nodes:
            event_payload["success"] = False
            event_payload["dropped"] = True
            self.emit_event(event_payload)
            return None

        try:
            reply = await target.handle_append_entries(args)
            event_payload["success"] = reply.success
            event_payload["match_index"] = reply.match_index
            self.emit_event(event_payload)
            return reply
        except Exception as e:
            logger.error(f"Error handling AppendEntries at {to_node}: {e}")
            return None


class InterceptedTransport(RaftTransport):
    def __init__(self, node_id: str, network: InterceptedNetwork) -> None:
        self.node_id = node_id
        self.network = network

    async def send_request_vote(self, peer_id: str, args: RequestVoteArgs) -> Optional[RequestVoteReply]:
        return await self.network.send_request_vote(self.node_id, peer_id, args)

    async def send_append_entries(self, peer_id: str, args: AppendEntriesArgs) -> Optional[AppendEntriesReply]:
        return await self.network.send_append_entries(self.node_id, peer_id, args)

    async def close(self) -> None:
        pass


class ClusterController:
    """
    Central Controller for managing the Quorum visualizer cluster.
    """

    def __init__(
        self,
        node_ids: Optional[List[str]] = None,
        data_root: Optional[Path] = None,
        on_broadcast_event: Optional[Callable[[Dict[str, Any]], None]] = None,
    ) -> None:
        self.node_ids = node_ids or ["node-1", "node-2", "node-3", "node-4", "node-5"]
        self.temp_dir = tempfile.mkdtemp(prefix="quorum_visualizer_") if data_root is None else None
        self.data_root = Path(self.temp_dir) if self.temp_dir else data_root
        self.on_broadcast_event = on_broadcast_event

        self.network = InterceptedNetwork(on_rpc_event=self._on_rpc_event)
        self.nodes: Dict[str, RaftNode] = {}
        self.state_machines: Dict[str, LockStateMachine] = {}

        # Downstream storage mock for fencing token demonstration
        self.mock_downstream_storage: Dict[str, Dict[str, Any]] = {}
        self.max_fencing_tokens_seen: Dict[str, int] = {}

        # Telemetry
        self.total_proposals: int = 0
        self.successful_proposals: int = 0
        self.recent_events: List[Dict[str, Any]] = []

        self._running = False
        self._poller_task: Optional[asyncio.Task] = None

    def _on_rpc_event(self, event: Dict[str, Any]) -> None:
        if self.on_broadcast_event:
            self.on_broadcast_event(event)

    def _broadcast(self, event: Dict[str, Any]) -> None:
        # Keep rolling audit log
        self.recent_events.append(event)
        if len(self.recent_events) > 100:
            self.recent_events.pop(0)

        if self.on_broadcast_event:
            try:
                self.on_broadcast_event(event)
            except Exception:
                pass

    async def initialize_cluster(self) -> None:
        """Boots all nodes in the cluster."""
        for nid in self.node_ids:
            data_dir = self.data_root / nid
            data_dir.mkdir(parents=True, exist_ok=True)

            sm = LockStateMachine()
            self.state_machines[nid] = sm

            node = RaftNode(
                node_id=nid,
                peers=self.node_ids,
                data_dir=data_dir,
                min_election_timeout_s=0.25,
                max_election_timeout_s=0.50,
                heartbeat_interval_s=0.08,
            )
            node.on_apply_entry = sm.apply

            transport = InterceptedTransport(nid, self.network)
            node.set_transport(transport)
            self.network.register_node(nid, node)
            self.nodes[nid] = node

        # Start all nodes
        self._running = True
        for node in self.nodes.values():
            await node.start()

        # Start periodic telemetry broadcast poller
        self._poller_task = asyncio.create_task(self._state_broadcast_loop())
        logger.info(f"Initialized Quorum visualizer cluster with {len(self.node_ids)} nodes.")

    async def _state_broadcast_loop(self) -> None:
        """Periodically streams state snapshot to keep web UI tightly synced."""
        while self._running:
            try:
                await asyncio.sleep(0.15)
                status = self.get_cluster_status()
                self._broadcast({
                    "type": "CLUSTER_STATE_UPDATE",
                    "data": status,
                })
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in state broadcast loop: {e}")

    async def shutdown(self) -> None:
        self._running = False
        if self._poller_task:
            self._poller_task.cancel()
        for node in self.nodes.values():
            await node.stop()
        if self.temp_dir and Path(self.temp_dir).exists():
            shutil.rmtree(self.temp_dir, ignore_errors=True)
        logger.info("Quorum visualizer cluster stopped.")

    # =========================================================================
    # Status & Telemetry
    # =========================================================================

    def get_leader(self) -> Optional[RaftNode]:
        for node in self.nodes.values():
            if node.node_id not in self.network.stopped_nodes and node.role == Role.LEADER:
                return node
        return None

    def get_cluster_status(self) -> Dict[str, Any]:
        now_ms = int(time.time() * 1000)
        leader_node = self.get_leader()
        leader_id = leader_node.node_id if leader_node else None

        node_statuses = []
        for nid, node in self.nodes.items():
            is_stopped = nid in self.network.stopped_nodes

            # Find partition group index if partitioned
            part_idx = None
            if self.network.partitions:
                for idx, part in enumerate(self.network.partitions):
                    if nid in part:
                        part_idx = idx + 1
                        break

            role_str = "OFFLINE" if is_stopped else node.role.name

            node_statuses.append({
                "node_id": nid,
                "role": role_str,
                "current_term": node.current_term,
                "leader_id": node.leader_id or (nid if node.role == Role.LEADER else None),
                "commit_index": node.commit_index,
                "last_applied": node.last_applied,
                "log_length": node.log_storage.last_log_index,
                "voted_for": node.voted_for,
                "is_stopped": is_stopped,
                "partition_group": part_idx,
            })

        # Gather active locks from leader's state machine or the latest available state machine
        active_locks = []
        source_sm = self.state_machines.get(leader_id) if leader_id else next(iter(self.state_machines.values()), None)

        if source_sm:
            for key, rec in source_sm.locks.items():
                rem_ttl = max(0, rec.expires_at_ms - now_ms)
                active_locks.append({
                    "key": key,
                    "owner": rec.owner,
                    "fence_token": rec.fence_token,
                    "granted_at_ms": rec.granted_at_ms,
                    "expires_at_ms": rec.expires_at_ms,
                    "remaining_ttl_ms": rem_ttl,
                    "is_active": rec.is_active(now_ms),
                })

        # Calculate cluster health
        alive_count = len([n for n in self.nodes if n not in self.network.stopped_nodes])
        is_partitioned = bool(self.network.partitions)

        health = "HEALTHY"
        if alive_count < len(self.nodes) // 2 + 1:
            health = "NO_QUORUM"
        elif is_partitioned:
            health = "PARTITIONED"
        elif not leader_id:
            health = "ELECTION_IN_PROGRESS"

        return {
            "health": health,
            "leader_id": leader_id,
            "total_nodes": len(self.node_ids),
            "alive_nodes": alive_count,
            "is_partitioned": is_partitioned,
            "partitions": [list(p) for p in self.network.partitions] if self.network.partitions else None,
            "packet_loss_rate": self.network.packet_loss_rate,
            "latency_ms": self.network.latency_ms,
            "nodes": node_statuses,
            "active_locks": active_locks,
            "total_proposals": self.total_proposals,
            "successful_proposals": self.successful_proposals,
            "timestamp_ms": now_ms,
        }

    def get_node_logs(self) -> Dict[str, List[Dict[str, Any]]]:
        """Returns the full WAL for each node to display side-by-side."""
        logs = {}
        for nid, node in self.nodes.items():
            entries = []
            for entry in node.log_storage._entries:
                entries.append({
                    "index": entry.index,
                    "term": entry.term,
                    "command_type": entry.command_type,
                    "data": entry.data,
                    "timestamp_ms": entry.timestamp_ms,
                    "is_committed": entry.index <= node.commit_index,
                    "is_applied": entry.index <= node.last_applied,
                })
            logs[nid] = entries
        return logs

    # =========================================================================
    # Lock Operations
    # =========================================================================

    async def acquire_lock(self, key: str, client_id: str, ttl_ms: int = 5000) -> Dict[str, Any]:
        self.total_proposals += 1
        leader = self.get_leader()
        if not leader:
            return {
                "success": False,
                "status": "NO_LEADER",
                "message": "No active cluster leader available to accept proposals",
            }

        now_ms = int(time.time() * 1000)
        data = {"key": key, "client_id": client_id, "ttl_ms": ttl_ms}

        try:
            fut = await leader.propose("ACQUIRE", data=data, timestamp_ms=now_ms)
            proposed_index = leader.log_storage.last_log_index
            committed = await asyncio.wait_for(fut, timeout=3.0)

            if not committed:
                return {
                    "success": False,
                    "status": "COMMIT_LOST",
                    "message": "Leader stepped down or lost quorum before commit",
                }

            sm = self.state_machines[leader.node_id]
            result = sm.get_result(proposed_index)
            if not result:
                return {"success": False, "status": "ERROR", "message": "Result missing from state machine"}

            if result.success:
                self.successful_proposals += 1

            self._broadcast({
                "type": "LOCK_ACQUIRED" if result.success else "LOCK_BUSY",
                "key": key,
                "client_id": client_id,
                "fence_token": result.fence_token,
                "expires_at_ms": result.expires_at_ms,
                "message": result.message,
            })

            return {
                "success": result.success,
                "status": result.status,
                "fence_token": result.fence_token,
                "expires_at_ms": result.expires_at_ms,
                "message": result.message,
            }

        except asyncio.TimeoutError:
            return {"success": False, "status": "TIMEOUT", "message": "Quorum proposal timed out (possible partition)"}
        except Exception as e:
            return {"success": False, "status": "ERROR", "message": str(e)}

    async def renew_lock(self, key: str, client_id: str, fence_token: int, ttl_ms: int = 5000) -> Dict[str, Any]:
        self.total_proposals += 1
        leader = self.get_leader()
        if not leader:
            return {"success": False, "status": "NO_LEADER", "message": "No active cluster leader available"}

        now_ms = int(time.time() * 1000)
        data = {"key": key, "client_id": client_id, "fence_token": fence_token, "ttl_ms": ttl_ms}

        try:
            fut = await leader.propose("RENEW", data=data, timestamp_ms=now_ms)
            proposed_index = leader.log_storage.last_log_index
            committed = await asyncio.wait_for(fut, timeout=3.0)

            if not committed:
                return {"success": False, "status": "COMMIT_LOST", "message": "Leadership lost before commit"}

            sm = self.state_machines[leader.node_id]
            result = sm.get_result(proposed_index)
            return {
                "success": result.success if result else False,
                "status": result.status if result else "ERROR",
                "fence_token": result.fence_token if result else 0,
                "expires_at_ms": result.expires_at_ms if result else 0,
                "message": result.message if result else "",
            }
        except Exception as e:
            return {"success": False, "status": "ERROR", "message": str(e)}

    async def release_lock(self, key: str, client_id: str, fence_token: int) -> Dict[str, Any]:
        self.total_proposals += 1
        leader = self.get_leader()
        if not leader:
            return {"success": False, "status": "NO_LEADER", "message": "No active cluster leader available"}

        now_ms = int(time.time() * 1000)
        data = {"key": key, "client_id": client_id, "fence_token": fence_token}

        try:
            fut = await leader.propose("RELEASE", data=data, timestamp_ms=now_ms)
            proposed_index = leader.log_storage.last_log_index
            committed = await asyncio.wait_for(fut, timeout=3.0)

            if not committed:
                return {"success": False, "status": "COMMIT_LOST", "message": "Leadership lost before commit"}

            sm = self.state_machines[leader.node_id]
            result = sm.get_result(proposed_index)
            return {
                "success": result.success if result else False,
                "status": result.status if result else "ERROR",
                "fence_token": fence_token,
                "message": result.message if result else "",
            }
        except Exception as e:
            return {"success": False, "status": "ERROR", "message": str(e)}

    # =========================================================================
    # Chaos Engineering Controls
    # =========================================================================

    def create_partition(self, partitions: List[List[str]]) -> Dict[str, Any]:
        """
        Creates network partitions.
        Example: [["node-1", "node-2", "node-3"], ["node-4", "node-5"]]
        """
        self.network.partitions = [set(group) for group in partitions]
        self._broadcast({
            "type": "CHAOS_PARTITION_CREATED",
            "partitions": partitions,
            "message": f"Cluster partitioned into {len(partitions)} isolated network partitions",
        })
        return {"success": True, "partitions": partitions}

    def heal_partitions(self) -> Dict[str, Any]:
        """Heals all network partitions."""
        self.network.partitions = None
        self._broadcast({
            "type": "CHAOS_PARTITIONS_HEALED",
            "message": "All network partitions healed. Full connectivity restored.",
        })
        return {"success": True, "message": "Partitions healed"}

    async def kill_node(self, node_id: str) -> Dict[str, Any]:
        if node_id not in self.nodes:
            return {"success": False, "message": f"Node {node_id} not found"}

        self.network.stopped_nodes.add(node_id)
        node = self.nodes[node_id]
        await node.stop()

        self._broadcast({
            "type": "CHAOS_NODE_KILLED",
            "node_id": node_id,
            "message": f"Node {node_id} has been killed/crashed",
        })
        return {"success": True, "node_id": node_id}

    async def restart_node(self, node_id: str) -> Dict[str, Any]:
        if node_id not in self.nodes:
            return {"success": False, "message": f"Node {node_id} not found"}

        self.network.stopped_nodes.discard(node_id)
        node = self.nodes[node_id]
        await node.start()

        self._broadcast({
            "type": "CHAOS_NODE_RESTARTED",
            "node_id": node_id,
            "message": f"Node {node_id} restarted and rejoining cluster",
        })
        return {"success": True, "node_id": node_id}

    def set_network_conditions(self, latency_ms: float = 0.0, packet_loss_rate: float = 0.0) -> Dict[str, Any]:
        self.network.latency_ms = max(0.0, latency_ms)
        self.network.packet_loss_rate = max(0.0, min(1.0, packet_loss_rate))
        return {
            "success": True,
            "latency_ms": self.network.latency_ms,
            "packet_loss_rate": self.network.packet_loss_rate,
        }

    # =========================================================================
    # Zombie Worker Fencing Token Simulation
    # =========================================================================

    async def simulate_zombie_worker(self, resource_name: str = "production-orders-db") -> Dict[str, Any]:
        """
        Simulates the classic distributed systems split-brain zombie worker bug:
        1. Worker A acquires lock with Fencing Token N.
        2. Worker A goes into a long GC pause / stalled write.
        3. Lock expires on cluster.
        4. Worker B acquires lock with Fencing Token N+1.
        5. Worker B writes successfully with Token N+1. Downstream storage records max token N+1.
        6. Worker A wakes up and attempts to write with stale Token N.
        7. Downstream storage checks (Token N < Max Token N+1) and REJECTS Worker A!
        """
        steps = []

        # Step 1: Worker Alpha acquires lock
        res1 = await self.acquire_lock(resource_name, "Worker-Alpha", ttl_ms=2000)
        if not res1["success"]:
            return {"success": False, "message": f"Failed to acquire initial lock: {res1.get('message')}"}

        token_a = res1["fence_token"]
        steps.append({
            "step": 1,
            "worker": "Worker-Alpha",
            "action": "ACQUIRE_LOCK",
            "token": token_a,
            "status": "SUCCESS",
            "description": f"Worker-Alpha acquired lock '{resource_name}' with Fencing Token #{token_a}",
        })

        # Step 2: Worker Alpha pauses (simulated GC)
        steps.append({
            "step": 2,
            "worker": "Worker-Alpha",
            "action": "GC_PAUSE_STALL",
            "token": token_a,
            "status": "STALLED",
            "description": f"Worker-Alpha experiences an unexpected 2.5s Garbage Collection pause...",
        })

        # Step 3: Expire Worker Alpha's lock manually or fast-forward
        leader = self.get_leader()
        if leader and leader.node_id in self.state_machines:
            sm = self.state_machines[leader.node_id]
            if resource_name in sm.locks:
                # Force expiration for simulation
                sm.locks[resource_name].expires_at_ms = int(time.time() * 1000) - 100

        steps.append({
            "step": 3,
            "worker": "Quorum-Cluster",
            "action": "LOCK_EXPIRED",
            "token": token_a,
            "status": "EXPIRED",
            "description": f"Lock lease expired on the cluster while Worker-Alpha was frozen.",
        })

        # Step 4: Worker Beta acquires lock
        res2 = await self.acquire_lock(resource_name, "Worker-Beta", ttl_ms=5000)
        if not res2["success"]:
            return {"success": False, "message": f"Worker-Beta failed to acquire lock: {res2.get('message')}"}

        token_b = res2["fence_token"]
        steps.append({
            "step": 4,
            "worker": "Worker-Beta",
            "action": "ACQUIRE_LOCK",
            "token": token_b,
            "status": "SUCCESS",
            "description": f"Worker-Beta detected free lock and acquired it with strictly incremented Fencing Token #{token_b}",
        })

        # Step 5: Worker Beta writes to downstream storage
        self.max_fencing_tokens_seen[resource_name] = token_b
        self.mock_downstream_storage[resource_name] = {
            "data": "Order #98451 Processed by Worker-Beta",
            "last_fencing_token": token_b,
            "updated_by": "Worker-Beta",
        }

        steps.append({
            "step": 5,
            "worker": "Worker-Beta",
            "action": "DOWNSTREAM_WRITE",
            "token": token_b,
            "status": "WRITE_ACCEPTED",
            "description": f"Worker-Beta wrote to database using Token #{token_b}. Database updated max seen token to #{token_b}.",
        })

        # Step 6: Worker Alpha wakes up and attempts late write with stale token A
        max_seen = self.max_fencing_tokens_seen.get(resource_name, 0)
        write_accepted = token_a >= max_seen

        steps.append({
            "step": 6,
            "worker": "Worker-Alpha (Zombie)",
            "action": "STALE_WRITE_ATTEMPT",
            "token": token_a,
            "status": "WRITE_REJECTED" if not write_accepted else "ACCEPTED_UNSAFE",
            "description": (
                f"Worker-Alpha wakes up and attempts to write with stale Token #{token_a}. "
                f"Database checks: Token #{token_a} < Max Seen #{max_seen} -> ❌ REJECTED! Data corruption prevented."
            ),
        })

        # Clean up lock
        await self.release_lock(resource_name, "Worker-Beta", token_b)

        return {
            "success": True,
            "resource": resource_name,
            "token_alpha": token_a,
            "token_beta": token_b,
            "steps": steps,
        }

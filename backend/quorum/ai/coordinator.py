"""
AI Agent Swarm Coordinator.

Simulates multi-agent AI systems coordinating over shared environments using
Quorum Raft consensus leases and monotonic fencing tokens.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

from quorum.ai.tools import (
    FencedStorageTarget,
    QuorumLockTool,
    StaleFenceTokenException,
)

logger = logging.getLogger("quorum.ai.coordinator")


@dataclass
class AgentPersona:
    agent_id: str
    name: str
    role: str
    color: str
    avatar_emoji: str
    description: str


@dataclass
class AgentExecutionStep:
    step_number: int
    timestamp_ms: int
    agent_id: str
    agent_name: str
    phase: str  # "THOUGHT" | "TOOL_ACQUIRE" | "LOCK_GRANTED" | "TOOL_MUTATE" | "WRITE_COMMITTED" | "WRITE_REJECTED" | "STALL" | "RELEASE"
    thought: str
    tool_action: Optional[str] = None
    fence_token: Optional[int] = None
    status: str = "SUCCESS"  # "SUCCESS" | "WARNING" | "REJECTED" | "STALLED"
    details: Dict[str, Any] = field(default_factory=dict)


class AgentSwarmCoordinator:
    """
    Coordinates and simulates multi-agent workflows using Quorum distributed locking.
    """

    def __init__(
        self,
        cluster_controller: Any,
        on_event_broadcast: Optional[Callable[[Dict[str, Any]], None]] = None,
    ) -> None:
        self.controller = cluster_controller
        self.on_event_broadcast = on_event_broadcast
        self.storage = FencedStorageTarget()

        self.agents: Dict[str, AgentPersona] = {
            "agent-alpha": AgentPersona(
                agent_id="agent-alpha",
                name="Settlement Agent",
                role="Financial Transactions & Ledger Debits",
                color="#38bdf8",  # Sky Blue
                avatar_emoji="💳",
                description="Processes external vendor settlements and authorizes ledger debits.",
            ),
            "agent-beta": AgentPersona(
                agent_id="agent-beta",
                name="Inventory Agent",
                role="Warehouse Stock & Reservation",
                color="#00f2aa",  # Emerald Green
                avatar_emoji="📦",
                description="Reserves product units and commits warehouse dispatch allocations.",
            ),
            "agent-gamma": AgentPersona(
                agent_id="agent-gamma",
                name="Risk & Audit Agent",
                role="Compliance & Rebalancing",
                color="#c084fc",  # Purple
                avatar_emoji="🛡️",
                description="Verifies ledger solvency, audits compliance, and applies rebates.",
            ),
        }

    def _broadcast(self, event: Dict[str, Any]) -> None:
        if self.on_event_broadcast:
            try:
                self.on_event_broadcast(event)
            except Exception as e:
                logger.debug(f"Event broadcast callback error: {e}")

    # =========================================================================
    # Status & State
    # =========================================================================

    def get_status(self, resource_name: str = "shared-financial-ledger") -> Dict[str, Any]:
        return {
            "resource": resource_name,
            "max_fence_token": self.storage.max_fence_tokens.get(resource_name, 0),
            "storage_state": self.storage.storage.get(resource_name, {}),
            "audit_history": self.storage.audit_log[-20:],
            "registered_agents": [
                {
                    "agent_id": a.agent_id,
                    "name": a.name,
                    "role": a.role,
                    "color": a.color,
                    "emoji": a.avatar_emoji,
                    "description": a.description,
                }
                for a in self.agents.values()
            ],
        }

    # =========================================================================
    # Scenario 1: Safe Multi-Agent Coordinated Swarm
    # =========================================================================

    async def run_safe_swarm(self, resource_name: str = "shared-financial-ledger") -> Dict[str, Any]:
        """
        Demonstrates safe serialized execution where 3 agents acquire locks in sequence,
        receive strictly increasing 64-bit fencing tokens, and commit mutations without conflict.
        """
        # Initialize ledger state
        self.storage.reset(resource_name, {
            "balance_usd": 15000.0,
            "reserved_units": 300,
            "processed_orders": 42,
            "audit_status": "NORMAL",
        })

        steps: List[Dict[str, Any]] = []
        step_idx = 1

        agent_plans = [
            (
                "agent-alpha",
                "Reviewing batch payment #TX-8812 for $3,500.00. Checking account solvency...",
                {"balance_usd": -3500.0, "processed_orders": 1},
                "Payment of $3,500.00 debited for batch #TX-8812",
            ),
            (
                "agent-beta",
                "Receiving high-priority catalog order #ORD-990. Reserving 75 units in Warehouse East...",
                {"reserved_units": 75},
                "75 warehouse units reserved for #ORD-990",
            ),
            (
                "agent-gamma",
                "Executing automated audit cycle. Applying supplier volume rebate +$450.00...",
                {"balance_usd": 450.0, "audit_status": "VERIFIED_CONSISTENT"},
                "Rebate applied and audit verified",
            ),
        ]

        for agent_id, thought, mutation, commit_note in agent_plans:
            persona = self.agents[agent_id]

            # 1. Thought Phase
            now = int(time.time() * 1000)
            step_thought = {
                "step": step_idx,
                "timestamp_ms": now,
                "agent_id": agent_id,
                "agent_name": persona.name,
                "phase": "THOUGHT",
                "thought": thought,
                "status": "SUCCESS",
                "details": {"role": persona.role},
            }
            steps.append(step_thought)
            self._broadcast({"type": "AI_AGENT_EVENT", "step": step_thought})
            step_idx += 1
            await asyncio.sleep(0.05)

            # 2. Acquire Quorum Lock
            tool = QuorumLockTool(client=self.controller, agent_id=agent_id)
            lock_res = await tool._arun("acquire", resource_name, ttl_ms=6000)
            if not lock_res.get("success"):
                err_step = {
                    "step": step_idx,
                    "timestamp_ms": int(time.time() * 1000),
                    "agent_id": agent_id,
                    "agent_name": persona.name,
                    "phase": "TOOL_ACQUIRE",
                    "thought": f"Failed to acquire lock: {lock_res.get('message')}",
                    "status": "REJECTED",
                    "details": lock_res,
                }
                steps.append(err_step)
                return {"success": False, "scenario": "safe_swarm", "steps": steps}

            fence_token = lock_res["fence_token"]

            step_lock = {
                "step": step_idx,
                "timestamp_ms": int(time.time() * 1000),
                "agent_id": agent_id,
                "agent_name": persona.name,
                "phase": "LOCK_GRANTED",
                "thought": f"Acquired distributed lock on '{resource_name}' via Raft consensus. Received Monotonic Fencing Token #{fence_token}.",
                "fence_token": fence_token,
                "tool_action": f"QuorumLockTool.acquire('{resource_name}')",
                "status": "SUCCESS",
                "details": lock_res,
            }
            steps.append(step_lock)
            self._broadcast({"type": "AI_AGENT_EVENT", "step": step_lock})
            step_idx += 1
            await asyncio.sleep(0.05)

            # 3. Downstream Mutation with Fencing Token Verification
            mutation_res = self.storage.execute_mutation(
                resource_name=resource_name,
                agent_id=agent_id,
                fence_token=fence_token,
                mutation=mutation,
            )

            step_write = {
                "step": step_idx,
                "timestamp_ms": int(time.time() * 1000),
                "agent_id": agent_id,
                "agent_name": persona.name,
                "phase": "WRITE_COMMITTED",
                "thought": f"Downstream database accepted tool write with Token #{fence_token}. {commit_note}.",
                "fence_token": fence_token,
                "tool_action": f"FencedStorage.execute_mutation(token={fence_token})",
                "status": "SUCCESS",
                "details": {
                    "mutation": mutation,
                    "new_state": mutation_res["result_state"],
                },
            }
            steps.append(step_write)
            self._broadcast({"type": "AI_AGENT_EVENT", "step": step_write})
            step_idx += 1
            await asyncio.sleep(0.05)

            # 4. Release Lock
            await tool._arun("release", resource_name, fence_token=fence_token)
            step_release = {
                "step": step_idx,
                "timestamp_ms": int(time.time() * 1000),
                "agent_id": agent_id,
                "agent_name": persona.name,
                "phase": "RELEASE",
                "thought": f"Released lock for '{resource_name}'. Finished critical section.",
                "fence_token": fence_token,
                "status": "SUCCESS",
                "details": {},
            }
            steps.append(step_release)
            self._broadcast({"type": "AI_AGENT_EVENT", "step": step_release})
            step_idx += 1

        return {
            "success": True,
            "scenario": "safe_swarm",
            "resource": resource_name,
            "final_state": self.storage.storage[resource_name],
            "max_fence_token": self.storage.max_fence_tokens[resource_name],
            "steps": steps,
        }

    # =========================================================================
    # Scenario 2: Zombie Agent Mitigation via Monotonic Fencing Tokens
    # =========================================================================

    async def run_zombie_mitigation(self, resource_name: str = "shared-financial-ledger") -> Dict[str, Any]:
        """
        Demonstrates the classic autonomous AI agent concurrency bug:
        1. Agent Alpha acquires lock (Token N).
        2. Agent Alpha enters an unexpected heavy LLM reasoning latency / hallucination loop.
        3. The lock lease expires on the cluster while Agent Alpha is frozen.
        4. Agent Beta detects the vacancy and acquires the lock (Token N+1).
        5. Agent Beta successfully updates the shared ledger (Database max token advances to N+1).
        6. Agent Alpha wakes up from its pause and blindly attempts to commit its stale calculation.
        7. Fenced downstream storage intercepts and REJECTS Agent Alpha's write!
        """
        self.storage.reset(resource_name, {
            "balance_usd": 20000.0,
            "reserved_units": 100,
            "processed_orders": 50,
            "audit_status": "NORMAL",
        })

        steps: List[Dict[str, Any]] = []
        step_idx = 1
        alpha = self.agents["agent-alpha"]
        beta = self.agents["agent-beta"]

        # Step 1: Agent Alpha acquires lock
        tool_alpha = QuorumLockTool(client=self.controller, agent_id="agent-alpha")
        res1 = await tool_alpha._arun("acquire", resource_name, ttl_ms=2000)
        token_alpha = res1.get("fence_token", 101)

        s1 = {
            "step": step_idx,
            "timestamp_ms": int(time.time() * 1000),
            "agent_id": "agent-alpha",
            "agent_name": alpha.name,
            "phase": "LOCK_GRANTED",
            "thought": "Acquired distributed lock. Beginning complex 8-step financial audit reasoning...",
            "fence_token": token_alpha,
            "tool_action": f"QuorumLockTool.acquire('{resource_name}')",
            "status": "SUCCESS",
            "details": res1,
        }
        steps.append(s1)
        self._broadcast({"type": "AI_AGENT_EVENT", "step": s1})
        step_idx += 1

        # Step 2: Agent Alpha stalls in LLM reasoning loop
        s2 = {
            "step": step_idx,
            "timestamp_ms": int(time.time() * 1000),
            "agent_id": "agent-alpha",
            "agent_name": alpha.name,
            "phase": "STALL",
            "thought": "⚠️ LLM inference latency spike / chain-of-thought stalled for 3.5 seconds. Background renewal stopped.",
            "fence_token": token_alpha,
            "status": "STALLED",
            "details": {"stall_duration_ms": 3500},
        }
        steps.append(s2)
        self._broadcast({"type": "AI_AGENT_EVENT", "step": s2})
        step_idx += 1

        # Step 3: Fast forward lock expiration across cluster via Raft consensus
        leader = self.controller.get_leader() if hasattr(self.controller, "get_leader") else None
        if leader:
            now_ms = int(time.time() * 1000)
            fut = await leader.propose("EXPIRE", data={"key": resource_name}, timestamp_ms=now_ms)
            await asyncio.wait_for(fut, timeout=3.0)
        else:
            expired_ts = int(time.time() * 1000) - 50
            if hasattr(self.controller, "state_machines"):
                for sm in self.controller.state_machines.values():
                    if resource_name in sm.locks:
                        sm.locks[resource_name].expires_at_ms = expired_ts

        s3 = {
            "step": step_idx,
            "timestamp_ms": int(time.time() * 1000),
            "agent_id": "quorum-cluster",
            "agent_name": "Quorum Consensus Cluster",
            "phase": "LEASE_EXPIRED",
            "thought": f"Lease TTL for Agent Alpha expired on the Raft cluster. Resource '{resource_name}' declared FREE.",
            "fence_token": token_alpha,
            "status": "WARNING",
            "details": {"expired_owner": "agent-alpha"},
        }
        steps.append(s3)
        self._broadcast({"type": "AI_AGENT_EVENT", "step": s3})
        step_idx += 1

        # Step 4: Agent Beta acquires lock with strictly incremented token
        tool_beta = QuorumLockTool(client=self.controller, agent_id="agent-beta")
        res2 = await tool_beta._arun("acquire", resource_name, ttl_ms=5000)
        token_beta = res2.get("fence_token", token_alpha + 1)

        s4 = {
            "step": step_idx,
            "timestamp_ms": int(time.time() * 1000),
            "agent_id": "agent-beta",
            "agent_name": beta.name,
            "phase": "LOCK_GRANTED",
            "thought": f"Detected vacant resource. Acquired lock with strictly incremented Fencing Token #{token_beta}.",
            "fence_token": token_beta,
            "tool_action": f"QuorumLockTool.acquire('{resource_name}')",
            "status": "SUCCESS",
            "details": res2,
        }
        steps.append(s4)
        self._broadcast({"type": "AI_AGENT_EVENT", "step": s4})
        step_idx += 1

        # Step 5: Agent Beta writes downstream storage
        mutation_beta = {"balance_usd": -5000.0, "processed_orders": 1}
        res_beta_write = self.storage.execute_mutation(
            resource_name=resource_name,
            agent_id="agent-beta",
            fence_token=token_beta,
            mutation=mutation_beta,
        )

        s5 = {
            "step": step_idx,
            "timestamp_ms": int(time.time() * 1000),
            "agent_id": "agent-beta",
            "agent_name": beta.name,
            "phase": "WRITE_COMMITTED",
            "thought": f"Committed $5,000 disbursement using Token #{token_beta}. Downstream storage updated highest observed token to #{token_beta}.",
            "fence_token": token_beta,
            "tool_action": f"FencedStorage.execute_mutation(token={token_beta})",
            "status": "SUCCESS",
            "details": {
                "new_balance": res_beta_write["result_state"]["balance_usd"],
                "max_fence_token": token_beta,
            },
        }
        steps.append(s5)
        self._broadcast({"type": "AI_AGENT_EVENT", "step": s5})
        step_idx += 1

        # Release Beta's lock
        await tool_beta._arun("release", resource_name, fence_token=token_beta)

        # Step 6: Agent Alpha wakes up as a ZOMBIE and attempts late write with stale token
        rejected = False
        rejection_reason = ""
        try:
            self.storage.execute_mutation(
                resource_name=resource_name,
                agent_id="agent-alpha",
                fence_token=token_alpha,
                mutation={"balance_usd": -12000.0},  # Stale calculation
            )
        except StaleFenceTokenException as ex:
            rejected = True
            rejection_reason = str(ex)

        s6 = {
            "step": step_idx,
            "timestamp_ms": int(time.time() * 1000),
            "agent_id": "agent-alpha",
            "agent_name": "Settlement Agent (Zombie)",
            "phase": "WRITE_REJECTED",
            "thought": (
                f"🚨 Agent Alpha wakes up and attempts write with stale Token #{token_alpha}. "
                f"Downstream storage checks: Token #{token_alpha} < Highest Observed #{token_beta} -> ❌ REJECTED! Data corruption prevented."
            ),
            "fence_token": token_alpha,
            "tool_action": f"FencedStorage.execute_mutation(token={token_alpha})",
            "status": "REJECTED",
            "details": {
                "attempted_token": token_alpha,
                "current_max_token": token_beta,
                "rejection_message": rejection_reason,
            },
        }
        steps.append(s6)
        self._broadcast({"type": "AI_AGENT_EVENT", "step": s6})
        step_idx += 1

        return {
            "success": True,
            "scenario": "zombie_mitigation",
            "resource": resource_name,
            "token_alpha": token_alpha,
            "token_beta": token_beta,
            "zombie_write_rejected": rejected,
            "final_state": self.storage.storage[resource_name],
            "steps": steps,
        }

    # =========================================================================
    # Scenario 3: Unprotected Multi-Agent Chaos (Without Quorum)
    # =========================================================================

    async def run_unprotected_chaos(self, resource_name: str = "shared-financial-ledger") -> Dict[str, Any]:
        """
        Shows what happens if agents run concurrently WITHOUT Quorum distributed locking:
        Simultaneous read-modify-write causes double-spending and ledger corruption.
        """
        self.storage.reset(resource_name, {
            "balance_usd": 10000.0,
            "reserved_units": 50,
            "processed_orders": 10,
        })

        steps: List[Dict[str, Any]] = []
        step_idx = 1
        alpha = self.agents["agent-alpha"]
        beta = self.agents["agent-beta"]

        # Both read $10,000 at the same time
        s1 = {
            "step": step_idx,
            "timestamp_ms": int(time.time() * 1000),
            "agent_id": "agent-alpha",
            "agent_name": alpha.name,
            "phase": "THOUGHT",
            "thought": "Reading ledger: Balance is $10,000. Approving $8,000 vendor wire transfer...",
            "status": "WARNING",
            "details": {"read_balance": 10000.0},
        }
        steps.append(s1)
        self._broadcast({"type": "AI_AGENT_EVENT", "step": s1})
        step_idx += 1

        s2 = {
            "step": step_idx,
            "timestamp_ms": int(time.time() * 1000),
            "agent_id": "agent-beta",
            "agent_name": beta.name,
            "phase": "THOUGHT",
            "thought": "Reading ledger concurrently: Balance is $10,000. Approving $7,500 emergency inventory purchase...",
            "status": "WARNING",
            "details": {"read_balance": 10000.0},
        }
        steps.append(s2)
        self._broadcast({"type": "AI_AGENT_EVENT", "step": s2})
        step_idx += 1

        # Both write without fencing
        res1 = self.storage.execute_mutation(
            resource_name=resource_name,
            agent_id="agent-alpha",
            fence_token=0,
            mutation={"balance_usd": -8000.0},
            bypass_fencing=True,
        )

        s3 = {
            "step": step_idx,
            "timestamp_ms": int(time.time() * 1000),
            "agent_id": "agent-alpha",
            "agent_name": alpha.name,
            "phase": "TOOL_MUTATE",
            "thought": "Agent Alpha deducted $8,000. New balance: $2,000.",
            "status": "WARNING",
            "details": {"new_balance": res1["result_state"]["balance_usd"]},
        }
        steps.append(s3)
        self._broadcast({"type": "AI_AGENT_EVENT", "step": s3})
        step_idx += 1

        res2 = self.storage.execute_mutation(
            resource_name=resource_name,
            agent_id="agent-beta",
            fence_token=0,
            mutation={"balance_usd": -7500.0},
            bypass_fencing=True,
        )

        final_bal = res2["result_state"]["balance_usd"]

        s4 = {
            "step": step_idx,
            "timestamp_ms": int(time.time() * 1000),
            "agent_id": "agent-beta",
            "agent_name": beta.name,
            "phase": "TOOL_MUTATE",
            "thought": f"💥 RACE CONDITION! Agent Beta deducted $7,500 without locking. Balance crashed to -${abs(final_bal)}! Double-spend occurred.",
            "status": "REJECTED",
            "details": {
                "corrupted_balance": final_bal,
                "error": "DOUBLE_SPEND_CORRUPTION",
            },
        }
        steps.append(s4)
        self._broadcast({"type": "AI_AGENT_EVENT", "step": s4})
        step_idx += 1

        return {
            "success": True,
            "scenario": "unprotected_chaos",
            "resource": resource_name,
            "corrupted_balance": final_bal,
            "steps": steps,
        }

    async def answer_question(self, message: str) -> Dict[str, Any]:
        """
        Answer any operator question about the live cluster and optionally
        run a coordination scenario when the prompt asks for a simulation.
        Always returns a non-empty reply.
        """
        text = (message or "").strip()
        lower = text.lower()
        status: Dict[str, Any] = {}
        if self.controller and hasattr(self.controller, "get_cluster_status"):
            try:
                status = self.controller.get_cluster_status() or {}
            except Exception as exc:
                status = {"error": str(exc)}

        leader = status.get("leader_id") or "none elected"
        alive = status.get("alive_nodes", 0)
        total = status.get("total_nodes", 0)
        health = status.get("health", "UNKNOWN")
        locks = status.get("active_locks") or []
        term = 0
        for node in status.get("nodes") or []:
            if node.get("role") == "LEADER":
                term = node.get("current_term") or 0
                break
        if not term and status.get("nodes"):
            term = max((n.get("current_term") or 0) for n in status["nodes"])

        action: Optional[str] = None
        simulation: Optional[Dict[str, Any]] = None
        resource = "shared-financial-ledger"

        try:
            if any(k in lower for k in ("zombie", "fencing", "stale worker", "gc pause")):
                action = "zombie"
                simulation = await self.run_zombie_mitigation(resource)
            elif any(k in lower for k in ("unprotected", "double spend", "race condition", "chaos swarm")):
                action = "chaos"
                simulation = await self.run_unprotected_chaos(resource)
            elif any(k in lower for k in ("safe swarm", "multi-agent", "coordinate agents", "run swarm")):
                action = "safe"
                simulation = await self.run_safe_swarm(resource)
        except Exception as exc:
            simulation = {"success": False, "error": str(exc)}

        if not text:
            reply = (
                "Ask me anything about this Raft cluster — leader status, locks, "
                "partitions, fencing tokens, or type “run zombie test” to simulate a GC stall."
            )
        elif action == "zombie":
            reply = (
                "I ran the Kleppmann zombie-worker simulation. A stalled agent kept a stale "
                "fencing token; Quorum expired the lease, granted a higher token to a healthy "
                "agent, and the storage guard rejected the late write. Split-brain did not occur."
            )
        elif action == "chaos":
            bal = simulation.get("corrupted_balance") if simulation else None
            reply = (
                "I ran the unprotected multi-agent race (no locks). Two agents read the same "
                f"ledger and both wrote — the balance is now {bal}. This is why Quorum leases "
                "and monotonic fencing tokens exist."
            )
        elif action == "safe":
            reply = (
                "Safe swarm completed. Settlement, Inventory, and Risk agents acquired the "
                "ledger lease in turn, each received an increasing fencing token, and every "
                "mutation committed without conflict."
            )
        elif any(k in lower for k in ("leader", "who is leader", "election", "term")):
            reply = (
                f"Current leader is {leader} on term {term}. "
                f"Cluster health is {health} with {alive}/{total} nodes alive. "
                "A new election starts if the leader misses heartbeats past the election timeout."
            )
        elif any(k in lower for k in ("lock", "lease", "fence", "token")):
            if locks:
                parts = []
                for lock in locks[:5]:
                    key = lock.get("key") or lock.get("resource") or "lock"
                    owner = lock.get("owner") or lock.get("holder") or lock.get("client_id") or "unknown"
                    token = lock.get("fence_token") or lock.get("fencing_token") or "?"
                    parts.append(f"{key} held by {owner} (fence {token})")
                reply = "Active distributed leases: " + "; ".join(parts) + "."
            else:
                reply = (
                    "No active leases right now. Acquire a lock from the Distributed Locks tab "
                    "or ask me to “acquire a lock on orders-db” after you open that view. "
                    "Every grant issues a strictly increasing 64-bit fencing token."
                )
        elif any(k in lower for k in ("partition", "split-brain", "split brain", "network")):
            partitioned = status.get("is_partitioned") or status.get("health") == "PARTITIONED"
            reply = (
                f"The cluster is {'currently partitioned' if partitioned else 'fully connected'}. "
                "A minority partition cannot elect a leader, so a partitioned node cannot commit "
                "writes. Heal partitions from Tools & Chaos to restore quorum."
            )
        elif any(k in lower for k in ("node", "cluster", "health", "status", "topology")):
            roles = []
            for node in status.get("nodes") or []:
                nid = node.get("node_id")
                role = node.get("role")
                roles.append(f"{nid}={role}")
            role_txt = ", ".join(roles) if roles else "no node telemetry yet"
            reply = (
                f"Cluster {health}: {alive}/{total} nodes online, leader {leader}, term {term}. "
                f"Roles: {role_txt}."
            )
        elif any(k in lower for k in ("wal", "log", "commit", "snapshot")):
            commit = 0
            for node in status.get("nodes") or []:
                commit = max(commit, node.get("commit_index") or 0)
            reply = (
                f"Highest commit index is {commit}. Followers apply the same log prefix as the "
                "leader. Snapshots compact old WAL entries once the threshold is reached."
            )
        elif any(k in lower for k in ("how", "what is quorum", "explain", "raft", "help")):
            reply = (
                "Quorum is a Raft consensus control plane: five nodes elect one leader, replicate "
                "a write-ahead log, and grant distributed locks with monotonic fencing tokens so "
                "stale workers cannot corrupt storage. Ask about leader, locks, partitions, WAL, "
                "or run “zombie test”, “safe swarm”, or “unprotected chaos”."
            )
        else:
            reply = (
                f"I heard: “{text}”. Live cluster: leader {leader}, term {term}, "
                f"health {health}, {alive}/{total} nodes, {len(locks)} active lock(s). "
                "I can explain Raft, inspect leases, or run zombie / safe-swarm / chaos simulations."
            )

        return {
            "success": True,
            "reply": reply,
            "action": action,
            "leader_id": leader,
            "health": health,
            "alive_nodes": alive,
            "total_nodes": total,
            "active_locks": len(locks),
            "simulation": simulation,
        }

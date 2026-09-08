"""
Quorum AI Agent Coordination CLI Demo.

Run directly in terminal:
    python -m quorum.ai.demo_cli --scenario safe
    python -m quorum.ai.demo_cli --scenario zombie
    python -m quorum.ai.demo_cli --scenario chaos
"""

import argparse
import asyncio
import sys
import time

# Ensure UTF-8 output on Windows consoles
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from quorum.ai.coordinator import AgentSwarmCoordinator
from quorum.gateway.cluster_controller import ClusterController



def print_banner():
    print("=" * 72)
    print("  QUORUM AI AGENT COORDINATION DEMO")
    print("  Multi-Agent Distributed Locking & Fencing Tokens with LangChain")
    print("=" * 72)


async def main():
    parser = argparse.ArgumentParser(description="Quorum AI Agent Coordination Demo")
    parser.add_argument(
        "--scenario",
        choices=["safe", "zombie", "chaos"],
        default="safe",
        help="Coordination scenario to execute (default: safe)",
    )
    args = parser.parse_args()

    print_banner()
    print("[1/3] Booting in-memory 5-node Quorum Raft Cluster...")
    controller = ClusterController(node_ids=["node-1", "node-2", "node-3", "node-4", "node-5"])
    await controller.initialize_cluster()

    # Wait for leader election
    print("[2/3] Waiting for Raft leader election...")
    leader = None
    for _ in range(30):
        leader = controller.get_leader()
        if leader:
            break
        await asyncio.sleep(0.1)

    if not leader:
        print("❌ Error: Cluster failed to elect a leader in time.")
        await controller.shutdown()
        sys.exit(1)

    print(f"✅ Cluster online! Elected Leader: {leader.node_id}")
    print(f"[3/3] Executing Scenario: '{args.scenario.upper()}'\n")

    coordinator = AgentSwarmCoordinator(controller)

    try:
        if args.scenario == "safe":
            res = await coordinator.run_safe_swarm()
        elif args.scenario == "zombie":
            res = await coordinator.run_zombie_mitigation()
        else:
            res = await coordinator.run_unprotected_chaos()

        print("-" * 72)
        for s in res["steps"]:
            agent = s["agent_name"]
            phase = s["phase"]
            thought = s["thought"]
            token = s.get("fence_token")
            token_str = f" [Token #{token}]" if token is not None else ""
            status_icon = "✅" if s["status"] == "SUCCESS" else ("⚠️" if s["status"] == "WARNING" else "❌")

            print(f"{status_icon} [{phase:<15}] {agent}{token_str}")
            print(f"   ↳ {thought}")
            if s.get("tool_action"):
                print(f"   ↳ Tool: {s['tool_action']}")
            print()

        print("-" * 72)
        print("Execution Summary:")
        if args.scenario == "safe":
            print(f"✅ All 3 AI agents synchronized safely via Quorum Raft locks.")
            print(f"✅ Final Verified Ledger State: {res['final_state']}")
        elif args.scenario == "zombie":
            print(f"🛡️ Zombie Agent Late Write Successfully Intercepted & Rejected!")
            print(f"🛡️ Token Alpha (#{res['token_alpha']}) was rejected because Storage had seen Token Beta (#{res['token_beta']}).")
        else:
            print(f"💥 Without Quorum distributed locking, ledger balance corrupted: ${res.get('corrupted_balance')}")
        print("=" * 72)

    finally:
        await controller.shutdown()


if __name__ == "__main__":
    asyncio.run(main())

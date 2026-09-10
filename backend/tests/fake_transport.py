"""
In-memory simulated network transport for testing Raft clusters without network overhead.
Supports simulating network partitions, message drops, and delays between specific nodes.
"""

from __future__ import annotations

import asyncio
from typing import Dict, Optional, Set, Tuple
from quorum.raft.storage import LogEntry
from quorum.raft.transport import RaftTransport
from quorum.raft.types import (
    AppendEntriesArgs,
    AppendEntriesReply,
    InstallSnapshotArgs,
    InstallSnapshotReply,
    RequestVoteArgs,
    RequestVoteReply,
)


class FakeNetwork:
    """
    Central simulated network switch that routes RPCs between in-memory Raft nodes.
    Supports partitioning, selective drops, and simulated latency.
    """

    def __init__(self) -> None:
        self._nodes: Dict[str, "RaftNode"] = {}  # type: ignore
        self._blocked_pairs: Set[Tuple[str, str]] = set()  # (from_node, to_node)
        self.message_delay_s: float = 0.0

    def register_node(self, node_id: str, node: "RaftNode") -> None:  # type: ignore
        self._nodes[node_id] = node

    def unregister_node(self, node_id: str) -> None:
        self._nodes.pop(node_id, None)

    def partition(self, group1: Set[str], group2: Set[str]) -> None:
        """Cuts all network connectivity between group1 and group2."""
        for n1 in group1:
            for n2 in group2:
                self._blocked_pairs.add((n1, n2))
                self._blocked_pairs.add((n2, n1))

    def heal_partition(self) -> None:
        """Restores full network connectivity between all nodes."""
        self._blocked_pairs.clear()

    def block_link(self, from_node: str, to_node: str) -> None:
        self._blocked_pairs.add((from_node, to_node))

    def unblock_link(self, from_node: str, to_node: str) -> None:
        self._blocked_pairs.discard((from_node, to_node))

    def is_blocked(self, from_node: str, to_node: str) -> bool:
        return (from_node, to_node) in self._blocked_pairs

    async def route_request_vote(
        self, from_node: str, to_node: str, args: RequestVoteArgs, timeout_s: float
    ) -> Optional[RequestVoteReply]:
        if self.is_blocked(from_node, to_node) or self.is_blocked(to_node, from_node):
            return None

        target = self._nodes.get(to_node)
        if target is None or not target.is_running:
            return None

        if self.message_delay_s > 0:
            await asyncio.sleep(self.message_delay_s)

        try:
            reply = await asyncio.wait_for(target.handle_request_vote(args), timeout=timeout_s)
            return reply
        except Exception as e:
            import traceback
            traceback.print_exc()
            return None

    async def route_append_entries(
        self, from_node: str, to_node: str, args: AppendEntriesArgs, timeout_s: float
    ) -> Optional[AppendEntriesReply]:
        if self.is_blocked(from_node, to_node) or self.is_blocked(to_node, from_node):
            return None

        target = self._nodes.get(to_node)
        if target is None or not target.is_running:
            return None

        if self.message_delay_s > 0:
            await asyncio.sleep(self.message_delay_s)

        try:
            # Dispatch directly into target node's handler
            reply = await asyncio.wait_for(target.handle_append_entries(args), timeout=timeout_s)
            return reply
        except (asyncio.TimeoutError, Exception):
            return None

    async def route_install_snapshot(
        self, from_node: str, to_node: str, args: InstallSnapshotArgs, timeout_s: float
    ) -> Optional[InstallSnapshotReply]:
        if self.is_blocked(from_node, to_node) or self.is_blocked(to_node, from_node):
            return None

        target = self._nodes.get(to_node)
        if target is None or not target.is_running:
            return None

        if self.message_delay_s > 0:
            await asyncio.sleep(self.message_delay_s)

        try:
            reply = await asyncio.wait_for(target.handle_install_snapshot(args), timeout=timeout_s)
            return reply
        except (asyncio.TimeoutError, Exception):
            return None


class FakeTransport(RaftTransport):
    """
    Per-node transport handle wired into FakeNetwork.
    """

    def __init__(self, node_id: str, network: FakeNetwork) -> None:
        self.node_id = node_id
        self.network = network

    async def send_request_vote(
        self, target_node_id: str, args: RequestVoteArgs, timeout_s: float = 0.5
    ) -> Optional[RequestVoteReply]:
        return await self.network.route_request_vote(self.node_id, target_node_id, args, timeout_s)

    async def send_append_entries(
        self, target_node_id: str, args: AppendEntriesArgs, timeout_s: float = 0.5
    ) -> Optional[AppendEntriesReply]:
        return await self.network.route_append_entries(self.node_id, target_node_id, args, timeout_s)

    async def send_install_snapshot(
        self, target_node_id: str, args: InstallSnapshotArgs, timeout_s: float = 2.0
    ) -> Optional[InstallSnapshotReply]:
        return await self.network.route_install_snapshot(self.node_id, target_node_id, args, timeout_s)

    async def close(self) -> None:
        self.network.unregister_node(self.node_id)

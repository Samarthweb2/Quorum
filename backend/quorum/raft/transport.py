"""
Transport abstraction for inter-node Raft communication.
Allows swapping between In-Memory FakeTransport (for testing) and GrpcTransport (for production).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional
from quorum.raft.types import AppendEntriesArgs, AppendEntriesReply, RequestVoteArgs, RequestVoteReply


class RaftTransport(ABC):
    """Abstract interface for sending Raft RPCs to peer nodes."""

    @abstractmethod
    async def send_request_vote(
        self, target_node_id: str, args: RequestVoteArgs, timeout_s: float = 0.5
    ) -> Optional[RequestVoteReply]:
        """Sends RequestVote RPC to target node. Returns None on network failure/timeout."""
        pass

    @abstractmethod
    async def send_append_entries(
        self, target_node_id: str, args: AppendEntriesArgs, timeout_s: float = 0.5
    ) -> Optional[AppendEntriesReply]:
        """Sends AppendEntries RPC to target node. Returns None on network failure/timeout."""
        pass

    @abstractmethod
    async def close(self) -> None:
        """Closes transport resources."""
        pass

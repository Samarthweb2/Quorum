"""
Async gRPC transport implementation for inter-node Raft communication.
"""

from __future__ import annotations

import json
import logging
from typing import Dict, List, Optional
import grpc

from quorum.proto import raft_pb2, raft_pb2_grpc
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

logger = logging.getLogger(__name__)


class GrpcRaftTransport(RaftTransport):
    """
    Production Raft transport utilizing async gRPC channels.
    """

    def __init__(self, node_id: str, peer_addresses: Dict[str, str]) -> None:
        self.node_id = node_id
        self.peer_addresses = peer_addresses  # {peer_id: "host:port"}
        self._channels: Dict[str, grpc.aio.Channel] = {}
        self._stubs: Dict[str, raft_pb2_grpc.RaftServiceStub] = {}

    def _get_stub(self, target_node_id: str) -> Optional[raft_pb2_grpc.RaftServiceStub]:
        addr = self.peer_addresses.get(target_node_id)
        if not addr:
            return None

        if target_node_id not in self._stubs:
            channel = grpc.aio.insecure_channel(addr)
            self._channels[target_node_id] = channel
            self._stubs[target_node_id] = raft_pb2_grpc.RaftServiceStub(channel)

        return self._stubs[target_node_id]

    async def send_request_vote(
        self, target_node_id: str, args: RequestVoteArgs, timeout_s: float = 0.5
    ) -> Optional[RequestVoteReply]:
        stub = self._get_stub(target_node_id)
        if not stub:
            return None

        req = raft_pb2.RequestVoteRequest(
            term=args.term,
            candidate_id=args.candidate_id,
            last_log_index=args.last_log_index,
            last_log_term=args.last_log_term,
        )

        try:
            resp: raft_pb2.RequestVoteResponse = await stub.RequestVote(req, timeout=timeout_s)
            return RequestVoteReply(
                term=resp.term,
                vote_granted=resp.vote_granted,
            )
        except (grpc.RpcError, Exception) as e:
            logger.debug(f"[{self.node_id}] RequestVote to {target_node_id} failed: {e}")
            return None

    async def send_append_entries(
        self, target_node_id: str, args: AppendEntriesArgs, timeout_s: float = 0.5
    ) -> Optional[AppendEntriesReply]:
        stub = self._get_stub(target_node_id)
        if not stub:
            return None

        entries_proto = [
            raft_pb2.LogEntryProto(
                index=e.index,
                term=e.term,
                command_type=e.command_type,
                data_json=json.dumps(e.data) if e.data is not None else "",
                timestamp_ms=e.timestamp_ms,
            )
            for e in args.entries
        ]

        req = raft_pb2.AppendEntriesRequest(
            term=args.term,
            leader_id=args.leader_id,
            prev_log_index=args.prev_log_index,
            prev_log_term=args.prev_log_term,
            entries=entries_proto,
            leader_commit=args.leader_commit,
        )

        try:
            resp: raft_pb2.AppendEntriesResponse = await stub.AppendEntries(req, timeout=timeout_s)
            return AppendEntriesReply(
                term=resp.term,
                success=resp.success,
                match_index=resp.match_index,
                conflict_index=resp.conflict_index,
            )
        except (grpc.RpcError, Exception) as e:
            logger.debug(f"[{self.node_id}] AppendEntries to {target_node_id} failed: {e}")
            return None

    async def send_install_snapshot(
        self, target_node_id: str, args: InstallSnapshotArgs, timeout_s: float = 2.0
    ) -> Optional[InstallSnapshotReply]:
        stub = self._get_stub(target_node_id)
        if not stub:
            return None

        req = raft_pb2.InstallSnapshotRequest(
            term=args.term,
            leader_id=args.leader_id,
            last_included_index=args.last_included_index,
            last_included_term=args.last_included_term,
            data=args.data,
            done=args.done,
        )

        try:
            resp: raft_pb2.InstallSnapshotResponse = await stub.InstallSnapshot(req, timeout=timeout_s)
            return InstallSnapshotReply(term=resp.term)
        except (grpc.RpcError, Exception) as e:
            logger.debug(f"[{self.node_id}] InstallSnapshot to {target_node_id} failed: {e}")
            return None

    async def close(self) -> None:
        for channel in self._channels.values():
            await channel.close()
        self._channels.clear()
        self._stubs.clear()

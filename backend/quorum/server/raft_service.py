"""
gRPC Servicer handling incoming Raft consensus RPCs (RequestVote, AppendEntries).
"""

from __future__ import annotations

import json
import grpc
from quorum.proto import raft_pb2, raft_pb2_grpc
from quorum.raft.node import RaftNode
from quorum.raft.storage import LogEntry
from quorum.raft.types import AppendEntriesArgs, InstallSnapshotArgs, RequestVoteArgs


class RaftGrpcServicer(raft_pb2_grpc.RaftServiceServicer):
    """
    Implements RaftService gRPC endpoints by delegating to the local RaftNode.
    """

    def __init__(self, node: RaftNode) -> None:
        self.node = node

    async def RequestVote(
        self, request: raft_pb2.RequestVoteRequest, context: grpc.aio.ServicerContext
    ) -> raft_pb2.RequestVoteResponse:
        args = RequestVoteArgs(
            term=request.term,
            candidate_id=request.candidate_id,
            last_log_index=request.last_log_index,
            last_log_term=request.last_log_term,
            is_pre_vote=getattr(request, "is_pre_vote", False),
        )
        reply = await self.node.handle_request_vote(args)
        return raft_pb2.RequestVoteResponse(
            term=reply.term,
            vote_granted=reply.vote_granted,
        )

    async def AppendEntries(
        self, request: raft_pb2.AppendEntriesRequest, context: grpc.aio.ServicerContext
    ) -> raft_pb2.AppendEntriesResponse:
        entries = []
        for e in request.entries:
            data = None
            if e.data_json:
                try:
                    data = json.loads(e.data_json)
                except Exception:
                    data = None

            entries.append(
                LogEntry(
                    index=e.index,
                    term=e.term,
                    command_type=e.command_type,
                    data=data,
                    timestamp_ms=e.timestamp_ms,
                )
            )

        args = AppendEntriesArgs(
            term=request.term,
            leader_id=request.leader_id,
            prev_log_index=request.prev_log_index,
            prev_log_term=request.prev_log_term,
            entries=entries,
            leader_commit=request.leader_commit,
        )
        reply = await self.node.handle_append_entries(args)
        return raft_pb2.AppendEntriesResponse(
            term=reply.term,
            success=reply.success,
            match_index=reply.match_index,
            conflict_index=reply.conflict_index,
        )

    async def InstallSnapshot(
        self, request: raft_pb2.InstallSnapshotRequest, context: grpc.aio.ServicerContext
    ) -> raft_pb2.InstallSnapshotResponse:
        args = InstallSnapshotArgs(
            term=request.term,
            leader_id=request.leader_id,
            last_included_index=request.last_included_index,
            last_included_term=request.last_included_term,
            data=request.data,
            done=request.done,
        )
        reply = await self.node.handle_install_snapshot(args)
        return raft_pb2.InstallSnapshotResponse(term=reply.term)

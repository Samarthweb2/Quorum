"""
Common data types and RPC argument models for Raft.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, List, Optional
from quorum.raft.storage import LogEntry


class Role(str, Enum):
    FOLLOWER = "FOLLOWER"
    CANDIDATE = "CANDIDATE"
    LEADER = "LEADER"


@dataclass
class RequestVoteArgs:
    term: int
    candidate_id: str
    last_log_index: int
    last_log_term: int


@dataclass
class RequestVoteReply:
    term: int
    vote_granted: bool


@dataclass
class AppendEntriesArgs:
    term: int
    leader_id: str
    prev_log_index: int
    prev_log_term: int
    entries: List[LogEntry] = field(default_factory=list)
    leader_commit: int = 0


@dataclass
class AppendEntriesReply:
    term: int
    success: bool
    match_index: int = 0
    conflict_term: int = 0
    conflict_index: int = 0


@dataclass
class InstallSnapshotArgs:
    term: int
    leader_id: str
    last_included_index: int
    last_included_term: int
    data: bytes
    done: bool = True


@dataclass
class InstallSnapshotReply:
    term: int

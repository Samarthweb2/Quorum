"""
Core Raft consensus engine node implementation.

Implements:
- Roles: FOLLOWER, CANDIDATE, LEADER
- Randomized election timers with seedable/mockable test hooks
- Parallel RequestVote and vote counting with majority quorum
- Safe term progression and step-downs
- Leader heartbeats and step-down on higher term discovery
- Complete lock-protected state transitions
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Callable, Dict, List, Optional, Set

from quorum.raft.storage import LogEntry, LogStorage, StateStorage
from quorum.raft.timer import ElectionTimer, HeartbeatTimer
from quorum.raft.transport import RaftTransport
from quorum.raft.types import (
    AppendEntriesArgs,
    AppendEntriesReply,
    RequestVoteArgs,
    RequestVoteReply,
    Role,
)

logger = logging.getLogger(__name__)


class RaftNode:
    """
    Represents a single Raft node in the cluster.
    """

    def __init__(
        self,
        node_id: str,
        peers: List[str],
        data_dir: str | Path,
        transport: Optional[RaftTransport] = None,
        min_election_timeout_s: float = 0.15,
        max_election_timeout_s: float = 0.30,
        heartbeat_interval_s: float = 0.05,
        random_seed: Optional[int] = None,
        manual_timer_mode: bool = False,
        on_leadership_change: Optional[Callable[[Role, Optional[str], int], None]] = None,
    ) -> None:
        self.node_id = node_id
        self.peers = [p for p in peers if p != node_id]
        self.data_dir = Path(data_dir)
        self.transport = transport

        # Persistence
        self.state_storage = StateStorage(self.data_dir)
        self.log_storage = LogStorage(self.data_dir)

        # Persistent state on all servers
        self.current_term = self.state_storage.current_term
        self.voted_for = self.state_storage.voted_for

        # Volatile state on all servers
        self.role: Role = Role.FOLLOWER
        self.leader_id: Optional[str] = None
        self.commit_index: int = 0
        self.last_applied: int = 0

        # Volatile state on leaders (re-initialized after election)
        self.next_index: Dict[str, int] = {}
        self.match_index: Dict[str, int] = {}

        # State machine and commit waiters
        self._commit_waiters: Dict[int, asyncio.Future[bool]] = {}
        self.on_apply_entry: Optional[Callable[[LogEntry], None]] = None

        # Concurrency & locks
        self._lock = asyncio.Lock()
        self._running = False
        self._heartbeat_tasks: Set[asyncio.Task] = set()
        self._replication_events: Dict[str, asyncio.Event] = {peer: asyncio.Event() for peer in self.peers}

        # Callbacks
        self.on_leadership_change = on_leadership_change

        # Timers
        self.election_timer = ElectionTimer(
            min_timeout_s=min_election_timeout_s,
            max_timeout_s=max_election_timeout_s,
            callback=self._on_election_timeout,
            random_seed=random_seed,
            manual_mode=manual_timer_mode,
        )
        self.heartbeat_timer = HeartbeatTimer(
            interval_s=heartbeat_interval_s,
            callback=self._on_heartbeat_tick,
        )

    @property
    def is_running(self) -> bool:
        return self._running

    @property
    def quorum_size(self) -> int:
        total_nodes = len(self.peers) + 1
        return (total_nodes // 2) + 1

    def set_transport(self, transport: RaftTransport) -> None:
        self.transport = transport

    async def start(self) -> None:
        """Starts the Raft node event loop and election timer."""
        async with self._lock:
            if self._running:
                return
            self._running = True
            self.role = Role.FOLLOWER
            self.leader_id = None
            self.election_timer.start()
            logger.info(f"[{self.node_id}] Started Raft node in Term {self.current_term} as FOLLOWER")

    async def stop(self) -> None:
        """Stops the Raft node and cleans up tasks and timers."""
        async with self._lock:
            self._running = False
            self.election_timer.cancel()
            self.heartbeat_timer.stop()
            for task in list(self._heartbeat_tasks):
                task.cancel()
            self._heartbeat_tasks.clear()
            if self.transport:
                await self.transport.close()
            logger.info(f"[{self.node_id}] Stopped Raft node")

    # =========================================================================
    # Leader Election Logic
    # =========================================================================

    async def _on_election_timeout(self) -> None:
        """Triggered when election timer expires without heartbeat."""
        async with self._lock:
            if not self._running or self.role == Role.LEADER:
                return

            # Transition to CANDIDATE
            self.role = Role.CANDIDATE
            self.current_term += 1
            self.voted_for = self.node_id
            self.leader_id = None
            self.state_storage.save(self.current_term, self.voted_for)
            self.election_timer.reset()

            logger.info(f"[{self.node_id}] Election timeout -> Started election for Term {self.current_term}")
            if self.on_leadership_change:
                self.on_leadership_change(self.role, self.leader_id, self.current_term)

            election_term = self.current_term

            # Single-node cluster fast path
            if not self.peers:
                await self._become_leader()
                return

            # Prepare RequestVote arguments
            args = RequestVoteArgs(
                term=election_term,
                candidate_id=self.node_id,
                last_log_index=self.log_storage.last_log_index,
                last_log_term=self.log_storage.last_log_term,
            )

        # Send RequestVote RPCs in parallel outside node lock
        votes_received = 1  # Voted for self
        vote_lock = asyncio.Lock()

        async def _ask_peer(peer_id: str) -> None:
            nonlocal votes_received
            if not self.transport:
                return
            reply = await self.transport.send_request_vote(peer_id, args)
            if reply is None:
                return

            async with self._lock:
                if not self._running or self.role != Role.CANDIDATE or self.current_term != election_term:
                    return

                if reply.term > self.current_term:
                    logger.info(f"[{self.node_id}] Discovered higher term {reply.term} during election. Stepping down.")
                    await self._step_down(reply.term)
                    return

                if reply.vote_granted:
                    async with vote_lock:
                        votes_received += 1
                        logger.debug(f"[{self.node_id}] Received vote from {peer_id} ({votes_received}/{self.quorum_size})")
                        if votes_received >= self.quorum_size and self.role == Role.CANDIDATE:
                            await self._become_leader()

        # Fire concurrent vote requests
        tasks = [asyncio.create_task(_ask_peer(peer)) for peer in self.peers]
        await asyncio.gather(*tasks, return_exceptions=True)

    async def handle_request_vote(self, args: RequestVoteArgs) -> RequestVoteReply:
        """Handler for incoming RequestVote RPC."""
        async with self._lock:
            # 1. Reply false if term < currentTerm (§5.1)
            if args.term < self.current_term:
                return RequestVoteReply(term=self.current_term, vote_granted=False)

            # If term > currentTerm, update term and step down to FOLLOWER (§5.1)
            if args.term > self.current_term:
                await self._step_down(args.term)

            # 2. Check candidate log up-to-dateness (§5.4.1)
            my_last_term = self.log_storage.last_log_term
            my_last_index = self.log_storage.last_log_index

            candidate_up_to_date = False
            if args.last_log_term > my_last_term:
                candidate_up_to_date = True
            elif args.last_log_term == my_last_term:
                candidate_up_to_date = (args.last_log_index >= my_last_index)

            # 3. If votedFor is null or candidateId, and candidate's log is up-to-date, grant vote (§5.2, §5.4)
            if (self.voted_for is None or self.voted_for == args.candidate_id) and candidate_up_to_date:
                self.voted_for = args.candidate_id
                self.state_storage.save(self.current_term, self.voted_for)
                self.election_timer.reset()
                logger.info(f"[{self.node_id}] Granted vote to {args.candidate_id} for Term {self.current_term}")
                return RequestVoteReply(term=self.current_term, vote_granted=True)

            logger.info(
                f"[{self.node_id}] Denied vote to {args.candidate_id} for Term {args.term} "
                f"(voted_for={self.voted_for}, candidate_up_to_date={candidate_up_to_date})"
            )
            return RequestVoteReply(term=self.current_term, vote_granted=False)

    async def _become_leader(self) -> None:
        """Transitions node to LEADER state and starts heartbeats."""
        if self.role == Role.LEADER:
            return
        self.role = Role.LEADER
        self.leader_id = self.node_id
        self.election_timer.cancel()

        # Initialize leader volatile state (§5.3)
        last_index = self.log_storage.last_log_index
        self.next_index = {peer: last_index + 1 for peer in self.peers}
        self.match_index = {peer: 0 for peer in self.peers}

        logger.info(f"[{self.node_id}] *** WON ELECTION - BECAME LEADER FOR TERM {self.current_term} ***")
        if self.on_leadership_change:
            self.on_leadership_change(self.role, self.leader_id, self.current_term)

        # Send initial empty AppendEntries (heartbeats) immediately
        await self._broadcast_append_entries()

        # Start periodic heartbeats
        self.heartbeat_timer.start()

    async def _step_down(self, new_term: int, new_leader: Optional[str] = None) -> None:
        """Transitions node to FOLLOWER due to discovering a higher term or valid leader."""
        old_role = self.role
        term_changed = new_term > self.current_term

        self.current_term = new_term
        if term_changed:
            self.voted_for = None
            self.state_storage.save(self.current_term, self.voted_for)

        self.role = Role.FOLLOWER
        old_leader = self.leader_id
        if new_leader:
            self.leader_id = new_leader
        elif term_changed:
            self.leader_id = None

        self.heartbeat_timer.stop()
        self.election_timer.reset()

        leader_changed = (old_leader != self.leader_id)
        if old_role != Role.FOLLOWER or term_changed or leader_changed:
            if old_role != Role.FOLLOWER:
                logger.info(f"[{self.node_id}] Stepped down to FOLLOWER in Term {self.current_term} (leader={self.leader_id})")
            # Cancel any pending client proposals on step-down
            for fut in self._commit_waiters.values():
                if not fut.done():
                    fut.set_result(False)
            self._commit_waiters.clear()
            if self.on_leadership_change:
                self.on_leadership_change(self.role, self.leader_id, self.current_term)

    # =========================================================================
    # Client Proposal & State Machine
    # =========================================================================

    async def propose(
        self,
        command_type: str,
        data: Optional[dict] = None,
        timestamp_ms: int = 0,
    ) -> asyncio.Future[bool]:
        """
        Proposes a new command to the Raft cluster.
        Must be called on the LEADER.
        Returns a Future that resolves to True when the entry is committed,
        or False if leadership was lost before commit.
        """
        async with self._lock:
            if not self._running:
                fut = asyncio.get_running_loop().create_future()
                fut.set_exception(RuntimeError("Raft node is not running"))
                return fut

            if self.role != Role.LEADER:
                fut = asyncio.get_running_loop().create_future()
                fut.set_exception(RuntimeError(f"Not leader. Current leader is {self.leader_id}"))
                return fut

            new_index = self.log_storage.last_log_index + 1
            entry = LogEntry(
                index=new_index,
                term=self.current_term,
                command_type=command_type,
                data=data,
                timestamp_ms=timestamp_ms,
            )
            self.log_storage.append(entry)

            fut = asyncio.get_running_loop().create_future()
            self._commit_waiters[new_index] = fut

            # Fast path for single node cluster
            if not self.peers:
                self.commit_index = new_index
                self._apply_entries()
                return fut

            # Broadcast to followers
            await self._broadcast_append_entries()
            return fut

    def _apply_entries(self) -> None:
        """Applies committed log entries to the state machine up to commit_index."""
        while self.last_applied < self.commit_index:
            self.last_applied += 1
            entry = self.log_storage.get_entry(self.last_applied)
            if entry is not None:
                if self.on_apply_entry:
                    try:
                        self.on_apply_entry(entry)
                    except Exception as e:
                        logger.exception(f"[{self.node_id}] Error applying entry {entry.index} to state machine: {e}")

                # Notify commit waiter if any
                waiter = self._commit_waiters.pop(self.last_applied, None)
                if waiter and not waiter.done():
                    waiter.set_result(True)

    # =========================================================================
    # AppendEntries & Heartbeat Logic
    # =========================================================================

    async def _on_heartbeat_tick(self) -> None:
        """Periodic heartbeat tick fired by HeartbeatTimer on the leader."""
        async with self._lock:
            if not self._running or self.role != Role.LEADER:
                return
            await self._broadcast_append_entries()

    async def _broadcast_append_entries(self) -> None:
        """Sends AppendEntries RPC to all peers."""
        if not self.peers or not self.transport:
            return

        for peer in self.peers:
            prev_log_index = self.next_index.get(peer, self.log_storage.last_log_index + 1) - 1
            prev_log_term = 0
            if prev_log_index > 0:
                entry = self.log_storage.get_entry(prev_log_index)
                if entry:
                    prev_log_term = entry.term

            entries = self.log_storage.get_entries_from(prev_log_index + 1)

            args = AppendEntriesArgs(
                term=self.current_term,
                leader_id=self.node_id,
                prev_log_index=prev_log_index,
                prev_log_term=prev_log_term,
                entries=entries,
                leader_commit=self.commit_index,
            )

            task = asyncio.create_task(self._send_append_entries_to_peer(peer, args))
            self._heartbeat_tasks.add(task)
            task.add_done_callback(self._heartbeat_tasks.discard)

    async def _send_append_entries_to_peer(self, peer: str, args: AppendEntriesArgs) -> None:
        """Sends AppendEntries to a single peer and processes reply."""
        if not self.transport:
            return
        reply = await self.transport.send_append_entries(peer, args)
        if reply is None:
            return

        async with self._lock:
            if not self._running or self.role != Role.LEADER or self.current_term != args.term:
                return

            if reply.term > self.current_term:
                logger.info(f"[{self.node_id}] Heartbeat to {peer} revealed higher term {reply.term}. Stepping down.")
                await self._step_down(reply.term)
                return

            if reply.success:
                # Update nextIndex and matchIndex for follower (§5.3)
                if reply.match_index > self.match_index.get(peer, 0):
                    self.match_index[peer] = reply.match_index
                    self.next_index[peer] = reply.match_index + 1
                    # Check if any new entries can be committed (Phase 3)
                    await self._check_commit_index()
            else:
                # AppendEntries failed due to log inconsistency -> decrement nextIndex (§5.3)
                if reply.conflict_index > 0:
                    self.next_index[peer] = min(reply.conflict_index, self.log_storage.last_log_index + 1)
                elif self.next_index.get(peer, 1) > 1:
                    self.next_index[peer] = max(1, self.next_index[peer] - 1)

    async def handle_append_entries(self, args: AppendEntriesArgs) -> AppendEntriesReply:
        """Handler for incoming AppendEntries (heartbeat and log replication)."""
        async with self._lock:
            # 1. Reply false if term < currentTerm (§5.1)
            if args.term < self.current_term:
                return AppendEntriesReply(term=self.current_term, success=False)

            # If term >= currentTerm and we are Candidate or discover new term, step down (§5.1, §5.2)
            if args.term > self.current_term or self.role == Role.CANDIDATE:
                await self._step_down(args.term, new_leader=args.leader_id)
            else:
                old_leader = self.leader_id
                self.leader_id = args.leader_id
                self.election_timer.reset()
                if old_leader != self.leader_id and self.on_leadership_change:
                    self.on_leadership_change(self.role, self.leader_id, self.current_term)

            # 2. Reply false if log doesn't contain an entry at prevLogIndex matching prevLogTerm (§5.3)
            if args.prev_log_index > 0:
                entry = self.log_storage.get_entry(args.prev_log_index)
                if entry is None or entry.term != args.prev_log_term:
                    # Provide conflict index for fast convergence
                    conflict_idx = min(self.log_storage.last_log_index, args.prev_log_index - 1)
                    return AppendEntriesReply(
                        term=self.current_term,
                        success=False,
                        match_index=self.log_storage.last_log_index,
                        conflict_index=max(1, conflict_idx),
                    )

            # 3. If an existing entry conflicts with a new one (same index, different term), delete existing (§5.3)
            insert_index = args.prev_log_index + 1
            for i, new_entry in enumerate(args.entries):
                existing = self.log_storage.get_entry(new_entry.index)
                if existing is not None:
                    if existing.term != new_entry.term:
                        # Conflict found: truncate log from this index onwards
                        self.log_storage.truncate_suffix(new_entry.index)
                        # Append all remaining new entries
                        self.log_storage.append_entries(args.entries[i:])
                        break
                else:
                    # No conflict, append all remaining entries
                    self.log_storage.append_entries(args.entries[i:])
                    break

            # 4. If leaderCommit > commitIndex, set commitIndex = min(leaderCommit, index of last new entry) (§5.3)
            if args.leader_commit > self.commit_index:
                last_new_entry_index = args.prev_log_index + len(args.entries)
                self.commit_index = min(args.leader_commit, last_new_entry_index)
                self._apply_entries()

            return AppendEntriesReply(
                term=self.current_term,
                success=True,
                match_index=self.log_storage.last_log_index,
            )

    async def _check_commit_index(self) -> None:
        """
        Leader checks if there exists an N > commitIndex such that a majority of
        matchIndex[i] >= N, and log[N].term == currentTerm (§5.3, §5.4.2 Figure 8).
        """
        if self.role != Role.LEADER:
            return

        last_index = self.log_storage.last_log_index
        for n in range(last_index, self.commit_index, -1):
            entry = self.log_storage.get_entry(n)
            if entry is None:
                continue

            # CRITICAL FIGURE 8 RULE: Raft never commits log entries from previous terms
            # by counting replicas directly. Only current-term entries are committed by replica count!
            if entry.term != self.current_term:
                continue

            # Count replicas (self + peers with matchIndex >= n)
            matches = 1  # self
            for peer in self.peers:
                if self.match_index.get(peer, 0) >= n:
                    matches += 1

            if matches >= self.quorum_size:
                self.commit_index = n
                logger.info(f"[{self.node_id}] Advanced commit_index to {self.commit_index}")
                self._apply_entries()
                break


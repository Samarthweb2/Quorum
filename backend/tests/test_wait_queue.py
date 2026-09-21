"""
Tests for Server-Side Lock Wait Queues (FIFO Queueing) & Auto-Promotion.
Verifies fair queuing, monotonic fencing token increments upon automatic promotion,
waiter timeout pruning, CANCEL_WAIT, and snapshot persistence.
"""

from __future__ import annotations

import json
import pytest

from quorum.raft.storage import LogEntry
from quorum.state_machine.lock_manager import LockStateMachine


def test_lock_wait_queue_fifo_and_auto_promotion():
    """
    Client 1 acquires lock.
    Client 2 attempts acquire with wait_if_busy=True -> QUEUED at position 1.
    Client 3 attempts acquire with wait_if_busy=True -> QUEUED at position 2.
    Client 1 releases lock -> Client 2 is automatically promoted with fence_token=2!
    Client 2 releases lock -> Client 3 is automatically promoted with fence_token=3!
    """
    sm = LockStateMachine()

    # 1. Client 1 acquires lock
    e1 = LogEntry(index=1, term=1, command_type="ACQUIRE", data={"key": "db-lock", "client_id": "c1", "ttl_ms": 5000}, timestamp_ms=1000)
    r1 = sm.apply(e1)
    assert r1.success is True
    assert r1.status == "ACQUIRED"
    assert r1.fence_token == 1

    # 2. Client 2 requests lock with wait_if_busy
    e2 = LogEntry(
        index=2, term=1, command_type="ACQUIRE",
        data={"key": "db-lock", "client_id": "c2", "ttl_ms": 4000, "wait_if_busy": True, "wait_timeout_ms": 10000},
        timestamp_ms=1100
    )
    r2 = sm.apply(e2)
    assert r2.success is False
    assert r2.status == "QUEUED"
    assert r2.queue_position == 1

    # 3. Client 3 requests lock with wait_if_busy
    e3 = LogEntry(
        index=3, term=1, command_type="ACQUIRE",
        data={"key": "db-lock", "client_id": "c3", "ttl_ms": 3000, "wait_if_busy": True, "wait_timeout_ms": 10000},
        timestamp_ms=1200
    )
    r3 = sm.apply(e3)
    assert r3.success is False
    assert r3.status == "QUEUED"
    assert r3.queue_position == 2

    # Check wait queue inspection helpers
    queue = sm.get_wait_queue("db-lock")
    assert len(queue) == 2
    assert queue[0]["client_id"] == "c2"
    assert queue[1]["client_id"] == "c3"
    assert sm.get_queue_position("db-lock", "c2") == 1
    assert sm.get_queue_position("db-lock", "c3") == 2

    # 4. Client 1 releases lock -> Client 2 is automatically promoted
    e4 = LogEntry(index=4, term=1, command_type="RELEASE", data={"key": "db-lock", "client_id": "c1", "fence_token": 1}, timestamp_ms=1500)
    r4 = sm.apply(e4)
    assert r4.success is True
    assert r4.status == "RELEASED_AND_PROMOTED"
    assert r4.promoted_owner == "c2"
    assert r4.fence_token == 2  # Monotonically incremented!

    # Active lock is now held by c2
    current = sm.get_lock("db-lock", 1600)
    assert current is not None
    assert current.owner == "c2"
    assert current.fence_token == 2

    # Queue now only has c3 at position 1
    assert len(sm.get_wait_queue("db-lock")) == 1
    assert sm.get_queue_position("db-lock", "c3") == 1

    # 5. Client 2 releases lock -> Client 3 is automatically promoted
    e5 = LogEntry(index=5, term=1, command_type="RELEASE", data={"key": "db-lock", "client_id": "c2", "fence_token": 2}, timestamp_ms=2000)
    r5 = sm.apply(e5)
    assert r5.success is True
    assert r5.status == "RELEASED_AND_PROMOTED"
    assert r5.promoted_owner == "c3"
    assert r5.fence_token == 3

    # Active lock is now held by c3
    current3 = sm.get_lock("db-lock", 2100)
    assert current3 is not None
    assert current3.owner == "c3"
    assert current3.fence_token == 3

    # Wait queue is empty
    assert len(sm.get_wait_queue("db-lock")) == 0

    # 6. Client 3 releases lock -> Queue empty, lock deleted
    e6 = LogEntry(index=6, term=1, command_type="RELEASE", data={"key": "db-lock", "client_id": "c3", "fence_token": 3}, timestamp_ms=2500)
    r6 = sm.apply(e6)
    assert r6.success is True
    assert r6.status == "RELEASED"
    assert sm.get_lock("db-lock", 2600) is None


def test_lock_wait_queue_timeout_pruning():
    """
    If a queued waiter's wait_timeout_ms has elapsed before the lock is released,
    it is pruned during promotion and the next eligible waiter is promoted.
    """
    sm = LockStateMachine()

    # c1 acquires
    sm.apply(LogEntry(index=1, term=1, command_type="ACQUIRE", data={"key": "k1", "client_id": "c1", "ttl_ms": 10000}, timestamp_ms=1000))

    # c2 queues with wait_timeout_ms=500 (expires at ts=1600)
    sm.apply(LogEntry(
        index=2, term=1, command_type="ACQUIRE",
        data={"key": "k1", "client_id": "c2", "ttl_ms": 5000, "wait_if_busy": True, "wait_timeout_ms": 500},
        timestamp_ms=1100
    ))

    # c3 queues with wait_timeout_ms=10000 (expires at ts=11200)
    sm.apply(LogEntry(
        index=3, term=1, command_type="ACQUIRE",
        data={"key": "k1", "client_id": "c3", "ttl_ms": 5000, "wait_if_busy": True, "wait_timeout_ms": 10000},
        timestamp_ms=1200
    ))

    # c1 releases at ts=2000 (c2's wait has expired at 1600, but c3 is valid)
    r = sm.apply(LogEntry(index=4, term=1, command_type="RELEASE", data={"key": "k1", "client_id": "c1", "fence_token": 1}, timestamp_ms=2000))
    assert r.status == "RELEASED_AND_PROMOTED"
    assert r.promoted_owner == "c3"  # c2 was skipped due to timeout!
    assert r.fence_token == 2


def test_lock_wait_queue_cancel_wait():
    """
    Client can cancel its position in the wait queue with CANCEL_WAIT.
    """
    sm = LockStateMachine()
    sm.apply(LogEntry(index=1, term=1, command_type="ACQUIRE", data={"key": "k1", "client_id": "c1", "ttl_ms": 5000}, timestamp_ms=1000))
    sm.apply(LogEntry(index=2, term=1, command_type="ACQUIRE", data={"key": "k1", "client_id": "c2", "wait_if_busy": True}, timestamp_ms=1100))
    assert len(sm.get_wait_queue("k1")) == 1

    cancel_res = sm.apply(LogEntry(index=3, term=1, command_type="CANCEL_WAIT", data={"key": "k1", "client_id": "c2"}, timestamp_ms=1200))
    assert cancel_res.status == "CANCELLED"
    assert len(sm.get_wait_queue("k1")) == 0


def test_lock_wait_queue_snapshot_persistence():
    """
    Wait queues are accurately exported into snapshot bytes and restored on reboot.
    """
    sm1 = LockStateMachine()
    sm1.apply(LogEntry(index=1, term=1, command_type="ACQUIRE", data={"key": "res", "client_id": "c1", "ttl_ms": 5000}, timestamp_ms=1000))
    sm1.apply(LogEntry(index=2, term=1, command_type="ACQUIRE", data={"key": "res", "client_id": "c2", "wait_if_busy": True, "ttl_ms": 3000}, timestamp_ms=1100))

    snap = sm1.export_snapshot()

    sm2 = LockStateMachine()
    sm2.import_snapshot(snap)

    assert sm2.fencing_token_counter == 1
    assert "res" in sm2.locks
    assert sm2.locks["res"].owner == "c1"
    assert len(sm2.get_wait_queue("res")) == 1
    assert sm2.get_wait_queue("res")[0]["client_id"] == "c2"

    # Releasing in restored state machine promotes c2
    r = sm2.apply(LogEntry(index=3, term=1, command_type="RELEASE", data={"key": "res", "client_id": "c1", "fence_token": 1}, timestamp_ms=1200))
    assert r.status == "RELEASED_AND_PROMOTED"
    assert r.promoted_owner == "c2"
    assert r.fence_token == 2

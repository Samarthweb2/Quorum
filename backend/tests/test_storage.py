"""
Unit tests for persistent StateStorage and LogStorage (WAL).
"""

import os
import struct
import zlib
from pathlib import Path
import pytest

from quorum.raft.storage import HEADER_FORMAT, HEADER_SIZE, MAGIC, LogEntry, LogStorage, StateStorage


def test_state_storage_empty(tmp_path: Path):
    storage = StateStorage(tmp_path)
    assert storage.current_term == 0
    assert storage.voted_for is None


def test_state_storage_save_and_reload(tmp_path: Path):
    storage1 = StateStorage(tmp_path)
    storage1.save(current_term=3, voted_for="node-2")
    assert storage1.current_term == 3
    assert storage1.voted_for == "node-2"

    # Reload from fresh instance
    storage2 = StateStorage(tmp_path)
    assert storage2.current_term == 3
    assert storage2.voted_for == "node-2"

    # Update term again
    storage2.save(current_term=4, voted_for="node-1")
    storage3 = StateStorage(tmp_path)
    assert storage3.current_term == 4
    assert storage3.voted_for == "node-1"


def test_log_storage_empty(tmp_path: Path):
    log = LogStorage(tmp_path)
    assert len(log) == 0
    assert log.last_log_index == 0
    assert log.last_log_term == 0
    assert log.get_entry(1) is None
    assert log.get_entries_from(1) == []


def test_log_storage_append_and_reload(tmp_path: Path):
    log1 = LogStorage(tmp_path)
    entries = [
        LogEntry(index=1, term=1, command_type="ACQUIRE", data={"key": "lock1", "owner": "client-A"}, timestamp_ms=1000),
        LogEntry(index=2, term=1, command_type="RENEW", data={"key": "lock1", "token": 1}, timestamp_ms=2000),
        LogEntry(index=3, term=2, command_type="RELEASE", data={"key": "lock1"}, timestamp_ms=3000),
    ]
    log1.append_entries(entries)

    assert len(log1) == 3
    assert log1.last_log_index == 3
    assert log1.last_log_term == 2
    assert log1.get_entry(2).command_type == "RENEW"

    # Fetch slices
    slice_entries = log1.get_entries_from(start_index=2, max_entries=2)
    assert len(slice_entries) == 2
    assert [e.index for e in slice_entries] == [2, 3]

    # Reload in fresh LogStorage instance
    log2 = LogStorage(tmp_path)
    assert len(log2) == 3
    assert log2.last_log_index == 3
    assert log2.last_log_term == 2
    assert log2.get_entry(1).data["owner"] == "client-A"
    assert log2.get_entry(3).term == 2


def test_log_storage_truncation(tmp_path: Path):
    log = LogStorage(tmp_path)
    entries = [
        LogEntry(index=1, term=1, command_type="CMD1"),
        LogEntry(index=2, term=1, command_type="CMD2"),
        LogEntry(index=3, term=1, command_type="CMD3"),
        LogEntry(index=4, term=1, command_type="CMD4_OLD"),
        LogEntry(index=5, term=1, command_type="CMD5_OLD"),
    ]
    log.append_entries(entries)
    assert len(log) == 5

    # Truncate starting at index 4 (remove 4 and 5)
    log.truncate_suffix(from_index=4)
    assert len(log) == 3
    assert log.last_log_index == 3
    assert log.get_entry(4) is None

    # Append new entries at index 4 with term 2
    new_entry = LogEntry(index=4, term=2, command_type="CMD4_NEW")
    log.append(new_entry)
    assert len(log) == 4
    assert log.last_log_index == 4
    assert log.last_log_term == 2

    # Reload from disk and verify
    reloaded = LogStorage(tmp_path)
    assert len(reloaded) == 4
    assert reloaded.last_log_index == 4
    assert reloaded.last_log_term == 2
    assert reloaded.get_entry(4).command_type == "CMD4_NEW"


def test_log_storage_durability_crash_torn_header(tmp_path: Path):
    log = LogStorage(tmp_path)
    log.append_entries([
        LogEntry(index=1, term=1, command_type="CMD1"),
        LogEntry(index=2, term=1, command_type="CMD2"),
    ])
    wal_file = tmp_path / "raft.wal"

    # Simulate crash mid-header: append 6 bytes of garbage
    with open(wal_file, "ab") as f:
        f.write(b"QLOG\x00\x01")

    # Recovery should ignore the torn header and keep the 2 valid entries
    reloaded = LogStorage(tmp_path)
    assert len(reloaded) == 2
    assert reloaded.last_log_index == 2

    # Further append should work cleanly
    reloaded.append(LogEntry(index=3, term=1, command_type="CMD3"))
    assert len(reloaded) == 3
    assert reloaded.last_log_index == 3


def test_log_storage_durability_crash_torn_payload(tmp_path: Path):
    log = LogStorage(tmp_path)
    log.append_entries([
        LogEntry(index=1, term=1, command_type="CMD1"),
    ])
    wal_file = tmp_path / "raft.wal"

    # Append a valid header declaring payload_len=100, but only write 25 bytes
    fake_payload_len = 100
    fake_crc = 12345
    header = struct.pack(HEADER_FORMAT, MAGIC, fake_payload_len, fake_crc)
    with open(wal_file, "ab") as f:
        f.write(header)
        f.write(b"partial payload bytes only")

    # Recovery should discard the torn record
    reloaded = LogStorage(tmp_path)
    assert len(reloaded) == 1
    assert reloaded.last_log_index == 1


def test_log_storage_crc_corruption(tmp_path: Path):
    log = LogStorage(tmp_path)
    e1 = LogEntry(index=1, term=1, command_type="CMD1")
    e2 = LogEntry(index=2, term=1, command_type="CMD2")
    log.append_entries([e1, e2])
    wal_file = tmp_path / "raft.wal"

    # Corrupt a byte in the second entry's payload
    file_bytes = bytearray(wal_file.read_bytes())
    # Find last occurrence of "CMD2" and corrupt it
    pos = file_bytes.rfind(b"CMD2")
    assert pos != -1
    file_bytes[pos] = ord(b"X")
    wal_file.write_bytes(bytes(file_bytes))

    # Recovery should detect CRC mismatch on entry 2 and recover only entry 1
    reloaded = LogStorage(tmp_path)
    assert len(reloaded) == 1
    assert reloaded.last_log_index == 1
    assert reloaded.get_entry(1).command_type == "CMD1"


def test_log_storage_snapshot_and_compaction(tmp_path: Path):
    log = LogStorage(tmp_path)
    entries = [
        LogEntry(index=1, term=1, command_type="ACQUIRE"),
        LogEntry(index=2, term=1, command_type="RENEW"),
        LogEntry(index=3, term=2, command_type="RELEASE"),
        LogEntry(index=4, term=2, command_type="ACQUIRE"),
        LogEntry(index=5, term=2, command_type="RENEW"),
    ]
    log.append_entries(entries)
    assert len(log) == 5
    assert log.last_log_index == 5

    # Take snapshot up to index 3
    fake_state = b'{"fencing_token_counter": 10, "locks": {}}'
    log.save_snapshot(last_included_index=3, last_included_term=2, data=fake_state)
    log.compact_prefix(up_to_index=3)

    # After compaction: only entries 4 and 5 remain in WAL
    assert len(log) == 2
    assert log.last_log_index == 5
    assert log.last_included_index == 3
    assert log.last_included_term == 2
    assert log.first_log_index == 4
    assert [e.index for e in log.entries] == [4, 5]

    # Reload fresh LogStorage from disk
    reloaded = LogStorage(tmp_path)
    assert len(reloaded) == 2
    assert reloaded.last_included_index == 3
    assert reloaded.last_included_term == 2
    assert reloaded.last_log_index == 5
    assert [e.index for e in reloaded.entries] == [4, 5]

    idx, term, data = reloaded.load_snapshot()
    assert idx == 3
    assert term == 2
    assert data == fake_state


def test_lock_state_machine_snapshot():
    from quorum.state_machine.lock_manager import LockStateMachine
    sm = LockStateMachine()
    e1 = LogEntry(index=1, term=1, command_type="ACQUIRE", data={"key": "db", "client_id": "c1", "ttl_ms": 10000}, timestamp_ms=1000)
    res = sm.apply(e1)
    assert res.success
    assert res.fence_token == 1

    # Export snapshot
    snap_bytes = sm.export_snapshot()

    # Create new fresh state machine and restore
    sm2 = LockStateMachine()
    assert len(sm2.locks) == 0
    sm2.import_snapshot(snap_bytes)

    assert sm2.last_applied_index == 1
    assert sm2.fencing_token_counter == 1
    assert "db" in sm2.locks
    assert sm2.locks["db"].owner == "c1"
    assert sm2.locks["db"].fence_token == 1


def test_raft_node_restores_snapshot_into_state_machine_on_boot(tmp_path: Path):
    from quorum.raft.node import RaftNode
    from quorum.state_machine.lock_manager import LockStateMachine

    # 1. Prepare disk with snapshot
    log = LogStorage(tmp_path)
    sm_initial = LockStateMachine()
    e1 = LogEntry(index=1, term=1, command_type="ACQUIRE", data={"key": "prod-db", "client_id": "worker-1", "ttl_ms": 60000}, timestamp_ms=5000)
    sm_initial.apply(e1)
    snap_data = sm_initial.export_snapshot()

    log.save_snapshot(last_included_index=1, last_included_term=1, data=snap_data)
    log.compact_prefix(up_to_index=1)

    # 2. Boot a fresh RaftNode with fresh StateMachine
    sm_reloaded = LockStateMachine()
    node = RaftNode(
        node_id="node-test",
        peers=[],
        data_dir=tmp_path,
        on_apply_entry=sm_reloaded.apply,
        on_restore_snapshot=sm_reloaded.import_snapshot,
    )

    # Verify that the state machine was automatically restored from disk snapshot
    assert sm_reloaded.last_applied_index == 1
    assert sm_reloaded.fencing_token_counter == 1
    assert "prod-db" in sm_reloaded.locks
    assert sm_reloaded.locks["prod-db"].owner == "worker-1"
    assert sm_reloaded.locks["prod-db"].fence_token == 1


def test_state_machine_results_cache_bounded():
    from quorum.state_machine.lock_manager import LockStateMachine
    sm = LockStateMachine()

    # Apply 1200 entries
    for i in range(1, 1201):
        entry = LogEntry(
            index=i,
            term=1,
            command_type="ACQUIRE",
            data={"key": f"key-{i}", "client_id": "client-1", "ttl_ms": 5000},
            timestamp_ms=1000 + i,
        )
        sm.apply(entry)

    # Cache should be bounded to 1000 entries
    assert len(sm._results_cache) == 1000
    # Old entries (1..200) evicted
    assert sm.get_result(1) is None
    assert sm.get_result(200) is None
    # Recent entries (201..1200) preserved
    assert sm.get_result(201) is not None
    assert sm.get_result(1200) is not None


def test_state_machine_get_active_locks():
    from quorum.state_machine.lock_manager import LockStateMachine
    sm = LockStateMachine()

    e1 = LogEntry(index=1, term=1, command_type="ACQUIRE", data={"key": "short-lock", "client_id": "c1", "ttl_ms": 500}, timestamp_ms=1000)
    e2 = LogEntry(index=2, term=1, command_type="ACQUIRE", data={"key": "long-lock", "client_id": "c2", "ttl_ms": 5000}, timestamp_ms=1000)
    sm.apply(e1)
    sm.apply(e2)

    # At t=1100, both active
    active_1100 = sm.get_active_locks(1100)
    assert "short-lock" in active_1100
    assert "long-lock" in active_1100

    # At t=1600 (short-lock expired at 1500), only long-lock active
    active_1600 = sm.get_active_locks(1600)
    assert "short-lock" not in active_1600
    assert "long-lock" in active_1600

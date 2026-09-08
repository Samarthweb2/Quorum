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

"""
Persistent storage for Raft state and log entries.

Implements:
1. StateStorage: Atomic persistence of current_term and voted_for with fsync and atomic rename.
2. LogStorage: Framed append-only Write-Ahead-Log (WAL) with CRC32 checksums, fsync durability,
   in-memory index offset caching, log truncation, and automatic torn-write recovery on restart.
"""

from __future__ import annotations

import json
import os
import struct
import zlib
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, List, Optional, Tuple

# Frame format:
# [MAGIC: 4 bytes "QLOG"] [PAYLOAD_LEN: 4 bytes unsigned int] [CRC32: 4 bytes unsigned int] [PAYLOAD: N bytes]
MAGIC = b"QLOG"
HEADER_FORMAT = ">4sII"
HEADER_SIZE = struct.calcsize(HEADER_FORMAT)  # 12 bytes

# Snapshot frame format:
# [MAGIC: 4 bytes "QSNP"] [LAST_INCLUDED_INDEX: 8 bytes uint64] [LAST_INCLUDED_TERM: 8 bytes uint64] [DATA_LEN: 4 bytes uint32] [CRC32: 4 bytes uint32] [DATA: N bytes]
SNAPSHOT_MAGIC = b"QSNP"
SNAPSHOT_HEADER_FORMAT = ">4sQQII"
SNAPSHOT_HEADER_SIZE = struct.calcsize(SNAPSHOT_HEADER_FORMAT)  # 28 bytes


@dataclass
class LogEntry:
    """A single Raft log entry."""
    index: int
    term: int
    command_type: str = "NOOP"
    data: Optional[dict[str, Any]] = None
    timestamp_ms: int = 0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> LogEntry:
        return cls(
            index=d["index"],
            term=d["term"],
            command_type=d.get("command_type", "NOOP"),
            data=d.get("data"),
            timestamp_ms=d.get("timestamp_ms", 0),
        )

    def serialize(self) -> bytes:
        return json.dumps(self.to_dict(), separators=(",", ":")).encode("utf-8")

    @classmethod
    def deserialize(cls, b: bytes) -> LogEntry:
        d = json.loads(b.decode("utf-8"))
        return cls.from_dict(d)


class StateStorage:
    """
    Manages persistent Raft metadata (current_term and voted_for).
    Uses atomic file replacement and fsync to prevent partial writes.
    """

    def __init__(self, data_dir: str | Path) -> None:
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.state_file = self.data_dir / "state.json"
        self.tmp_file = self.data_dir / "state.json.tmp"
        self.current_term: int = 0
        self.voted_for: Optional[str] = None
        self._load()

    def _load(self) -> None:
        if not self.state_file.exists():
            self.current_term = 0
            self.voted_for = None
            return

        try:
            with open(self.state_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                self.current_term = int(data.get("current_term", 0))
                self.voted_for = data.get("voted_for")
        except Exception:
            # If reading state file fails, fall back to defaults or crash
            self.current_term = 0
            self.voted_for = None

    def save(self, current_term: int, voted_for: Optional[str]) -> None:
        """
        Atomically persist current_term and voted_for with fsync.
        """
        self.current_term = current_term
        self.voted_for = voted_for

        payload = json.dumps(
            {"current_term": self.current_term, "voted_for": self.voted_for},
            indent=2,
        ).encode("utf-8")

        # Write to temporary file with explicit flush and fsync
        with open(self.tmp_file, "wb") as f:
            f.write(payload)
            f.flush()
            os.fsync(f.fileno())

        # Atomic replace
        os.replace(self.tmp_file, self.state_file)

        # Sync parent directory on POSIX systems if supported
        try:
            dir_fd = os.open(str(self.data_dir), os.O_RDONLY)
            try:
                os.fsync(dir_fd)
            finally:
                os.close(dir_fd)
        except (AttributeError, OSError, PermissionError):
            pass  # Windows or filesystem without directory sync support


class LogStorage:
    """
    Append-only Write-Ahead Log (WAL) with CRC32 checksumming, atomic fsync,
    log truncation, and crash recovery.
    """

    def __init__(self, data_dir: str | Path) -> None:
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.wal_path = self.data_dir / "raft.wal"
        self.wal_tmp_path = self.data_dir / "raft.wal.tmp"
        self.snapshot_path = self.data_dir / "snapshot.bin"
        self.snapshot_tmp_path = self.data_dir / "snapshot.bin.tmp"

        self.last_included_index: int = 0
        self.last_included_term: int = 0
        self._load_snapshot_metadata()

        # In-memory index
        self._entries: List[LogEntry] = []
        self._offsets: List[int] = []  # byte offset in file for each entry

        self._recover_and_index()

    def _load_snapshot_metadata(self) -> None:
        """Reads snapshot header to set last_included_index and last_included_term."""
        if not self.snapshot_path.exists():
            return
        try:
            with open(self.snapshot_path, "rb") as f:
                header_bytes = f.read(SNAPSHOT_HEADER_SIZE)
                if len(header_bytes) < SNAPSHOT_HEADER_SIZE:
                    return
                magic, last_idx, last_term, data_len, expected_crc = struct.unpack(
                    SNAPSHOT_HEADER_FORMAT, header_bytes
                )
                if magic != SNAPSHOT_MAGIC:
                    return
                data_bytes = f.read(data_len)
                if len(data_bytes) == data_len and zlib.crc32(data_bytes) == expected_crc:
                    self.last_included_index = last_idx
                    self.last_included_term = last_term
        except Exception:
            pass

    def load_snapshot(self) -> Tuple[int, int, Optional[bytes]]:
        """Loads and validates the snapshot from disk, returning (last_included_index, last_included_term, data)."""
        if not self.snapshot_path.exists():
            return (self.last_included_index, self.last_included_term, None)
        try:
            with open(self.snapshot_path, "rb") as f:
                header_bytes = f.read(SNAPSHOT_HEADER_SIZE)
                if len(header_bytes) < SNAPSHOT_HEADER_SIZE:
                    return (self.last_included_index, self.last_included_term, None)
                magic, last_idx, last_term, data_len, expected_crc = struct.unpack(
                    SNAPSHOT_HEADER_FORMAT, header_bytes
                )
                if magic != SNAPSHOT_MAGIC:
                    return (self.last_included_index, self.last_included_term, None)
                data_bytes = f.read(data_len)
                if len(data_bytes) == data_len and zlib.crc32(data_bytes) == expected_crc:
                    self.last_included_index = last_idx
                    self.last_included_term = last_term
                    return (last_idx, last_term, data_bytes)
        except Exception:
            pass
        return (self.last_included_index, self.last_included_term, None)

    def save_snapshot(self, last_included_index: int, last_included_term: int, data: bytes) -> None:
        """Atomically saves snapshot to disk with CRC32 framing and fsync."""
        data_len = len(data)
        crc = zlib.crc32(data)
        header = struct.pack(
            SNAPSHOT_HEADER_FORMAT,
            SNAPSHOT_MAGIC,
            last_included_index,
            last_included_term,
            data_len,
            crc,
        )
        with open(self.snapshot_tmp_path, "wb") as f:
            f.write(header)
            f.write(data)
            f.flush()
            os.fsync(f.fileno())

        os.replace(self.snapshot_tmp_path, self.snapshot_path)
        self.last_included_index = last_included_index
        self.last_included_term = last_included_term

    def compact_prefix(self, up_to_index: int) -> None:
        """
        Discards all entries in memory and WAL with index <= up_to_index.
        Rewrites the remaining entries to a compacted WAL atomically.
        """
        keep_entries = [e for e in self._entries if e.index > up_to_index]
        self._entries = keep_entries
        self._offsets = []

        with open(self.wal_tmp_path, "wb") as f:
            for entry in keep_entries:
                record_offset = f.tell()
                payload = entry.serialize()
                payload_len = len(payload)
                crc = zlib.crc32(payload)
                header = struct.pack(HEADER_FORMAT, MAGIC, payload_len, crc)
                f.write(header)
                f.write(payload)
                self._offsets.append(record_offset)
            f.flush()
            os.fsync(f.fileno())

        os.replace(self.wal_tmp_path, self.wal_path)

    def _recover_and_index(self) -> None:
        """
        Scans the WAL from disk, validates CRC32 checksums, and builds
        the in-memory index. If a torn or corrupted record is detected at EOF,
        truncates the file to the last known valid offset.
        """
        self._entries = []
        self._offsets = []

        if not self.wal_path.exists():
            return

        valid_file_offset = 0
        file_size = self.wal_path.stat().st_size

        with open(self.wal_path, "r+b") as f:
            while True:
                record_offset = f.tell()
                header_bytes = f.read(HEADER_SIZE)

                if not header_bytes:
                    # Clean EOF
                    valid_file_offset = record_offset
                    break

                if len(header_bytes) < HEADER_SIZE:
                    # Partial header written before crash -> torn write at EOF
                    break

                magic, payload_len, expected_crc = struct.unpack(HEADER_FORMAT, header_bytes)
                if magic != MAGIC:
                    # Corrupted magic bytes
                    break

                payload_bytes = f.read(payload_len)
                if len(payload_bytes) < payload_len:
                    # Partial payload written before crash -> torn write at EOF
                    break

                actual_crc = zlib.crc32(payload_bytes)
                if actual_crc != expected_crc:
                    # Corrupted payload checksum mismatch
                    break

                try:
                    entry = LogEntry.deserialize(payload_bytes)
                except Exception:
                    # Corrupted JSON / schema
                    break

                self._entries.append(entry)
                self._offsets.append(record_offset)
                valid_file_offset = f.tell()

            # If there was a torn write or corruption after valid_file_offset, truncate it
            if valid_file_offset < file_size:
                f.seek(valid_file_offset)
                f.truncate()
                f.flush()
                os.fsync(f.fileno())

    def append_entries(self, new_entries: List[LogEntry]) -> None:
        """
        Appends entries to the WAL file with immediate fsync durability.
        """
        if not new_entries:
            return

        with open(self.wal_path, "a+b") as f:
            # Seek to EOF
            f.seek(0, os.SEEK_END)

            for entry in new_entries:
                record_offset = f.tell()
                payload = entry.serialize()
                payload_len = len(payload)
                crc = zlib.crc32(payload)

                header = struct.pack(HEADER_FORMAT, MAGIC, payload_len, crc)
                f.write(header)
                f.write(payload)

                self._entries.append(entry)
                self._offsets.append(record_offset)

            f.flush()
            os.fsync(f.fileno())

    def append(self, entry: LogEntry) -> None:
        self.append_entries([entry])

    def truncate_suffix(self, from_index: int) -> None:
        """
        Deletes the entry at from_index and all subsequent entries from both
        in-memory index and disk WAL.
        Used when a follower discovers conflict with leader log.
        """
        if not self._entries:
            return

        # Find entry with index >= from_index
        truncate_pos = -1
        for i, entry in enumerate(self._entries):
            if entry.index >= from_index:
                truncate_pos = i
                break

        if truncate_pos == -1:
            return  # No entries to truncate

        truncate_offset = self._offsets[truncate_pos]

        # Truncate file on disk
        with open(self.wal_path, "r+b") as f:
            f.seek(truncate_offset)
            f.truncate()
            f.flush()
            os.fsync(f.fileno())

        # Truncate in-memory structures
        self._entries = self._entries[:truncate_pos]
        self._offsets = self._offsets[:truncate_pos]

    def get_entry(self, index: int) -> Optional[LogEntry]:
        """Gets log entry by 1-based index."""
        if not self._entries:
            return None
        first_index = self._entries[0].index
        pos = index - first_index
        if 0 <= pos < len(self._entries):
            entry = self._entries[pos]
            if entry.index == index:
                return entry
        # Fallback search
        for entry in self._entries:
            if entry.index == index:
                return entry
        return None

    def get_entries_from(self, start_index: int, max_entries: Optional[int] = None) -> List[LogEntry]:
        """Returns entries starting from start_index up to max_entries."""
        if not self._entries:
            return []

        start_pos = -1
        for i, entry in enumerate(self._entries):
            if entry.index >= start_index:
                start_pos = i
                break

        if start_pos == -1:
            return []

        if max_entries is not None:
            return self._entries[start_pos : start_pos + max_entries]
        return self._entries[start_pos:]

    @property
    def last_log_index(self) -> int:
        if not self._entries:
            return self.last_included_index
        return self._entries[-1].index

    @property
    def last_log_term(self) -> int:
        if not self._entries:
            return self.last_included_term
        return self._entries[-1].term

    @property
    def first_log_index(self) -> int:
        if not self._entries:
            return self.last_included_index + 1
        return self._entries[0].index

    @property
    def entries(self) -> List[LogEntry]:
        return list(self._entries)

    def __len__(self) -> int:
        return len(self._entries)

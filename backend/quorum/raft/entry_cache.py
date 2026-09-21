"""
In-Memory Entry Cache (Ring Buffer) for Pipelined Raft Replication.

Holds recent proposals in a circular memory buffer so peer replication loops
can fetch entries without blocking on disk reads or waiting for disk fsync.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import List, Optional


@dataclass
class CachedEntry:
    index: int
    term: int
    command: str
    payload: bytes


class InflightLogCache:
    """Fixed-capacity memory ring buffer holding recent proposals for fast replication."""

    def __init__(self, capacity: int = 10000) -> None:
        self.capacity = capacity
        self.entries: deque[CachedEntry] = deque()
        self.base_index: int = 0

    def append(self, entry: CachedEntry) -> None:
        if self.entries and entry.index != self.entries[-1].index + 1:
            raise ValueError(
                f"Non-contiguous index append: {entry.index} (expected {self.entries[-1].index + 1})"
            )

        self.entries.append(entry)
        if len(self.entries) > self.capacity:
            discarded = self.entries.popleft()
            self.base_index = discarded.index + 1

    def get_entries_from(self, start_index: int, max_count: int = 100) -> List[CachedEntry]:
        if not self.entries or start_index > self.entries[-1].index:
            return []

        first_index = self.entries[0].index
        if start_index < first_index:
            # Requires fallback to reading snapshots/WAL on disk
            return []

        offset = start_index - first_index
        result: List[CachedEntry] = []
        for i in range(offset, min(len(self.entries), offset + max_count)):
            result.append(self.entries[i])
        return result

    def get_entry(self, index: int) -> Optional[CachedEntry]:
        if not self.entries:
            return None
        first_index = self.entries[0].index
        if index < first_index or index > self.entries[-1].index:
            return None
        return self.entries[index - first_index]

    def truncate_suffix(self, from_index: int) -> None:
        """Removes all entries with index >= from_index."""
        while self.entries and self.entries[-1].index >= from_index:
            self.entries.pop()

    def clear(self) -> None:
        self.entries.clear()
        self.base_index = 0

    def __len__(self) -> int:
        return len(self.entries)

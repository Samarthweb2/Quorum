"""
Group Commit WAL Engine for Pipelined Raft.

Batches concurrent proposals over a sliding time window (1-2 ms) or up to
batch limits, writing them sequentially and issuing a single fsync() per batch
in a background thread executor.
"""

from __future__ import annotations

import asyncio
import os
import struct
import time
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any, List, Optional, Tuple

ENTRY_HEADER_FMT = ">IIQQ"  # crc (4B), size (4B), term (8B), index (8B)
HEADER_SIZE = struct.calcsize(ENTRY_HEADER_FMT)  # 24 bytes


@dataclass
class ProposalItem:
    term: int
    command: str
    payload: bytes
    future: asyncio.Future
    index: int = 0


class GroupCommitWAL:
    """High-throughput batched Write-Ahead-Log engine."""

    def __init__(
        self,
        wal_path: str,
        max_batch_size: int = 128,
        max_batch_bytes: int = 64 * 1024,
        max_delay_ms: float = 1.5,
    ) -> None:
        self.wal_path = wal_path
        self.max_batch_size = max_batch_size
        self.max_batch_bytes = max_batch_bytes
        self.max_delay_s = max_delay_ms / 1000.0

        self._queue: asyncio.Queue[ProposalItem] = asyncio.Queue()
        self._fd: Optional[int] = None
        self._worker_task: Optional[asyncio.Task] = None
        self._running = False

        # Monotonic indices
        self.last_log_index: int = 0
        self.persisted_index: int = 0

        # Metrics for observability and testing
        self.fsync_count: int = 0
        self.batch_count: int = 0
        self.on_persisted: Optional[Any] = None

    def start(self, initial_index: int = 0) -> None:
        """Initializes WAL file and starts the background flusher loop."""
        self.last_log_index = initial_index
        self.persisted_index = initial_index

        # Ensure parent directory exists
        parent_dir = Path(self.wal_path).parent
        if parent_dir:
            parent_dir.mkdir(parents=True, exist_ok=True)

        # Open file in append/read-write mode
        flags = os.O_CREAT | os.O_RDWR
        if hasattr(os, "O_BINARY"):
            flags |= os.O_BINARY
        self._fd = os.open(self.wal_path, flags)
        # Seek to end of file
        os.lseek(self._fd, 0, os.SEEK_END)

        self._running = True
        self._worker_task = asyncio.create_task(self._flusher_loop())

    async def submit(self, term: int, command: str, payload: bytes) -> Tuple[int, asyncio.Future]:
        """Called concurrently by API / gRPC handlers. Returns assigned index & commit future."""
        if not self._running:
            raise RuntimeError("GroupCommitWAL is not running")

        self.last_log_index += 1
        assigned_index = self.last_log_index

        loop = asyncio.get_running_loop()
        fut = loop.create_future()

        item = ProposalItem(
            term=term,
            command=command,
            payload=payload,
            future=fut,
            index=assigned_index,
        )
        self._queue.put_nowait(item)
        return assigned_index, fut

    async def _flusher_loop(self) -> None:
        """Continuous batch accumulator and single-sync engine."""
        while self._running:
            try:
                first_item = await self._queue.get()
            except asyncio.CancelledError:
                break

            batch: List[ProposalItem] = [first_item]
            batch_bytes = len(first_item.payload)
            deadline = time.monotonic() + self.max_delay_s

            # Opportunistic drain up to limits or deadline
            while len(batch) < self.max_batch_size and batch_bytes < self.max_batch_bytes:
                remaining_time = deadline - time.monotonic()
                if remaining_time <= 0:
                    break
                try:
                    item = await asyncio.wait_for(self._queue.get(), timeout=remaining_time)
                    batch.append(item)
                    batch_bytes += len(item.payload)
                except asyncio.TimeoutError:
                    break
                except asyncio.CancelledError:
                    break

            if not batch:
                continue

            # Assemble binary batch in memory
            encoded_buffer = bytearray()
            for entry in batch:
                # Payload serialization: [cmd_len (2B uint16)][cmd_bytes][payload_bytes]
                cmd_bytes = entry.command.encode("utf-8")
                data = struct.pack(f">H{len(cmd_bytes)}s", len(cmd_bytes), cmd_bytes) + entry.payload
                crc = zlib.crc32(data)
                header = struct.pack(ENTRY_HEADER_FMT, crc, len(data), entry.term, entry.index)
                encoded_buffer.extend(header)
                encoded_buffer.extend(data)

            # Sequential disk append + single fsync in thread pool
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, self._write_and_fsync, encoded_buffer)

            # Advance persisted index
            self.persisted_index = batch[-1].index
            self.batch_count += 1

            if self.on_persisted:
                try:
                    self.on_persisted(self.persisted_index)
                except Exception:
                    pass

            for entry in batch:
                if not entry.future.done():
                    entry.future.set_result(entry.index)

            for _ in batch:
                self._queue.task_done()

    def _write_and_fsync(self, data: bytearray) -> None:
        if self._fd is not None:
            os.write(self._fd, data)
            os.fsync(self._fd)
            self.fsync_count += 1

    def recover(self) -> List[Tuple[int, int, str, bytes]]:
        """
        Recovers and validates all entries in the WAL file.
        Returns list of (index, term, command, payload).
        Truncates any torn or corrupted write at EOF.
        """
        entries: List[Tuple[int, int, str, bytes]] = []
        if not os.path.exists(self.wal_path):
            return entries

        file_size = os.path.getsize(self.wal_path)
        valid_offset = 0

        with open(self.wal_path, "r+b") as f:
            while True:
                record_offset = f.tell()
                header_bytes = f.read(HEADER_SIZE)
                if not header_bytes or len(header_bytes) < HEADER_SIZE:
                    break

                crc, size, term, index = struct.unpack(ENTRY_HEADER_FMT, header_bytes)
                data = f.read(size)
                if len(data) < size:
                    break

                if zlib.crc32(data) != crc:
                    break

                # Unpack command and payload
                cmd_len = struct.unpack_from(">H", data, 0)[0]
                cmd_str = data[2 : 2 + cmd_len].decode("utf-8")
                payload = data[2 + cmd_len :]

                entries.append((index, term, cmd_str, payload))
                valid_offset = f.tell()

            if valid_offset < file_size:
                f.seek(valid_offset)
                f.truncate()
                f.flush()
                os.fsync(f.fileno())

        if entries:
            self.last_log_index = entries[-1][0]
            self.persisted_index = entries[-1][0]

        return entries

    async def stop(self) -> None:
        """Stops the worker loop, flushes pending items, and closes the file descriptor."""
        self._running = False
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass

        # Flush any remaining queue items before closing
        pending: List[ProposalItem] = []
        while not self._queue.empty():
            try:
                pending.append(self._queue.get_nowait())
            except asyncio.QueueEmpty:
                break

        if pending and self._fd is not None:
            encoded_buffer = bytearray()
            for entry in pending:
                cmd_bytes = entry.command.encode("utf-8")
                data = struct.pack(f">H{len(cmd_bytes)}s", len(cmd_bytes), cmd_bytes) + entry.payload
                crc = zlib.crc32(data)
                header = struct.pack(ENTRY_HEADER_FMT, crc, len(data), entry.term, entry.index)
                encoded_buffer.extend(header)
                encoded_buffer.extend(data)
            self._write_and_fsync(encoded_buffer)
            self.persisted_index = pending[-1].index
            for entry in pending:
                if not entry.future.done():
                    entry.future.set_result(entry.index)

        if self._fd is not None:
            try:
                os.close(self._fd)
            except OSError:
                pass
            self._fd = None

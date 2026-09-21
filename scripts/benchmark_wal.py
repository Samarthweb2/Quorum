"""benchmark_wal.py

Comprehensive proposal throughput and latency benchmark:
Sequential stop-and-wait WAL (LogStorage pattern) vs. Asynchronous GroupCommitWAL.
"""

import asyncio
import os
import shutil
import struct
import sys
import tempfile
import time
import zlib
from pathlib import Path
from typing import List

# Ensure backend root is on sys.path when executed from repository root or subfolder
_SCRIPT_DIR = Path(__file__).resolve().parent
_CANDIDATE_PATHS = [
    _SCRIPT_DIR.parent / "backend",
    _SCRIPT_DIR,
    _SCRIPT_DIR.parent,
]
for p in _CANDIDATE_PATHS:
    if (p / "quorum").exists() and str(p) not in sys.path:
        sys.path.insert(0, str(p))


# ============================================================================
# 1. Baseline Implementation: Sequential Stop-and-Wait WAL
# ============================================================================
class SequentialWAL:
    """Simulates standard sequential WAL logging:
    Append entry to disk -> explicitly fsync() -> resolve client future.
    """

    ENTRY_FMT = ">IIQQ"  # crc (4B), length (4B), term (8B), index (8B)

    def __init__(self, wal_path: str):
        self.wal_path = wal_path
        self._fd = None
        self.last_index = 0
        self.sync_count = 0
        self._lock = asyncio.Lock()

    def start(self):
        os.makedirs(os.path.dirname(os.path.abspath(self.wal_path)), exist_ok=True)
        self._fd = os.open(self.wal_path, os.O_CREAT | os.O_RDWR | os.O_APPEND)

    async def submit(self, term: int, command: str, payload: bytes) -> int:
        async with self._lock:
            self.last_index += 1
            idx = self.last_index

            cmd_bytes = command.encode("utf-8")
            data = struct.pack(f">H{len(cmd_bytes)}s", len(cmd_bytes), cmd_bytes) + payload
            crc = zlib.crc32(data) & 0xFFFFFFFF
            header = struct.pack(self.ENTRY_FMT, crc, len(data), term, idx)

            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, self._write_and_fsync, header + data)
            return idx

    def _write_and_fsync(self, packet: bytes):
        os.write(self._fd, packet)
        os.fsync(self._fd)
        self.sync_count += 1

    def close(self):
        if self._fd is not None:
            os.close(self._fd)
            self._fd = None


# ============================================================================
# 2. Optimized Implementation: Asynchronous GroupCommitWAL
# ============================================================================
try:
    from quorum.raft.wal_group_committer import GroupCommitWAL
except ImportError:
    # Inline fallback if executed standalone outside quorum package root
    from dataclasses import dataclass

    @dataclass
    class ProposalItem:
        term: int
        command: str
        payload: bytes
        future: asyncio.Future
        index: int = 0

    class GroupCommitWAL:
        ENTRY_HEADER_FMT = ">IIQQ"

        def __init__(
            self,
            wal_path: str,
            max_batch_size: int = 128,
            max_batch_bytes: int = 64 * 1024,
            max_delay_ms: float = 1.5,
        ):
            self.wal_path = wal_path
            self.max_batch_size = max_batch_size
            self.max_batch_bytes = max_batch_bytes
            self.max_delay_s = max_delay_ms / 1000.0
            self._queue: asyncio.Queue[ProposalItem] = asyncio.Queue()
            self._fd = None
            self._worker_task = None
            self._running = False
            self.last_log_index = 0
            self.persisted_index = 0
            self.sync_count = 0

        def start(self, initial_index: int = 0):
            self.last_log_index = initial_index
            self.persisted_index = initial_index
            os.makedirs(os.path.dirname(os.path.abspath(self.wal_path)), exist_ok=True)
            self._fd = os.open(self.wal_path, os.O_CREAT | os.O_RDWR | os.O_APPEND)
            self._running = True
            self._worker_task = asyncio.create_task(self._flusher_loop())

        async def submit(self, term: int, command: str, payload: bytes):
            self.last_log_index += 1
            idx = self.last_log_index
            loop = asyncio.get_running_loop()
            fut = loop.create_future()
            self._queue.put_nowait(
                ProposalItem(term=term, command=command, payload=payload, future=fut, index=idx)
            )
            return idx, fut

        async def _flusher_loop(self):
            while self._running:
                try:
                    first_item = await self._queue.get()
                except asyncio.CancelledError:
                    break

                batch = [first_item]
                batch_bytes = len(first_item.payload)
                deadline = time.monotonic() + self.max_delay_s

                while len(batch) < self.max_batch_size and batch_bytes < self.max_batch_bytes:
                    remaining_time = deadline - time.monotonic()
                    if remaining_time <= 0:
                        break
                    try:
                        item = await asyncio.wait_for(self._queue.get(), timeout=remaining_time)
                        batch.append(item)
                        batch_bytes += len(item.payload)
                    except (asyncio.TimeoutError, asyncio.CancelledError):
                        break

                buf = bytearray()
                for entry in batch:
                    cmd_bytes = entry.command.encode("utf-8")
                    data = struct.pack(f">H{len(cmd_bytes)}s", len(cmd_bytes), cmd_bytes) + entry.payload
                    crc = zlib.crc32(data) & 0xFFFFFFFF
                    header = struct.pack(self.ENTRY_HEADER_FMT, crc, len(data), entry.term, entry.index)
                    buf.extend(header)
                    buf.extend(data)

                loop = asyncio.get_running_loop()
                await loop.run_in_executor(None, self._write_and_fsync, buf)
                self.persisted_index = batch[-1].index

                for entry in batch:
                    if not entry.future.done():
                        entry.future.set_result(entry.index)

        def _write_and_fsync(self, data: bytearray):
            if self._fd is not None:
                os.write(self._fd, data)
                os.fsync(self._fd)
                self.sync_count += 1

        async def stop(self):
            self._running = False
            if self._worker_task:
                self._worker_task.cancel()
                try:
                    await self._worker_task
                except asyncio.CancelledError:
                    pass
            if self._fd is not None:
                os.close(self._fd)
                self._fd = None


# ============================================================================
# 3. Benchmark Runners
# ============================================================================
async def benchmark_sequential(wal_path: str, num_requests: int, concurrency: int):
    wal = SequentialWAL(wal_path)
    wal.start()

    payload = b'{"action": "ACQUIRE", "key": "resource_lock_xyz", "client_id": "worker_node_1"}'
    semaphore = asyncio.Semaphore(concurrency)

    async def worker(req_id: int):
        async with semaphore:
            return await wal.submit(term=1, command="ACQUIRE", payload=payload)

    start = time.perf_counter()
    tasks = [worker(i) for i in range(num_requests)]
    results = await asyncio.gather(*tasks)
    elapsed = time.perf_counter() - start

    wal.close()
    return {
        "engine": "Sequential WAL (Stop-and-Wait)",
        "total_requests": len(results),
        "elapsed_sec": elapsed,
        "throughput_ops": len(results) / elapsed,
        "avg_latency_ms": (elapsed / len(results)) * 1000.0,
        "sync_count": wal.sync_count,
        "ops_per_sync": len(results) / max(1, wal.sync_count),
    }


async def benchmark_group_commit(wal_path: str, num_requests: int, concurrency: int):
    wal = GroupCommitWAL(
        wal_path,
        max_batch_size=128,
        max_batch_bytes=64 * 1024,
        max_delay_ms=1.5,
    )
    wal.start()

    payload = b'{"action": "ACQUIRE", "key": "resource_lock_xyz", "client_id": "worker_node_1"}'
    semaphore = asyncio.Semaphore(concurrency)

    async def worker(req_id: int):
        async with semaphore:
            _, fut = await wal.submit(term=1, command="ACQUIRE", payload=payload)
            return await fut

    start = time.perf_counter()
    tasks = [worker(i) for i in range(num_requests)]
    results = await asyncio.gather(*tasks)
    elapsed = time.perf_counter() - start

    await wal.stop()
    return {
        "engine": "GroupCommitWAL (Sliding Window Batch)",
        "total_requests": len(results),
        "elapsed_sec": elapsed,
        "throughput_ops": len(results) / elapsed,
        "avg_latency_ms": (elapsed / len(results)) * 1000.0,
        "sync_count": getattr(wal, "sync_count", getattr(wal, "fsync_count", 0)),
        "ops_per_sync": len(results) / max(1, getattr(wal, "sync_count", getattr(wal, "fsync_count", 0))),
    }


# ============================================================================
# 4. Main Entry Point
# ============================================================================
async def main():
    total_ops = 2000
    concurrency_levels = [10, 50, 200]
    temp_dir = tempfile.mkdtemp(prefix="quorum_bench_")

    print("=" * 82, flush=True)
    print(" QUORUM STORAGE BENCHMARK: Sequential vs. GroupCommitWAL", flush=True)
    print(f" Total Operations: {total_ops:,} proposals per test", flush=True)
    print(" Environment: Python asyncio + os.fsync() on local filesystem", flush=True)
    print("=" * 82, flush=True)

    try:
        for conc in concurrency_levels:
            print(f"\n[+] Testing Concurrency = {conc} concurrent workers...", flush=True)

            # 1. Benchmark Sequential
            print("    -> Running Sequential WAL (Stop-and-Wait)...", end="", flush=True)
            seq_path = os.path.join(temp_dir, f"seq_{conc}.wal")
            res_seq = await benchmark_sequential(seq_path, num_requests=total_ops, concurrency=conc)
            print(f" Done ({res_seq['elapsed_sec']:.2f}s)", flush=True)

            # 2. Benchmark Group Commit
            print("    -> Running GroupCommitWAL (Sliding Window)...", end="", flush=True)
            grp_path = os.path.join(temp_dir, f"grp_{conc}.wal")
            res_grp = await benchmark_group_commit(grp_path, num_requests=total_ops, concurrency=conc)
            print(f" Done ({res_grp['elapsed_sec']:.2f}s)", flush=True)

            speedup = res_grp["throughput_ops"] / res_seq["throughput_ops"]
            fsync_reduction = (1.0 - (res_grp["sync_count"] / res_seq["sync_count"])) * 100.0

            print("-" * 82, flush=True)
            print(f"{'Engine':<32} | {'Throughput':<12} | {'fsync() Calls':<14} | {'Ops / Sync':<10}", flush=True)
            print("-" * 82, flush=True)
            print(
                f"{res_seq['engine']:<32} | {res_seq['throughput_ops']:>8.1f} ops/s | {res_seq['sync_count']:>14} | {res_seq['ops_per_sync']:>10.1f}",
                flush=True,
            )
            print(
                f"{res_grp['engine']:<32} | {res_grp['throughput_ops']:>8.1f} ops/s | {res_grp['sync_count']:>14} | {res_grp['ops_per_sync']:>10.1f}",
                flush=True,
            )
            print("-" * 82, flush=True)
            print(
                f"==> RESULT at {conc} concurrency: {speedup:.2f}x Faster Throughput | "
                f"{fsync_reduction:.1f}% Reduction in disk I/O flushes\n",
                flush=True,
            )

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    asyncio.run(main())

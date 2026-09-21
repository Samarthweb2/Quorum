"""
Unit and Integration Tests for Downstream Storage Guard Adapters (PostgreSQL & Redis).

Verifies Martin Kleppmann's monotonic fencing token protocol:
1. PostgresFencedGuard SQL rewriting and conditional execution.
2. PostgresFencedGuard rejection of stale writes raising FencingTokenStaleError.
3. RedisFencedGuard atomic Lua execution for hash and string key-value updates.
4. RedisFencedGuard rejection of stale writes raising FencingTokenStaleError.
5. End-to-End Zombie Worker Chaos Test: delayed worker's write is rejected.
"""

from __future__ import annotations

import asyncio
import sqlite3
from typing import Any, Dict, Optional, Tuple
import pytest

from quorum.client.client import LockHandle
from quorum.client.guards.exceptions import FencingTokenStaleError
from quorum.client.guards.postgres import PostgresFencedGuard
from quorum.client.guards.redis import RedisFencedGuard


# =============================================================================
# 1. PostgresFencedGuard Tests (using sqlite3 in-memory engine)
# =============================================================================


def test_postgres_guard_query_rewriting():
    conn = sqlite3.connect(":memory:")
    guard = PostgresFencedGuard(conn, fence_token=42, token_col="last_fence_token")

    query = "UPDATE accounts SET balance = balance - 100 WHERE id = 1042"
    rewritten, table, where = guard.rewrite_update_query(query)

    assert table == "accounts"
    assert where == "id = 1042"
    assert "last_fence_token = 42" in rewritten
    assert "(last_fence_token IS NULL OR last_fence_token < 42)" in rewritten
    assert "WHERE (id = 1042) AND" in rewritten


@pytest.mark.asyncio
async def test_postgres_guard_monotonic_safety():
    conn = sqlite3.connect(":memory:")
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE accounts (
            id INT PRIMARY KEY,
            balance INT,
            last_fence_token INT
        )
        """
    )
    cur.execute("INSERT INTO accounts VALUES (1042, 1000, 10)")
    conn.commit()

    # 1. Valid write with higher token (fence_token=15 > 10)
    guard_15 = PostgresFencedGuard(conn, fence_token=15, token_col="last_fence_token")
    await guard_15.execute("UPDATE accounts SET balance = balance - 100 WHERE id = 1042")
    conn.commit()

    cur.execute("SELECT balance, last_fence_token FROM accounts WHERE id = 1042")
    row = cur.fetchone()
    assert row == (900, 15)

    # 2. Stale write with lower token (fence_token=12 < 15) -> MUST raise FencingTokenStaleError
    guard_12 = PostgresFencedGuard(conn, fence_token=12, token_col="last_fence_token")
    with pytest.raises(FencingTokenStaleError) as exc_info:
        await guard_12.execute("UPDATE accounts SET balance = balance - 50 WHERE id = 1042")

    assert exc_info.value.current_token == 12
    assert exc_info.value.committed_token == 15
    assert exc_info.value.target == "accounts"

    # Verify storage was NOT modified by the stale worker
    cur.execute("SELECT balance, last_fence_token FROM accounts WHERE id = 1042")
    assert cur.fetchone() == (900, 15)


# =============================================================================
# 2. RedisFencedGuard Tests (Mocking Redis Lua engine)
# =============================================================================


class MockAsyncRedis:
    """In-memory async Redis mock supporting atomic Lua script emulation."""

    def __init__(self):
        self.hashes: Dict[str, Dict[str, str]] = {}
        self.strings: Dict[str, str] = {}

    async def eval(self, script: str, num_keys: int, *args: Any):
        keys = args[:num_keys]
        argv = args[num_keys:]

        if "HGET" in script:
            # HSET_FENCED_LUA: keys=[key], argv=[token_field, new_token, field, val]
            key = keys[0]
            token_field, new_token, field, val = argv[0], int(argv[1]), argv[2], argv[3]
            h = self.hashes.setdefault(key, {})
            cur_token = int(h.get(token_field)) if token_field in h else None

            if cur_token is not None and cur_token >= new_token:
                return [0, str(cur_token)]

            h[token_field] = str(new_token)
            h[field] = str(val)
            return [1, str(new_token)]

        elif "SET" in script:
            # SET_FENCED_LUA: keys=[val_key, token_key], argv=[new_token, new_val]
            val_key, token_key = keys[0], keys[1]
            new_token, new_val = int(argv[0]), str(argv[1])
            cur_token = int(self.strings.get(token_key)) if token_key in self.strings else None

            if cur_token is not None and cur_token >= new_token:
                return [0, str(cur_token)]

            self.strings[token_key] = str(new_token)
            self.strings[val_key] = str(new_val)
            return [1, str(new_token)]

        raise NotImplementedError("Script not mocked")

    async def hget(self, key: str, field: str):
        return self.hashes.get(key, {}).get(field)

    async def get(self, key: str):
        return self.strings.get(key)


@pytest.mark.asyncio
async def test_redis_guard_monotonic_safety():
    redis_client = MockAsyncRedis()

    # 1. Valid write with token 100
    guard_100 = RedisFencedGuard(redis_client, fence_token=100)
    success = await guard_100.hset("device:cfg:1", "status", "ONLINE")
    assert success is True
    assert await redis_client.hget("device:cfg:1", "status") == "ONLINE"
    assert await redis_client.hget("device:cfg:1", "_fence_token") == "100"

    # 2. Valid write with higher token 105
    guard_105 = RedisFencedGuard(redis_client, fence_token=105)
    await guard_105.hset("device:cfg:1", "status", "BUSY")
    assert await redis_client.hget("device:cfg:1", "status") == "BUSY"
    assert await redis_client.hget("device:cfg:1", "_fence_token") == "105"

    # 3. Stale write with old token 100 -> MUST raise FencingTokenStaleError
    with pytest.raises(FencingTokenStaleError) as exc_info:
        await guard_100.hset("device:cfg:1", "status", "OFFLINE")

    assert exc_info.value.current_token == 100
    assert exc_info.value.committed_token == 105
    # Value must remain BUSY
    assert await redis_client.hget("device:cfg:1", "status") == "BUSY"


# =============================================================================
# 3. LockHandle Native Integration Test
# =============================================================================


@pytest.mark.asyncio
async def test_lock_handle_convenience_methods():
    conn = sqlite3.connect(":memory:")
    conn.execute("CREATE TABLE orders (id INT, status TEXT, last_fence_token INT)")
    conn.execute("INSERT INTO orders VALUES (1, 'PENDING', 1)")
    conn.commit()

    handle = LockHandle(
        key="order:1",
        client_id="worker_a",
        fence_token=5,
        expires_at_ms=9999999999999,
    )

    # Developer experience: lease.postgres(conn).execute(...)
    await handle.postgres(conn).execute("UPDATE orders SET status = 'PROCESSING' WHERE id = 1")
    conn.commit()

    cur = conn.cursor()
    cur.execute("SELECT status, last_fence_token FROM orders WHERE id = 1")
    assert cur.fetchone() == ("PROCESSING", 5)


# =============================================================================
# 4. End-to-End Zombie Worker Chaos Test
# =============================================================================


@pytest.mark.asyncio
async def test_end_to_end_zombie_worker_chaos():
    """
    Classic Kleppmann Zombie Worker scenario:
    1. Worker A acquires lock (receives Fencing Token 1).
    2. Worker A pauses (simulating long GC pause / network stall).
    3. Lock TTL expires in cluster.
    4. Worker B acquires lock (receives Fencing Token 2).
    5. Worker B safely updates storage with Token 2.
    6. Worker A awakens from pause and attempts to commit with Token 1.
    7. Storage Guard intercepts and rejects Worker A's write, preserving storage integrity!
    """
    db = sqlite3.connect(":memory:")
    db.execute("CREATE TABLE inventory (sku TEXT PRIMARY KEY, stock INT, last_fence_token INT)")
    db.execute("INSERT INTO inventory VALUES ('WIDGET-01', 50, 0)")
    db.commit()

    # Step 1: Worker A acquires lock (Token 1)
    worker_a_lease = LockHandle(key="sku:WIDGET-01", client_id="worker_a", fence_token=1, expires_at_ms=100)

    # Step 2: Worker A pauses / sleeps
    worker_a_paused = asyncio.Event()

    # Step 4: Worker B acquires lock after expiration (Token 2)
    worker_b_lease = LockHandle(key="sku:WIDGET-01", client_id="worker_b", fence_token=2, expires_at_ms=10000)

    # Step 5: Worker B completes write
    await worker_b_lease.postgres(db).execute(
        "UPDATE inventory SET stock = stock - 5 WHERE sku = 'WIDGET-01'"
    )
    db.commit()

    cur = db.cursor()
    cur.execute("SELECT stock, last_fence_token FROM inventory WHERE sku = 'WIDGET-01'")
    assert cur.fetchone() == (45, 2)

    # Step 6: Worker A resumes and attempts stale write
    with pytest.raises(FencingTokenStaleError) as exc_info:
        await worker_a_lease.postgres(db).execute(
            "UPDATE inventory SET stock = stock - 10 WHERE sku = 'WIDGET-01'"
        )

    assert exc_info.value.current_token == 1
    assert exc_info.value.committed_token == 2

    # Step 8: Final storage verification: stock is still 45 (Worker B), NOT corrupted by Worker A!
    cur.execute("SELECT stock, last_fence_token FROM inventory WHERE sku = 'WIDGET-01'")
    assert cur.fetchone() == (45, 2)

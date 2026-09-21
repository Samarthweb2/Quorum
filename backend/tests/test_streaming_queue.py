"""Tests verifying push-based gRPC streaming lock acquisition and PromotionHub."""

import asyncio
import time
from unittest.mock import AsyncMock, MagicMock
import grpc
import pytest

from quorum.proto import lock_service_pb2
from quorum.server.lock_service_impl import LockServiceImpl
from quorum.server.promotion_hub import PromotionEvent, PromotionHub


@pytest.mark.asyncio
async def test_promotion_hub_push_delivery():
    hub = PromotionHub()
    key = "res:orders"
    client_id = "worker_beta"

    # Register waiter
    queue = await hub.register(key, client_id)

    # Deliver promotion event
    event = PromotionEvent(
        key=key,
        client_id=client_id,
        fence_token=102,
        ttl_ms=5000,
        expires_at_ms=1750000000,
    )
    delivered = await hub.notify_promotion(event)
    assert delivered is True

    # Read from queue
    received = await asyncio.wait_for(queue.get(), timeout=1.0)
    assert received == event
    assert received.fence_token == 102

    await hub.unregister(key, client_id)


@pytest.mark.asyncio
async def test_promotion_hub_leadership_revocation():
    hub = PromotionHub()
    q1 = await hub.register("res:1", "worker_1")
    q2 = await hub.register("res:2", "worker_2")

    # Step down leader
    await hub.notify_leadership_lost()

    # Both streams receive None sentinel
    res1 = await asyncio.wait_for(q1.get(), timeout=1.0)
    res2 = await asyncio.wait_for(q2.get(), timeout=1.0)
    assert res1 is None
    assert res2 is None


@pytest.mark.asyncio
async def test_lock_service_immediate_grant():
    hub = PromotionHub()
    node = MagicMock()
    node.is_leader.return_value = True

    now_ms = int(time.time() * 1000)
    node.propose = AsyncMock(
        return_value={
            "status": "GRANTED",
            "fence_token": 10,
            "expires_at_ms": now_ms + 40,
        }
    )

    servicer = LockServiceImpl(node, hub)
    req = lock_service_pb2.AcquireLockStreamRequest(
        key="resource:1",
        client_id="worker_1",
        ttl_ms=40,
        wait_timeout_ms=500,
    )
    context = MagicMock()
    context.abort = AsyncMock()

    events = []
    async for evt in servicer.AcquireLockStream(req, context):
        events.append(evt)

    assert len(events) == 2
    assert events[0].event_type == lock_service_pb2.LOCK_EVENT_TYPE_GRANTED
    assert events[0].granted.fence_token == 10
    assert events[1].event_type == lock_service_pb2.LOCK_EVENT_TYPE_EXPIRED


@pytest.mark.asyncio
async def test_lock_service_streaming_queue_promotion():
    hub = PromotionHub()
    node = MagicMock()
    node.is_leader.return_value = True

    node.propose = AsyncMock(
        return_value={
            "status": "QUEUED",
            "position": 1,
            "estimated_wait_ms": 500,
        }
    )

    servicer = LockServiceImpl(node, hub)
    req = lock_service_pb2.AcquireLockStreamRequest(
        key="res:queue_test",
        client_id="contender_1",
        ttl_ms=50,
        wait_timeout_ms=1000,
    )
    context = MagicMock()
    context.abort = AsyncMock()

    async def _stream_reader(stream):
        evts = []
        async for evt in stream:
            evts.append(evt)
            if evt.event_type == lock_service_pb2.LOCK_EVENT_TYPE_QUEUED:
                # Trigger push notification from PromotionHub
                promo_event = PromotionEvent(
                    key="res:queue_test",
                    client_id="contender_1",
                    fence_token=88,
                    ttl_ms=50,
                    expires_at_ms=int(time.time() * 1000) + 50,
                )
                await hub.notify_promotion(promo_event)
        return evts

    stream = servicer.AcquireLockStream(req, context)
    events = await asyncio.wait_for(_stream_reader(stream), timeout=2.0)

    assert len(events) >= 2
    assert events[0].event_type == lock_service_pb2.LOCK_EVENT_TYPE_QUEUED
    assert events[0].queued.queue_position == 1
    assert events[1].event_type == lock_service_pb2.LOCK_EVENT_TYPE_GRANTED
    assert events[1].granted.fence_token == 88


@pytest.mark.asyncio
async def test_lock_service_ghost_waiter_cancellation():
    hub = PromotionHub()
    node = MagicMock()
    node.is_leader.return_value = True

    node.propose = AsyncMock(
        return_value={
            "status": "QUEUED",
            "position": 1,
            "estimated_wait_ms": 500,
        }
    )

    servicer = LockServiceImpl(node, hub)
    req = lock_service_pb2.AcquireLockStreamRequest(
        key="res:cancellation",
        client_id="ghost_worker",
        ttl_ms=5000,
        wait_timeout_ms=5000,
    )
    context = MagicMock()
    context.abort = AsyncMock()

    stream = servicer.AcquireLockStream(req, context)
    task = asyncio.create_task(stream.__anext__())
    first_evt = await task
    assert first_evt.event_type == lock_service_pb2.LOCK_EVENT_TYPE_QUEUED

    # Stream is cancelled (e.g. client disconnects or crash)
    next_task = asyncio.create_task(stream.__anext__())
    await asyncio.sleep(0.01)
    next_task.cancel()

    with pytest.raises(asyncio.CancelledError):
        await next_task

    # Verify CANCEL_WAIT was deterministically proposed
    node.propose.assert_called_with(
        "CANCEL_WAIT",
        {
            "key": "res:cancellation",
            "client_id": "ghost_worker",
            "timestamp_ms": pytest.approx(int(time.time() * 1000), abs=1000),
        },
    )


@pytest.mark.asyncio
async def test_lock_service_queue_timeout():
    hub = PromotionHub()
    node = MagicMock()
    node.is_leader.return_value = True

    node.propose = AsyncMock(
        return_value={
            "status": "QUEUED",
            "position": 2,
            "estimated_wait_ms": 500,
        }
    )

    servicer = LockServiceImpl(node, hub)
    req = lock_service_pb2.AcquireLockStreamRequest(
        key="res:timeout",
        client_id="slow_waiter",
        ttl_ms=5000,
        wait_timeout_ms=50,  # 50ms timeout
    )
    context = MagicMock()
    context.abort = AsyncMock()

    events = []
    async for evt in servicer.AcquireLockStream(req, context):
        events.append(evt)

    assert len(events) == 2
    assert events[0].event_type == lock_service_pb2.LOCK_EVENT_TYPE_QUEUED
    assert events[1].event_type == lock_service_pb2.LOCK_EVENT_TYPE_REJECTED
    assert "timeout" in events[1].rejected.reason.lower()


@pytest.mark.asyncio
async def test_lock_service_leadership_lost_during_wait():
    hub = PromotionHub()
    node = MagicMock()
    node.is_leader.return_value = True

    node.propose = AsyncMock(
        return_value={
            "status": "QUEUED",
            "position": 1,
            "estimated_wait_ms": 500,
        }
    )

    servicer = LockServiceImpl(node, hub)
    req = lock_service_pb2.AcquireLockStreamRequest(
        key="res:stepdown",
        client_id="waiting_client",
        ttl_ms=5000,
        wait_timeout_ms=2000,
    )
    context = MagicMock()
    context.abort = AsyncMock()

    async def _stream_reader(stream):
        evts = []
        async for evt in stream:
            evts.append(evt)
            if evt.event_type == lock_service_pb2.LOCK_EVENT_TYPE_QUEUED:
                await hub.notify_leadership_lost()
        return evts

    stream = servicer.AcquireLockStream(req, context)
    events = await asyncio.wait_for(_stream_reader(stream), timeout=1.0)

    assert len(events) == 2
    assert events[0].event_type == lock_service_pb2.LOCK_EVENT_TYPE_QUEUED
    assert events[1].event_type == lock_service_pb2.LOCK_EVENT_TYPE_LEADERSHIP_LOST


@pytest.mark.asyncio
async def test_lock_service_release():
    hub = PromotionHub()
    node = MagicMock()
    node.is_leader.return_value = True
    node.propose = AsyncMock(return_value={"success": True, "message": "Lock released"})

    servicer = LockServiceImpl(node, hub)
    req = lock_service_pb2.ReleaseLockRequest(
        key="res:orders",
        client_id="worker_1",
        fence_token=42,
    )
    context = MagicMock()
    context.abort = AsyncMock()

    res = await servicer.ReleaseLock(req, context)
    assert res.success is True
    assert res.message == "Lock released"

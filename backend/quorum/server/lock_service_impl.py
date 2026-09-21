"""gRPC Servicer handling streaming lock subscriptions."""

import asyncio
import logging
import time
from typing import Optional
import grpc

from quorum.proto import lock_service_pb2, lock_service_pb2_grpc
from quorum.server.promotion_hub import PromotionHub, PromotionEvent

logger = logging.getLogger(__name__)


class _StreamExpiryHolder:
    """Supports both async iteration (yielding EXPIRED event) and direct await."""

    def __init__(self, expires_at_ms: int, key: str, client_id: str):
        self.expires_at_ms = expires_at_ms
        self.key = key
        self.client_id = client_id

    async def _wait(self) -> Optional[lock_service_pb2.LockStreamEvent]:
        try:
            now_ms = int(time.time() * 1000)
            remaining_s = max(0.0, (self.expires_at_ms - now_ms) / 1000.0)
            await asyncio.sleep(remaining_s)
            return lock_service_pb2.LockStreamEvent(
                key=self.key,
                client_id=self.client_id,
                event_type=lock_service_pb2.LOCK_EVENT_TYPE_EXPIRED,
            )
        except asyncio.CancelledError:
            return None

    def __await__(self):
        return self._wait().__await__()

    async def __aiter__(self):
        evt = await self._wait()
        if evt is not None:
            yield evt


class LockServiceImpl(lock_service_pb2_grpc.LockServiceServicer):
    def __init__(self, raft_node, promotion_hub: PromotionHub, state_machine=None):
        self.node = raft_node
        self.hub = promotion_hub
        self.state_machine = state_machine or getattr(raft_node, "state_machine", None)

    def _is_leader(self) -> bool:
        if hasattr(self.node, "is_leader"):
            is_ldr = self.node.is_leader
            return is_ldr() if callable(is_ldr) else bool(is_ldr)
        return getattr(self.node, "role", None) == "LEADER"

    async def _propose(self, cmd: str, proposal: dict) -> dict:
        raw = await self.node.propose(cmd, proposal)
        if isinstance(raw, dict):
            return raw
        if isinstance(raw, (asyncio.Future, asyncio.Task)) or asyncio.iscoroutine(raw):
            committed = await raw
        else:
            committed = bool(raw)

        if not committed:
            raise RuntimeError("Leadership lost before commit")

        if self.state_machine:
            log_storage = getattr(self.node, "log_storage", None)
            idx = getattr(log_storage, "last_log_index", 0) if log_storage else 0
            sm_res = self.state_machine.get_result(idx)
            if sm_res:
                status = "GRANTED" if sm_res.status == "ACQUIRED" else sm_res.status
                return {
                    "status": status,
                    "fence_token": sm_res.fence_token,
                    "expires_at_ms": sm_res.expires_at_ms,
                    "position": sm_res.queue_position,
                    "estimated_wait_ms": getattr(sm_res, "estimated_wait_ms", 0),
                    "success": sm_res.success,
                    "message": sm_res.message,
                }
        return {"status": "GRANTED" if committed else "BUSY", "success": committed}

    async def AcquireLockStream(
        self,
        request: lock_service_pb2.AcquireLockStreamRequest,
        context: grpc.aio.ServicerContext,
    ):
        key = request.key
        client_id = request.client_id
        ttl_ms = request.ttl_ms
        wait_timeout_ms = request.wait_timeout_ms or 30000

        if not self._is_leader():
            await context.abort(grpc.StatusCode.FAILED_PRECONDITION, "Not cluster leader")
            return

        now_ms = int(time.time() * 1000)
        proposal = {
            "key": key,
            "client_id": client_id,
            "ttl_ms": ttl_ms,
            "wait_if_busy": True,
            "wait_timeout_ms": wait_timeout_ms,
            "timestamp_ms": now_ms,
        }

        try:
            res = await self._propose("ACQUIRE", proposal)
        except Exception as e:
            await context.abort(grpc.StatusCode.INTERNAL, f"Raft proposal error: {e}")
            return

        # Path 1: Immediate Grant
        if res.get("status") in ("GRANTED", "ACQUIRED"):
            yield lock_service_pb2.LockStreamEvent(
                key=key,
                client_id=client_id,
                event_type=lock_service_pb2.LOCK_EVENT_TYPE_GRANTED,
                granted=lock_service_pb2.GrantedPayload(
                    fence_token=res["fence_token"],
                    lease_duration_ms=ttl_ms,
                    expires_at_ms=res["expires_at_ms"],
                ),
            )
            async for event in self._hold_stream_until_expiry(res["expires_at_ms"], key, client_id):
                yield event
            return

        # Path 2: Enqueued in FIFO Order
        if res.get("status") == "QUEUED":
            waiter_queue = await self.hub.register(key, client_id)
            yield lock_service_pb2.LockStreamEvent(
                key=key,
                client_id=client_id,
                event_type=lock_service_pb2.LOCK_EVENT_TYPE_QUEUED,
                queued=lock_service_pb2.QueuedPayload(
                    queue_position=res.get("position") or res.get("queue_position", 1),
                    estimated_wait_ms=res.get("estimated_wait_ms", 0),
                ),
            )

            try:
                # Wait for PromotionHub notification or client-specified timeout
                timeout_s = wait_timeout_ms / 1000.0
                event: Optional[PromotionEvent] = await asyncio.wait_for(
                    waiter_queue.get(), timeout=timeout_s
                )

                if event is None:
                    # Leadership lost during wait
                    yield lock_service_pb2.LockStreamEvent(
                        key=key,
                        client_id=client_id,
                        event_type=lock_service_pb2.LOCK_EVENT_TYPE_LEADERSHIP_LOST,
                    )
                    return

                # Successfully promoted
                yield lock_service_pb2.LockStreamEvent(
                    key=key,
                    client_id=client_id,
                    event_type=lock_service_pb2.LOCK_EVENT_TYPE_GRANTED,
                    granted=lock_service_pb2.GrantedPayload(
                        fence_token=event.fence_token,
                        lease_duration_ms=event.ttl_ms,
                        expires_at_ms=event.expires_at_ms,
                    ),
                )
                async for evt in self._hold_stream_until_expiry(event.expires_at_ms, key, client_id):
                    yield evt

            except asyncio.TimeoutError:
                yield lock_service_pb2.LockStreamEvent(
                    key=key,
                    client_id=client_id,
                    event_type=lock_service_pb2.LOCK_EVENT_TYPE_REJECTED,
                    rejected=lock_service_pb2.RejectedPayload(reason="Queue wait timeout exceeded"),
                )
                await self._propose_cancel_wait(key, client_id)

            except asyncio.CancelledError:
                # Ghost waiter protection: stream was closed or worker died
                await self._propose_cancel_wait(key, client_id)
                raise

            finally:
                await self.hub.unregister(key, client_id)
            return

        # Path 3: Rejected / Busy without wait
        yield lock_service_pb2.LockStreamEvent(
            key=key,
            client_id=client_id,
            event_type=lock_service_pb2.LOCK_EVENT_TYPE_REJECTED,
            rejected=lock_service_pb2.RejectedPayload(reason=res.get("status", "BUSY")),
        )

    async def ReleaseLock(
        self,
        request: lock_service_pb2.ReleaseLockRequest,
        context: grpc.aio.ServicerContext,
    ) -> lock_service_pb2.ReleaseLockResponse:
        key = request.key
        client_id = request.client_id
        fence_token = request.fence_token

        if not self._is_leader():
            await context.abort(grpc.StatusCode.FAILED_PRECONDITION, "Not cluster leader")
            return lock_service_pb2.ReleaseLockResponse(success=False, message="Not cluster leader")

        now_ms = int(time.time() * 1000)
        proposal = {
            "key": key,
            "client_id": client_id,
            "fence_token": fence_token,
            "timestamp_ms": now_ms,
        }
        try:
            res = await self._propose("RELEASE", proposal)
            return lock_service_pb2.ReleaseLockResponse(
                success=res.get("success", True),
                message=res.get("message", "Lock released successfully"),
            )
        except Exception as e:
            return lock_service_pb2.ReleaseLockResponse(
                success=False,
                message=f"Release failed: {e}",
            )

    def _hold_stream_until_expiry(self, expires_at_ms: int, key: str, client_id: str):
        """Keeps stream alive while the lease is valid, emitting EXPIRED upon finish."""
        return _StreamExpiryHolder(expires_at_ms, key, client_id)

    async def _propose_cancel_wait(self, key: str, client_id: str):
        """Proposes deterministic removal from replicated FIFO queue."""
        try:
            proposal = {
                "key": key,
                "client_id": client_id,
                "timestamp_ms": int(time.time() * 1000),
            }
            raw = await self.node.propose("CANCEL_WAIT", proposal)
            if isinstance(raw, (asyncio.Future, asyncio.Task)) or asyncio.iscoroutine(raw):
                await raw
        except Exception:
            pass

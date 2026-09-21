"""PromotionHub: In-memory async routing hub for push-based lock notifications."""

import asyncio
import logging
from dataclasses import dataclass
from typing import Dict, Optional, Tuple

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PromotionEvent:
    key: str
    client_id: str
    fence_token: int
    ttl_ms: int
    expires_at_ms: int


class PromotionHub:
    """Manages active subscriber queues keyed by (resource_key, client_id)."""

    def __init__(self):
        self._waiters: Dict[Tuple[str, str], asyncio.Queue[Optional[PromotionEvent]]] = {}
        self._lock = asyncio.Lock()

    async def register(self, key: str, client_id: str) -> asyncio.Queue[Optional[PromotionEvent]]:
        """Registers a waiting gRPC stream for a resource key."""
        async with self._lock:
            # Buffer size of 1 is sufficient for the promotion trigger
            queue: asyncio.Queue[Optional[PromotionEvent]] = asyncio.Queue(maxsize=1)
            self._waiters[(key, client_id)] = queue
            return queue

    async def unregister(self, key: str, client_id: str) -> None:
        """Removes the subscriber queue upon stream completion or error."""
        async with self._lock:
            self._waiters.pop((key, client_id), None)

    async def notify_promotion(self, event: PromotionEvent) -> bool:
        """Pushes a promotion event into the target waiter's queue."""
        async with self._lock:
            queue = self._waiters.get((event.key, event.client_id))
            if queue:
                try:
                    queue.put_nowait(event)
                    return True
                except asyncio.QueueFull:
                    return False
            return False

    async def notify_leadership_lost(self) -> None:
        """Wakes up and terminates all waiting streams if the node steps down from leader."""
        async with self._lock:
            for queue in self._waiters.values():
                try:
                    queue.put_nowait(None)  # Sentinel indicates leadership revocation
                except asyncio.QueueFull:
                    pass
            self._waiters.clear()

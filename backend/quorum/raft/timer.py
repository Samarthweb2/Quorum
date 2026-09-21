"""
Timer management for Raft elections and heartbeats.
Supports randomized timeouts, deterministic seeds, manual trigger hooks for testing.
"""

from __future__ import annotations

import asyncio
import logging
import random
from typing import Awaitable, Callable, Optional

logger = logging.getLogger(__name__)


class ElectionTimer:
    """
    Randomized election timeout timer.
    Can be seeded or manually triggered for deterministic testing.
    """

    def __init__(
        self,
        min_timeout_s: float,
        max_timeout_s: float,
        callback: Callable[[], Awaitable[None] | None],
        random_seed: Optional[int] = None,
        manual_mode: bool = False,
    ) -> None:
        self.min_timeout_s = min_timeout_s
        self.max_timeout_s = max_timeout_s
        self.callback = callback
        self.rng = random.Random(random_seed) if random_seed is not None else random.Random()
        self.manual_mode = manual_mode
        self._task: Optional[asyncio.Task] = None
        self._fixed_timeout_s: Optional[float] = None
        self._cancelled = False

    def set_fixed_timeout(self, timeout_s: Optional[float]) -> None:
        """Forces a fixed timeout instead of random range (useful for testing)."""
        self._fixed_timeout_s = timeout_s

    def _get_next_timeout(self) -> float:
        if self._fixed_timeout_s is not None:
            return self._fixed_timeout_s
        return self.rng.uniform(self.min_timeout_s, self.max_timeout_s)

    def start(self) -> None:
        self._cancelled = False
        self.reset()

    def reset(self) -> None:
        """Resets the election timer with a new randomized timeout."""
        self.cancel()
        self._cancelled = False
        if self.manual_mode:
            return

        timeout = self._get_next_timeout()

        async def _runner() -> None:
            try:
                await asyncio.sleep(timeout)
                if not self._cancelled:
                    try:
                        res = self.callback()
                        if asyncio.iscoroutine(res):
                            await res
                    except Exception as e:
                        logger.error(f"Error in election timer callback: {e}", exc_info=True)
            except asyncio.CancelledError:
                pass

        self._task = asyncio.create_task(_runner())

    def cancel(self) -> None:
        """Cancels any pending timer callback without self-cancelling the current task."""
        self._cancelled = True
        current = None
        try:
            current = asyncio.current_task()
        except RuntimeError:
            pass
        if self._task and not self._task.done() and self._task is not current:
            self._task.cancel()
        self._task = None

    async def trigger_now(self) -> None:
        """Manually triggers the timeout callback immediately (test hook)."""
        res = self.callback()
        if asyncio.iscoroutine(res):
            await res


class HeartbeatTimer:
    """
    Periodic heartbeat ticker for Raft leaders.
    """

    def __init__(
        self,
        interval_s: float,
        callback: Callable[[], Awaitable[None] | None],
    ) -> None:
        self.interval_s = interval_s
        self.callback = callback
        self._task: Optional[asyncio.Task] = None
        self._running = False

    def start(self) -> None:
        if self._running:
            return
        self._running = True

        async def _loop() -> None:
            try:
                while self._running:
                    await asyncio.sleep(self.interval_s)
                    if not self._running:
                        break
                    try:
                        res = self.callback()
                        if asyncio.iscoroutine(res):
                            await res
                    except Exception as e:
                        logger.error(f"Error in heartbeat timer callback: {e}", exc_info=True)
            except asyncio.CancelledError:
                pass

        self._task = asyncio.create_task(_loop())

    def stop(self) -> None:
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            self._task = None

"""
Downstream storage guard adapters enforcing monotonic fencing token safety.
"""

from quorum.client.guards.exceptions import FencingGuardError, FencingTokenStaleError
from quorum.client.guards.postgres import PostgresFencedGuard
from quorum.client.guards.redis import RedisFencedGuard

__all__ = [
    "FencingGuardError",
    "FencingTokenStaleError",
    "PostgresFencedGuard",
    "RedisFencedGuard",
]

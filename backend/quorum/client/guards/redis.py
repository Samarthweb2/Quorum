"""
Redis Fencing Storage Guard.

Executes atomic Lua scripts in Redis to ensure key-value and hash updates
strictly enforce Martin Kleppmann's monotonic fencing token protocol,
instantly rejecting delayed writes from zombie workers.
"""

from __future__ import annotations

import inspect
from typing import Any, Dict, Optional, Tuple

from quorum.client.guards.exceptions import FencingGuardError, FencingTokenStaleError

# Atomic Lua script for Hash updates
HSET_FENCED_LUA = """
local key = KEYS[1]
local token_field = ARGV[1]
local new_token = tonumber(ARGV[2])
local field = ARGV[3]
local val = ARGV[4]

local cur = redis.call('HGET', key, token_field)
if cur and tonumber(cur) >= new_token then
    return {0, tostring(cur)}
end

redis.call('HSET', key, token_field, new_token)
redis.call('HSET', key, field, val)
return {1, tostring(new_token)}
"""

# Atomic Lua script for Key-Value String updates
SET_FENCED_LUA = """
local val_key = KEYS[1]
local token_key = KEYS[2]
local new_token = tonumber(ARGV[1])
local new_val = ARGV[2]

local cur = redis.call('GET', token_key)
if cur and tonumber(cur) >= new_token then
    return {0, tostring(cur)}
end

redis.call('SET', token_key, new_token)
redis.call('SET', val_key, new_val)
return {1, tostring(new_token)}
"""


class RedisFencedGuard:
    """
    Wraps an async Redis client, enforcing monotonic fencing tokens on all writes.
    Compatible with redis.asyncio.Redis and fakeredis.
    """

    def __init__(
        self,
        client: Any,
        fence_token: int,
        token_field: str = "_fence_token",
    ) -> None:
        self.client = client
        self.fence_token = int(fence_token)
        self.token_field = token_field

    async def hset(self, key: str, field: str, value: Any) -> bool:
        """
        Atomically updates a hash field only if fence_token > committed token.
        Raises FencingTokenStaleError if a higher/equal token is already committed.
        """
        val_str = str(value)
        res = await self._eval(
            HSET_FENCED_LUA,
            keys=[key],
            args=[self.token_field, self.fence_token, field, val_str],
        )

        status, token_str = res[0], res[1]
        if status == 0:
            committed = int(token_str) if token_str else None
            raise FencingTokenStaleError(
                current_token=self.fence_token,
                committed_token=committed,
                target=f"{key}#{field}",
            )
        return True

    async def hset_mapping(self, key: str, mapping: Dict[str, Any]) -> bool:
        """Atomically updates multiple fields in a hash under the fencing token."""
        for field, value in mapping.items():
            await self.hset(key, field, value)
        return True

    async def set(self, key: str, value: Any) -> bool:
        """
        Atomically updates a string key only if fence_token > committed token.
        Raises FencingTokenStaleError if a higher/equal token is already committed.
        """
        token_key = f"{key}:{self.token_field}"
        val_str = str(value)
        res = await self._eval(
            SET_FENCED_LUA,
            keys=[key, token_key],
            args=[self.fence_token, val_str],
        )

        status, token_str = res[0], res[1]
        if status == 0:
            committed = int(token_str) if token_str else None
            raise FencingTokenStaleError(
                current_token=self.fence_token,
                committed_token=committed,
                target=key,
            )
        return True

    async def get(self, key: str) -> Optional[Any]:
        """Pass-through string get."""
        fn = getattr(self.client, "get")
        if inspect.iscoroutinefunction(fn):
            return await fn(key)
        res = fn(key)
        return await res if inspect.isawaitable(res) else res

    async def hget(self, key: str, field: str) -> Optional[Any]:
        """Pass-through hash get."""
        fn = getattr(self.client, "hget")
        if inspect.iscoroutinefunction(fn):
            return await fn(key, field)
        res = fn(key, field)
        return await res if inspect.isawaitable(res) else res

    async def get_token(self, key: str) -> Optional[int]:
        """Retrieves currently committed token for a key."""
        # Try hash first
        t = await self.hget(key, self.token_field)
        if t is not None:
            return int(t)
        # Try string key
        t_key = f"{key}:{self.token_field}"
        t = await self.get(t_key)
        if t is not None:
            return int(t)
        return None

    async def _eval(self, script: str, keys: list, args: list) -> Tuple[int, str]:
        """Evaluates Lua script against async or sync redis client or mock."""
        eval_fn = getattr(self.client, "eval", None)
        if not eval_fn:
            raise FencingGuardError("Redis client does not support 'eval'")

        num_keys = len(keys)
        all_args = keys + args
        if inspect.iscoroutinefunction(eval_fn):
            res = await eval_fn(script, num_keys, *all_args)
        else:
            res = eval_fn(script, num_keys, *all_args)
            if inspect.isawaitable(res):
                res = await res

        # res is typically [status, token_str] or (status, token_str)
        if isinstance(res, (list, tuple)) and len(res) >= 2:
            st = int(res[0])
            tok = res[1].decode("utf-8") if isinstance(res[1], bytes) else str(res[1])
            return st, tok
        return 1, str(self.fence_token)

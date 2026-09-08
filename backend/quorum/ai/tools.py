"""
LangChain-Compatible Distributed Locking Tools & Fencing Guards for AI Agents.

Enables autonomous agents (LangChain, CrewAI, AutoGen, or custom LLM chains)
to coordinate execution over shared resources using Quorum's Raft consensus
leases and 64-bit monotonic fencing tokens.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional, Type

from pydantic import BaseModel, Field

# Graceful import of langchain_core
try:
    from langchain_core.tools import BaseTool
except ImportError:
    # Minimal fallback base class if langchain_core is not present
    class BaseTool:  # type: ignore
        name: str = ""
        description: str = ""
        args_schema: Optional[Type[BaseModel]] = None

        def run(self, *args, **kwargs):
            raise NotImplementedError

        async def arun(self, *args, **kwargs):
            raise NotImplementedError


logger = logging.getLogger("quorum.ai.tools")


class StaleFenceTokenException(Exception):
    """
    Raised by downstream storage when an AI agent attempts to execute a write
    with a fencing token that has been superseded by a higher token.
    This prevents the classic 'Zombie Agent' data corruption bug.
    """
    def __init__(self, resource: str, agent_id: str, token: int, max_seen: int, message: Optional[str] = None):
        self.resource = resource
        self.agent_id = agent_id
        self.token = token
        self.max_seen = max_seen
        msg = message or (
            f"Fencing validation failed on resource '{resource}': "
            f"Agent '{agent_id}' presented stale token #{token}, "
            f"but downstream storage has already processed token #{max_seen}."
        )
        super().__init__(msg)


class QuorumLockSchema(BaseModel):
    """Input schema for QuorumLockTool."""
    action: str = Field(
        ...,
        description="Action to perform: 'acquire', 'renew', or 'release'",
        examples=["acquire", "renew", "release"]
    )
    resource_key: str = Field(
        ...,
        description="The unique name of the shared resource or state to coordinate (e.g., 'financial-ledger', 'warehouse-inventory')"
    )
    ttl_ms: int = Field(
        default=5000,
        description="Time-to-live for the lease in milliseconds (default: 5000ms)"
    )
    fence_token: Optional[int] = Field(
        default=None,
        description="Required for 'renew' and 'release' actions. The 64-bit monotonic fencing token received during acquire."
    )


class QuorumLockTool(BaseTool):
    """
    LangChain Tool that equips autonomous AI agents with Quorum distributed locking.
    
    Prevents race conditions by providing:
    1. Leader-backed distributed mutual exclusion via Raft.
    2. Guaranteed strictly monotonic 64-bit fencing tokens to guard downstream tools/databases.
    """
    name: str = "quorum_distributed_lock"
    description: str = (
        "Acquire, renew, or release a distributed lock on a shared resource using Quorum Raft consensus. "
        "Returns a strictly monotonic 64-bit fencing token that must be passed to downstream tools to guarantee "
        "linearizable execution and prevent double-execution or zombie worker overwrites."
    )
    args_schema: Type[BaseModel] = QuorumLockSchema

    client: Any = None
    agent_id: str = "ai-agent"

    def __init__(self, client: Any, agent_id: str = "ai-agent", **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self.client = client
        self.agent_id = agent_id

    def _run(self, action: str, resource_key: str, ttl_ms: int = 5000, fence_token: Optional[int] = None) -> Dict[str, Any]:
        """Synchronous execution wrapper."""
        return asyncio.run(self._arun(action=action, resource_key=resource_key, ttl_ms=ttl_ms, fence_token=fence_token))

    async def _arun(
        self,
        action: str,
        resource_key: str,
        ttl_ms: int = 5000,
        fence_token: Optional[int] = None
    ) -> Dict[str, Any]:
        """Asynchronous execution for LangChain agent tool call."""
        action_norm = action.strip().lower()
        if action_norm == "acquire":
            return await self._acquire(resource_key, ttl_ms)
        elif action_norm == "renew":
            if fence_token is None:
                return {"success": False, "status": "INVALID_ARGUMENT", "message": "fence_token is required for renew"}
            return await self._renew(resource_key, fence_token, ttl_ms)
        elif action_norm == "release":
            if fence_token is None:
                return {"success": False, "status": "INVALID_ARGUMENT", "message": "fence_token is required for release"}
            return await self._release(resource_key, fence_token)
        else:
            return {"success": False, "status": "UNKNOWN_ACTION", "message": f"Unrecognized action '{action}'"}

    async def _acquire(self, resource_key: str, ttl_ms: int) -> Dict[str, Any]:
        # Handle QuorumClient SDK or Gateway ClusterController
        if hasattr(self.client, "acquire_lock"):
            # ClusterController or QuorumClient
            if asyncio.iscoroutinefunction(self.client.acquire_lock):
                import inspect
                sig = inspect.signature(self.client.acquire_lock)
                if "client_id" in sig.parameters:
                    res = await self.client.acquire_lock(resource_key, self.agent_id, ttl_ms=ttl_ms)
                    if isinstance(res, dict):
                        return res
                    return {
                        "success": True,
                        "status": "LOCK_ACQUIRED",
                        "fence_token": getattr(res, "fence_token", None),
                        "expires_at_ms": getattr(res, "expires_at_ms", None),
                        "resource": resource_key,
                        "agent_id": self.agent_id,
                    }
                else:
                    handle = await self.client.acquire_lock(resource_key, ttl_s=ttl_ms / 1000.0)
                    return {
                        "success": True,
                        "status": "LOCK_ACQUIRED",
                        "fence_token": handle.fence_token,
                        "expires_at_ms": handle.expires_at_ms,
                        "resource": resource_key,
                        "agent_id": self.agent_id,
                    }

        return {"success": False, "status": "CLIENT_ERROR", "message": "Unsupported client instance"}

    async def _renew(self, resource_key: str, fence_token: int, ttl_ms: int) -> Dict[str, Any]:
        if hasattr(self.client, "renew_lock"):
            import inspect
            sig = inspect.signature(self.client.renew_lock)
            if "fence_token" in sig.parameters:
                return await self.client.renew_lock(resource_key, self.agent_id, fence_token, ttl_ms=ttl_ms)
            else:
                from quorum.client.client import LockHandle
                fake_handle = LockHandle(key=resource_key, client_id=self.agent_id, fence_token=fence_token, expires_at_ms=0)
                ok = await self.client.renew_lock(fake_handle, ttl_s=ttl_ms / 1000.0)
                return {"success": ok, "fence_token": fence_token, "resource": resource_key}
        return {"success": False, "status": "CLIENT_ERROR"}

    async def _release(self, resource_key: str, fence_token: int) -> Dict[str, Any]:
        if hasattr(self.client, "release_lock"):
            import inspect
            sig = inspect.signature(self.client.release_lock)
            if "fence_token" in sig.parameters:
                return await self.client.release_lock(resource_key, self.agent_id, fence_token)
            else:
                from quorum.client.client import LockHandle
                fake_handle = LockHandle(key=resource_key, client_id=self.agent_id, fence_token=fence_token, expires_at_ms=0)
                ok = await self.client.release_lock(fake_handle)
                return {"success": ok, "fence_token": fence_token, "resource": resource_key}
        return {"success": False, "status": "CLIENT_ERROR"}


class QuorumAgentGuard:
    """
    Async Context Manager for AI Agents.
    Acquires lease on entry, tracks the 64-bit fencing token, optionally auto-renews
    during lengthy LLM inference steps, and releases lock on exit.
    """
    def __init__(
        self,
        client: Any,
        resource_key: str,
        agent_id: str,
        ttl_ms: int = 5000,
        auto_renew: bool = True,
    ) -> None:
        self.tool = QuorumLockTool(client=client, agent_id=agent_id)
        self.resource_key = resource_key
        self.agent_id = agent_id
        self.ttl_ms = ttl_ms
        self.auto_renew = auto_renew

        self.fence_token: Optional[int] = None
        self.expires_at_ms: Optional[int] = None
        self._renew_task: Optional[asyncio.Task] = None
        self._running = False

    async def __aenter__(self) -> "QuorumAgentGuard":
        res = await self.tool._arun("acquire", self.resource_key, ttl_ms=self.ttl_ms)
        if not res.get("success"):
            raise RuntimeError(f"Agent '{self.agent_id}' failed to acquire lock on '{self.resource_key}': {res.get('message')}")

        self.fence_token = res.get("fence_token")
        self.expires_at_ms = res.get("expires_at_ms")

        if self.auto_renew and self.fence_token is not None:
            self._running = True
            self._renew_task = asyncio.create_task(self._auto_renew_loop())

        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        self._running = False
        if self._renew_task:
            self._renew_task.cancel()
        if self.fence_token is not None:
            try:
                await self.tool._arun("release", self.resource_key, fence_token=self.fence_token)
            except Exception as e:
                logger.warning(f"Error releasing lock during guard exit: {e}")

    async def _auto_renew_loop(self) -> None:
        interval = max(0.5, (self.ttl_ms / 1000.0) / 3.0)
        while self._running:
            try:
                await asyncio.sleep(interval)
                if not self._running or self.fence_token is None:
                    break
                res = await self.tool._arun("renew", self.resource_key, ttl_ms=self.ttl_ms, fence_token=self.fence_token)
                if not res.get("success"):
                    logger.warning(f"Guard renewal failed for agent '{self.agent_id}' on '{self.resource_key}'")
                    break
            except asyncio.CancelledError:
                break


class FencedStorageTarget:
    """
    Downstream storage / API target that enforces strictly monotonic fencing tokens.
    Guarantees that delayed or hallucinated AI agent tool writes are rejected if another
    agent has already acquired a higher fencing token.
    """
    def __init__(self) -> None:
        # resource_name -> latest committed data payload
        self.storage: Dict[str, Dict[str, Any]] = {}
        # resource_name -> highest fencing token observed
        self.max_fence_tokens: Dict[str, int] = {}
        # audit trail of mutations & rejections
        self.audit_log: list[Dict[str, Any]] = []

    def reset(self, resource_name: str, initial_data: Dict[str, Any]) -> None:
        self.storage[resource_name] = dict(initial_data)
        self.max_fence_tokens[resource_name] = 0

    def execute_mutation(
        self,
        resource_name: str,
        agent_id: str,
        fence_token: int,
        mutation: Dict[str, Any],
        bypass_fencing: bool = False,
    ) -> Dict[str, Any]:
        now_ms = int(time.time() * 1000)
        max_seen = self.max_fence_tokens.get(resource_name, 0)

        # Fencing token safety check:
        # A valid write MUST have a token >= max_seen
        if not bypass_fencing and fence_token < max_seen:
            event = {
                "timestamp_ms": now_ms,
                "resource": resource_name,
                "agent_id": agent_id,
                "fence_token": fence_token,
                "max_seen": max_seen,
                "status": "REJECTED_STALE_TOKEN",
                "mutation": mutation,
                "reason": f"Zombie agent write rejected! Token #{fence_token} < Highest Observed #{max_seen}",
            }
            self.audit_log.append(event)
            raise StaleFenceTokenException(resource_name, agent_id, fence_token, max_seen)

        # Token accepted: update state and advance max token
        if fence_token > max_seen:
            self.max_fence_tokens[resource_name] = fence_token

        current_data = self.storage.get(resource_name, {})
        # Merge or apply delta
        for k, v in mutation.items():
            if isinstance(v, (int, float)) and k in current_data and isinstance(current_data[k], (int, float)):
                # Apply delta if formatted as diff or overwrite
                current_data[k] += v
            else:
                current_data[k] = v

        current_data["_last_updated_by"] = agent_id
        current_data["_last_fence_token"] = fence_token
        current_data["_last_updated_ms"] = now_ms
        self.storage[resource_name] = current_data

        event = {
            "timestamp_ms": now_ms,
            "resource": resource_name,
            "agent_id": agent_id,
            "fence_token": fence_token,
            "max_seen": self.max_fence_tokens[resource_name],
            "status": "COMMITTED",
            "mutation": mutation,
            "result_state": dict(current_data),
        }
        self.audit_log.append(event)
        return event

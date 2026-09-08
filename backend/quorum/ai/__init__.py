"""
Quorum AI Agent Coordination Package.

Provides LangChain-compatible distributed locking tools, monotonic fencing
guards, and multi-agent coordination engines to prevent race conditions and
stale writes in autonomous AI agent workflows.
"""

from quorum.ai.tools import (
    QuorumLockTool,
    QuorumAgentGuard,
    FencedStorageTarget,
    StaleFenceTokenException,
)
from quorum.ai.coordinator import (
    AgentSwarmCoordinator,
    AgentPersona,
    AgentExecutionStep,
)

__all__ = [
    "QuorumLockTool",
    "QuorumAgentGuard",
    "FencedStorageTarget",
    "StaleFenceTokenException",
    "AgentSwarmCoordinator",
    "AgentPersona",
    "AgentExecutionStep",
]

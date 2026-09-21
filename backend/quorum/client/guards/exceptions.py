"""
Exceptions for Quorum Client Storage Guards.
"""

from __future__ import annotations

from typing import Optional


class FencingGuardError(Exception):
    """Base exception for all fencing guard violations."""
    pass


class FencingTokenStaleError(FencingGuardError):
    """
    Raised when a storage write is rejected because a higher (or equal)
    fencing token has already been committed to the target storage.
    
    Prevents zombie workers from corrupting downstream databases.
    """

    def __init__(
        self,
        current_token: int,
        committed_token: Optional[int] = None,
        target: str = "",
        message: Optional[str] = None,
    ) -> None:
        self.current_token = current_token
        self.committed_token = committed_token
        self.target = target
        if not message:
            comm_str = f"committed token {committed_token}" if committed_token is not None else "already committed higher token"
            message = (
                f"Fencing token violation on target '{target}': "
                f"attempted write with stale token {current_token} rejected by {comm_str}."
            )
        super().__init__(message)

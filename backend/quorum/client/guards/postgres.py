"""
PostgreSQL / SQL Fencing Storage Guard.

Automatically injects Martin Kleppmann's monotonic fencing token conditions into
SQL UPDATE statements to protect against stale writes from delayed zombie workers.
"""

from __future__ import annotations

import inspect
import re
from typing import Any, List, Optional, Tuple

from quorum.client.guards.exceptions import FencingGuardError, FencingTokenStaleError


class PostgresFencedGuard:
    """
    Wraps an async or sync database connection, automatically injecting
    monotonic fencing token checks into UPDATE statements.
    
    Compatible with:
    - asyncpg.Connection
    - aiosqlite.Connection
    - sqlite3.Connection
    - Generic PEP 249 DB-API connections / cursors
    """

    def __init__(
        self,
        conn: Any,
        fence_token: int,
        token_col: str = "last_fence_token",
    ) -> None:
        self.conn = conn
        self.fence_token = int(fence_token)
        self.token_col = token_col

    def rewrite_update_query(self, query: str) -> Tuple[str, str, Optional[str]]:
        """
        Rewrites an UPDATE SQL statement to include monotonic fencing token checks.
        
        Returns (rewritten_query, table_name, original_where_clause).
        """
        clean_query = query.strip().rstrip(";")

        # Match UPDATE <table> SET <set_clause> [WHERE <where_clause>]
        pattern = re.compile(
            r"^\s*UPDATE\s+([a-zA-Z0-9_\"\.]+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?$",
            re.IGNORECASE | re.DOTALL,
        )
        match = pattern.match(clean_query)
        if not match:
            # Not a standard UPDATE query (e.g. INSERT, SELECT, DELETE) -> return as-is
            return query, "", None

        table = match.group(1).strip()
        set_clause = match.group(2).strip()
        where_clause = match.group(3).strip() if match.group(3) else None

        # Inject token into SET clause
        new_set = f"{set_clause}, {self.token_col} = {self.fence_token}"

        # Inject fencing condition into WHERE clause
        fencing_cond = f"({self.token_col} IS NULL OR {self.token_col} < {self.fence_token})"
        if where_clause:
            new_where = f"({where_clause}) AND {fencing_cond}"
        else:
            new_where = fencing_cond

        rewritten = f"UPDATE {table} SET {new_set} WHERE {new_where}"
        return rewritten, table, where_clause

    async def execute(self, query: str, *params: Any) -> Any:
        """
        Executes a query with automatic fencing token injection on UPDATEs.
        If 0 rows are affected due to an existing higher/equal token,
        raises FencingTokenStaleError.
        """
        rewritten_query, table, original_where = self.rewrite_update_query(query)

        # Execute query on underlying connection (handling both async and sync drivers)
        result = await self._run_query(self.conn, rewritten_query, *params)
        affected_rows = self._extract_affected_rows(result)

        # If it was an UPDATE and affected 0 rows, check if it was due to a stale token
        if table and affected_rows == 0 and original_where is not None:
            await self._verify_stale_token(table, original_where, params)

        return result

    async def execute_fenced(
        self,
        table: str,
        set_clause: str,
        where_clause: str,
        *params: Any,
    ) -> Any:
        """
        Programmatic fenced update helper.
        """
        query = f"UPDATE {table} SET {set_clause} WHERE {where_clause}"
        return await self.execute(query, *params)

    async def _verify_stale_token(
        self,
        table: str,
        where_clause: str,
        params: Tuple[Any, ...],
    ) -> None:
        """
        Queries target record to verify if a higher or equal fencing token was committed.
        """
        check_query = f"SELECT {self.token_col} FROM {table} WHERE {where_clause}"
        try:
            row = await self._run_query_single(self.conn, check_query, *params)
            if row is not None:
                # Handle tuple, dict, or Record
                committed_token = None
                if isinstance(row, dict):
                    committed_token = row.get(self.token_col)
                elif hasattr(row, "__getitem__"):
                    committed_token = row[0]
                elif hasattr(row, self.token_col):
                    committed_token = getattr(row, self.token_col)

                if committed_token is not None and int(committed_token) >= self.fence_token:
                    raise FencingTokenStaleError(
                        current_token=self.fence_token,
                        committed_token=int(committed_token),
                        target=table,
                    )
        except FencingTokenStaleError:
            raise
        except Exception:
            # If inspection fails (e.g. column not yet migrated), pass through
            pass

    async def _run_query(self, conn: Any, query: str, *params: Any) -> Any:
        """Runs query supporting asyncpg, aiosqlite, sqlite3, and generic drivers."""
        if hasattr(conn, "execute"):
            fn = conn.execute
            if inspect.iscoroutinefunction(fn):
                return await fn(query, *params)
            else:
                res = fn(query, *params)
                if inspect.isawaitable(res):
                    return await res
                return res
        elif hasattr(conn, "cursor"):
            cur = conn.cursor()
            if inspect.iscoroutinefunction(conn.cursor):
                cur = await conn.cursor()
            fn = cur.execute
            if inspect.iscoroutinefunction(fn):
                res = await fn(query, *params)
            else:
                res = fn(query, *params)
                if inspect.isawaitable(res):
                    res = await res
            return cur or res
        raise FencingGuardError(f"Unsupported database connection type: {type(conn)}")

    async def _run_query_single(self, conn: Any, query: str, *params: Any) -> Optional[Any]:
        """Runs single-row select query for token verification."""
        if hasattr(conn, "fetchrow") and inspect.iscoroutinefunction(conn.fetchrow):
            return await conn.fetchrow(query, *params)
        elif hasattr(conn, "execute"):
            res = await self._run_query(conn, query, *params)
            if hasattr(res, "fetchone"):
                fn = res.fetchone
                if inspect.iscoroutinefunction(fn):
                    return await fn()
                val = fn()
                if inspect.isawaitable(val):
                    return await val
                return val
        return None

    def _extract_affected_rows(self, result: Any) -> Optional[int]:
        """Extracts affected row count from asyncpg string or cursor.rowcount."""
        if isinstance(result, str) and result.startswith("UPDATE "):
            try:
                return int(result.split()[-1])
            except (ValueError, IndexError):
                pass
        if hasattr(result, "rowcount"):
            return result.rowcount
        return None

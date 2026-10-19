"""Database access.

SECURITY RULE: the worker connects with the Supabase service role, which
bypasses Row Level Security. Every query therefore takes ``tenant_id`` as its
first argument and every statement filters on it. ``require_tenant_id`` raises
instead of silently widening a query to all tenants.
"""

from __future__ import annotations

import json
from typing import Any, Sequence
from uuid import UUID

import asyncpg


def require_tenant_id(tenant_id: str | UUID | None) -> str:
    if not tenant_id or not str(tenant_id).strip():
        raise ValueError("tenant_id is required for every tenant-scoped query")
    return str(tenant_id)


def json_dict(value: Any) -> dict[str, Any]:
    """asyncpg returns jsonb as text unless a codec is registered."""
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if isinstance(value, (str, bytes, bytearray)):
        raw = value.decode() if isinstance(value, (bytes, bytearray)) else value
        return json.loads(raw) if raw.strip() else {}
    return {}


class Database:
    """Thin asyncpg wrapper that enforces the tenant guard."""

    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    @classmethod
    async def connect(cls, dsn: str) -> "Database":
        if not dsn:
            raise RuntimeError("DATABASE_URL is not configured")
        pool = await asyncpg.create_pool(dsn, min_size=1, max_size=10)
        return cls(pool)

    async def close(self) -> None:
        await self.pool.close()

    async def fetch(
        self, tenant_id: str | UUID, query: str, *args: Any
    ) -> list[asyncpg.Record]:
        require_tenant_id(tenant_id)
        async with self.pool.acquire() as conn:
            return list(await conn.fetch(query, *args))

    async def fetchrow(
        self, tenant_id: str | UUID, query: str, *args: Any
    ) -> asyncpg.Record | None:
        require_tenant_id(tenant_id)
        async with self.pool.acquire() as conn:
            return await conn.fetchrow(query, *args)

    async def fetchval(
        self, tenant_id: str | UUID, query: str, *args: Any
    ) -> Any:
        require_tenant_id(tenant_id)
        async with self.pool.acquire() as conn:
            return await conn.fetchval(query, *args)

    async def execute(
        self, tenant_id: str | UUID, query: str, *args: Any
    ) -> str:
        require_tenant_id(tenant_id)
        async with self.pool.acquire() as conn:
            return await conn.execute(query, *args)

    async def fetch_tenant(self, tenant_id: str | UUID) -> dict[str, Any] | None:
        require_tenant_id(tenant_id)
        row = await self.fetchrow(
            tenant_id,
            "select id, name, slug, settings from tenants where id = $1",
            str(tenant_id),
        )
        if row is None:
            return None
        data = dict(row)
        data["settings"] = json_dict(data.get("settings"))
        return data

    async def executemany(
        self, tenant_id: str | UUID, query: str, args: Sequence[Sequence[Any]]
    ) -> None:
        require_tenant_id(tenant_id)
        async with self.pool.acquire() as conn:
            await conn.executemany(query, args)

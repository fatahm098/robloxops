"""Postgres-backed job queue.

Queue contract (SQL lives in supabase/migrations, pg-boss is Node-only and not
used here)::

    jobs(id uuid, tenant_id uuid, kind text, payload jsonb, status text,
         attempts int, last_error text, created_at timestamptz, ...)

    claim_jobs(worker_id text, batch int, kinds text[]) returns setof jobs
    complete_job(id uuid) returns void
    fail_job(id uuid, error text) returns void
    reap_stale_jobs(timeout_seconds int) returns int

Claiming is intentionally cross-tenant (a worker serves all tenants); every
write below carries the job's ``tenant_id`` explicitly.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Sequence
from uuid import UUID

from app.db import require_tenant_id

MAX_BATCH = 50
MAX_ERROR_CHARS = 2000

CLAIM_SQL = "SELECT * FROM claim_jobs($1, $2, $3::text[])"
COMPLETE_SQL = "SELECT complete_job($1)"
FAIL_SQL = "SELECT fail_job($1, $2)"
REAP_SQL = "SELECT reap_stale_jobs($1)"
ENQUEUE_SQL = """
INSERT INTO jobs (tenant_id, kind, payload)
VALUES ($1, $2, $3::jsonb)
ON CONFLICT DO NOTHING
RETURNING id
"""

STALE_JOB_TIMEOUT_SECONDS = 300


@dataclass(slots=True)
class Job:
    id: UUID
    tenant_id: UUID
    kind: str
    payload: dict[str, Any] = field(default_factory=dict)
    attempts: int = 0

    @classmethod
    def from_row(cls, row: Any) -> "Job":
        payload = row["payload"]
        if isinstance(payload, str):
            payload = json.loads(payload) if payload.strip() else {}
        return cls(
            id=row["id"],
            tenant_id=row["tenant_id"],
            kind=row["kind"],
            payload=payload or {},
            attempts=int(row["attempts"]) if "attempts" in row.keys() else 0,
        )


async def claim_jobs(
    pool: Any, worker_id: str, batch: int = 5, kinds: Sequence[str] | None = None
) -> list[Job]:
    """Claim up to ``batch`` jobs of the given ``kinds``.

    Kind filtering happens server-side (``kind = any(kinds)``) so jobs the
    worker cannot dispatch are never marked ``running`` — client-side filtering
    used to leak those rows in ``running`` forever.
    """
    if not worker_id or not worker_id.strip():
        raise ValueError("worker_id is required to claim jobs")
    safe_batch = max(1, min(int(batch), MAX_BATCH))
    kind_list = [str(kind) for kind in kinds] if kinds else None
    rows = await pool.fetch(CLAIM_SQL, worker_id, safe_batch, kind_list)
    return [Job.from_row(row) for row in rows]


async def reap_stale_jobs(pool: Any, timeout_seconds: int = STALE_JOB_TIMEOUT_SECONDS) -> int:
    """Return jobs stuck in ``running`` longer than ``timeout_seconds`` to ``queued``."""
    safe_timeout = max(1, int(timeout_seconds))
    reaped = await pool.fetchval(REAP_SQL, safe_timeout)
    return int(reaped or 0)


async def complete_job(pool: Any, job_id: UUID) -> None:
    await pool.fetchval(COMPLETE_SQL, job_id)


async def fail_job(pool: Any, job_id: UUID, error: str) -> None:
    await pool.fetchval(FAIL_SQL, job_id, (error or "unknown error")[:MAX_ERROR_CHARS])


async def enqueue_job(
    pool: Any, tenant_id: UUID, kind: str, payload: dict[str, Any]
) -> UUID:
    require_tenant_id(tenant_id)
    if not kind:
        raise ValueError("job kind is required")
    return await pool.fetchval(ENQUEUE_SQL, tenant_id, kind, json.dumps(payload, default=str))

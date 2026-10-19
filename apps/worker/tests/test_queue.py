"""Queue contract tests with a fake asyncpg pool."""

from __future__ import annotations

import json
from typing import Any
from uuid import uuid4

import pytest

from app.queue import MAX_ERROR_CHARS, claim_jobs, complete_job, enqueue_job, fail_job

TENANT_ID = uuid4()


class FakePool:
    def __init__(self, rows: list[dict[str, Any]] | None = None) -> None:
        self.rows = rows or []
        self.calls: list[tuple[str, tuple[Any, ...]]] = []
        self.return_value: Any = uuid4()

    async def fetch(self, sql: str, *args: Any) -> list[dict[str, Any]]:
        self.calls.append((sql, args))
        return self.rows

    async def fetchval(self, sql: str, *args: Any) -> Any:
        self.calls.append((sql, args))
        return self.return_value


@pytest.mark.asyncio
async def test_claim_jobs_parses_payload_and_limits_batch() -> None:
    job_id = uuid4()
    pool = FakePool(
        rows=[
            {
                "id": job_id,
                "tenant_id": TENANT_ID,
                "kind": "intake",
                "payload": json.dumps({"message_id": "m-1"}),
                "attempts": 2,
            }
        ]
    )

    jobs = await claim_jobs(pool, "worker-1", batch=999)

    assert len(jobs) == 1
    assert jobs[0].id == job_id
    assert jobs[0].payload == {"message_id": "m-1"}
    assert jobs[0].attempts == 2
    sql, args = pool.calls[0]
    assert "claim_jobs" in sql
    assert args == ("worker-1", 50)


@pytest.mark.asyncio
async def test_claim_jobs_requires_worker_id() -> None:
    with pytest.raises(ValueError):
        await claim_jobs(FakePool(), "  ")


@pytest.mark.asyncio
async def test_claim_jobs_filters_kinds_client_side() -> None:
    pool = FakePool(
        rows=[
            {"id": uuid4(), "tenant_id": TENANT_ID, "kind": "intake", "payload": {}},
            {"id": uuid4(), "tenant_id": TENANT_ID, "kind": "qa", "payload": {}},
        ]
    )

    jobs = await claim_jobs(pool, "worker-1", kinds=["qa"])

    assert [job.kind for job in jobs] == ["qa"]


@pytest.mark.asyncio
async def test_complete_and_fail_call_sql_functions() -> None:
    pool = FakePool()
    job_id = uuid4()

    await complete_job(pool, job_id)
    await fail_job(pool, job_id, "boom")

    assert "complete_job" in pool.calls[0][0]
    assert pool.calls[0][1] == (job_id,)
    assert "fail_job" in pool.calls[1][0]
    assert pool.calls[1][1] == (job_id, "boom")


@pytest.mark.asyncio
async def test_fail_job_truncates_error() -> None:
    pool = FakePool()

    await fail_job(pool, uuid4(), "x" * 5000)

    assert len(pool.calls[0][1][1]) == MAX_ERROR_CHARS


@pytest.mark.asyncio
async def test_enqueue_job_scopes_tenant_and_keeps_snake_case_payload() -> None:
    pool = FakePool()
    payload = {"message_id": "m-1", "author_id": "u-1"}

    job_id = await enqueue_job(pool, TENANT_ID, "intake", payload)

    assert job_id == pool.return_value
    sql, args = pool.calls[0]
    assert "tenant_id" in sql
    assert args[0] == TENANT_ID
    assert args[1] == "intake"
    assert json.loads(args[2]) == payload


@pytest.mark.asyncio
async def test_enqueue_job_rejects_missing_tenant() -> None:
    with pytest.raises(ValueError):
        await enqueue_job(FakePool(), None, "intake", {})  # type: ignore[arg-type]

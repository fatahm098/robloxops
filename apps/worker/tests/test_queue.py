"""Queue contract tests with a fake asyncpg pool."""

from __future__ import annotations

import json
from typing import Any
from uuid import uuid4

import pytest

from app.llm import FakeLLM
from app.queue import (
    CLAIM_SQL,
    ENQUEUE_SQL,
    MAX_ERROR_CHARS,
    REAP_SQL,
    Job,
    claim_jobs,
    complete_job,
    enqueue_job,
    fail_job,
    reap_stale_jobs,
)
from runner import dispatch

TENANT_ID = uuid4()
DELIVERABLE_ID = uuid4()


class RunnerFakeDB:
    """Minimal tenant/audit surface used by the runner's pause guard."""

    def __init__(self, *, paused: bool = False) -> None:
        self.tenant = {
            "id": TENANT_ID,
            "name": "Pixel Forge",
            "settings": {"ai_paused": paused},
        }
        self.audits: list[dict[str, Any]] = []

    async def fetch_tenant(self, tenant_id: Any) -> dict[str, Any] | None:
        assert tenant_id == TENANT_ID, "unscoped tenant_id"
        return self.tenant

    async def fetchrow(self, tenant_id: Any, sql: str, *args: Any) -> Any:
        assert tenant_id == TENANT_ID, "unscoped tenant_id"
        assert "insert into agent_audit_log" in " ".join(sql.split()).lower()
        _, agent_name, action, *_rest, status, error_message = args
        self.audits.append(
            {"agent_name": agent_name, "action": action, "status": status, "error": error_message}
        )
        return {"id": uuid4()}


def _qa_job() -> Job:
    return Job(
        id=uuid4(),
        tenant_id=TENANT_ID,
        kind="qa_check",
        payload={"deliverable_id": str(DELIVERABLE_ID)},
    )


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
    assert args == ("worker-1", 50, None)


@pytest.mark.asyncio
async def test_claim_jobs_requires_worker_id() -> None:
    with pytest.raises(ValueError):
        await claim_jobs(FakePool(), "  ")


@pytest.mark.asyncio
async def test_claim_jobs_passes_kinds_to_sql_function() -> None:
    """Kind filtering is server-side now, so non-matching jobs never run."""
    pool = FakePool(rows=[])

    await claim_jobs(pool, "worker-1", kinds=["intake", "qa_check"])

    sql, args = pool.calls[0]
    assert sql == CLAIM_SQL
    assert "claim_jobs($1, $2, $3" in sql
    assert args[0] == "worker-1"
    assert args[1] == 5
    assert args[2] == ["intake", "qa_check"]


@pytest.mark.asyncio
async def test_claim_jobs_without_kinds_passes_none() -> None:
    pool = FakePool(rows=[])

    await claim_jobs(pool, "worker-1")

    assert pool.calls[0][1][2] is None


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
    assert sql == ENQUEUE_SQL
    assert "on conflict do nothing" in sql.lower()
    assert "tenant_id" in sql
    assert args[0] == TENANT_ID
    assert args[1] == "intake"
    assert json.loads(args[2]) == payload


@pytest.mark.asyncio
async def test_enqueue_job_rejects_missing_tenant() -> None:
    with pytest.raises(ValueError):
        await enqueue_job(FakePool(), None, "intake", {})  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_reap_stale_jobs_calls_sql_function() -> None:
    pool = FakePool()
    pool.return_value = 3

    reaped = await reap_stale_jobs(pool, timeout_seconds=120)

    sql, args = pool.calls[0]
    assert sql == REAP_SQL
    assert "reap_stale_jobs" in sql
    assert args == (120,)
    assert reaped == 3


@pytest.mark.asyncio
async def test_reap_stale_jobs_clamps_timeout() -> None:
    pool = FakePool()
    pool.return_value = 0

    await reap_stale_jobs(pool, timeout_seconds=0)

    assert pool.calls[0][1] == (1,)


@pytest.mark.asyncio
async def test_dispatch_skips_qa_for_paused_tenant(monkeypatch: pytest.MonkeyPatch) -> None:
    """A queued QA job must not run LLM work for a paused tenant."""
    called = False

    async def fake_run_qa(*args: Any, **kwargs: Any) -> None:
        nonlocal called
        called = True

    monkeypatch.setattr("runner.run_qa", fake_run_qa)
    db = RunnerFakeDB(paused=True)

    handled = await dispatch(db, FakeLLM(), _qa_job())

    assert handled is True
    assert called is False
    assert db.audits[-1]["action"] == "ai_paused"
    assert db.audits[-1]["status"] == "escalated"
    assert db.audits[-1]["error"] == "ai_paused=true"


@pytest.mark.asyncio
async def test_dispatch_runs_qa_for_unpaused_tenant(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, Any] = {}

    async def fake_run_qa(database: Any, llm: Any, tenant_id: Any, deliverable_id: Any) -> None:
        seen["tenant_id"] = tenant_id
        seen["deliverable_id"] = deliverable_id

    monkeypatch.setattr("runner.run_qa", fake_run_qa)
    db = RunnerFakeDB(paused=False)

    handled = await dispatch(db, FakeLLM(), _qa_job())

    assert handled is True
    assert seen["tenant_id"] == TENANT_ID
    assert seen["deliverable_id"] == DELIVERABLE_ID
    assert db.audits == []


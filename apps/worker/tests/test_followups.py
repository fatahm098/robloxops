"""Follow-up persistence tests with the fake-DB pattern from test_brief.py.

Every fake call asserts the tenant guard, so an unscoped query fails loudly.
"""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID, uuid4

import pytest

from app.followups import list_due_followups, record_followup, run_followup

TENANT_ID = uuid4()
OTHER_TENANT_ID = uuid4()
PROJECT_ID = uuid4()


def _norm(sql: str) -> str:
    return " ".join(sql.split()).lower()


class FakeDB:
    """Routes queries by shape; asserts every call is tenant-scoped."""

    def __init__(self) -> None:
        self.followups: list[dict[str, Any]] = []
        self.audits: list[dict[str, Any]] = []
        self.fetches: list[tuple[str, tuple[Any, ...]]] = []

    async def fetchrow(self, tenant_id: UUID, sql: str, *args: Any) -> Any:
        assert tenant_id == TENANT_ID, "unscoped tenant_id"
        s = _norm(sql)
        if "insert into followups" in s:
            (
                _,
                project_id,
                customer_id,
                kind,
                channel,
                status,
                due_at,
                sent_at,
                payload,
            ) = args
            row = {
                "id": uuid4(),
                "tenant_id": tenant_id,
                "project_id": project_id,
                "customer_id": customer_id,
                "kind": kind,
                "channel": channel,
                "status": status,
                "due_at": due_at,
                "sent_at": sent_at,
                "payload": json.loads(payload),
            }
            self.followups.append(row)
            return {"id": row["id"], "status": row["status"]}
        if "insert into agent_audit_log" in s:
            (
                _,
                agent_name,
                action,
                entity_type,
                entity_id,
                input_summary,
                output_summary,
                model_used,
                status,
                error_message,
            ) = args
            self.audits.append(
                {
                    "tenant_id": tenant_id,
                    "agent_name": agent_name,
                    "action": action,
                    "entity_type": entity_type,
                    "entity_id": entity_id,
                    "model_used": model_used,
                    "status": status,
                    "error_message": error_message,
                }
            )
            return {"id": uuid4()}
        raise AssertionError(f"unexpected fetchrow: {s}")

    async def fetch(self, tenant_id: UUID, sql: str, *args: Any) -> list[Any]:
        assert tenant_id == TENANT_ID, "unscoped tenant_id"
        self.fetches.append((_norm(sql), args))
        return [row for row in self.followups if row["tenant_id"] == tenant_id]


@pytest.mark.asyncio
async def test_run_followup_inserts_row_and_audits() -> None:
    db = FakeDB()

    result = await run_followup(
        db,
        TENANT_ID,
        kind="nudge",
        project_id=PROJECT_ID,
        status="pending",
        payload={"reference_code": "ROB-1", "message": "checking in"},
        model_used="FakeLLM",
    )

    assert result["status"] == "pending"
    assert len(db.followups) == 1
    stored = db.followups[0]
    assert stored["tenant_id"] == TENANT_ID
    assert stored["project_id"] == PROJECT_ID
    assert stored["kind"] == "nudge"
    assert stored["payload"] == {"reference_code": "ROB-1", "message": "checking in"}

    assert db.audits[-1]["agent_name"] == "project_manager"
    assert db.audits[-1]["action"] == "followup_sent"
    assert db.audits[-1]["entity_type"] == "project"
    assert db.audits[-1]["entity_id"] == PROJECT_ID
    assert db.audits[-1]["status"] == "success"


@pytest.mark.asyncio
async def test_run_followup_is_customer_level_without_project() -> None:
    customer_id = uuid4()
    db = FakeDB()

    await run_followup(db, TENANT_ID, kind="reminder", customer_id=customer_id)

    assert db.followups[0]["project_id"] is None
    assert db.followups[0]["customer_id"] == customer_id
    assert db.audits[-1]["entity_type"] == "customer"
    assert db.audits[-1]["entity_id"] == customer_id


@pytest.mark.asyncio
async def test_record_followup_persists_defaults() -> None:
    db = FakeDB()

    await record_followup(db, TENANT_ID)

    assert len(db.followups) == 1
    assert db.followups[0]["kind"] == "nudge"
    assert db.followups[0]["status"] == "pending"
    assert db.followups[0]["payload"] == {}
    assert db.audits == [], "record_followup is the pure insert path"


@pytest.mark.asyncio
async def test_list_due_followups_scopes_to_tenant_and_limit() -> None:
    db = FakeDB()
    db.followups.extend(
        [
            {"tenant_id": TENANT_ID, "id": uuid4(), "status": "pending"},
            {"tenant_id": OTHER_TENANT_ID, "id": uuid4(), "status": "pending"},
        ]
    )

    rows = await list_due_followups(db, TENANT_ID, limit=5)

    assert all(row["tenant_id"] == TENANT_ID for row in rows)
    assert len(rows) == 1
    sql, args = db.fetches[-1]
    assert "where tenant_id = $1" in sql
    assert "status = 'pending'" in sql
    assert args == (TENANT_ID, 5)


@pytest.mark.asyncio
async def test_followup_helpers_reject_missing_tenant() -> None:
    db = FakeDB()

    with pytest.raises(ValueError):
        await record_followup(db, None)  # type: ignore[arg-type]
    with pytest.raises(ValueError):
        await list_due_followups(db, "")  # type: ignore[arg-type]

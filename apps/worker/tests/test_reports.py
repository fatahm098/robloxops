"""Report persistence tests with the fake-DB pattern from test_brief.py.

The fake enforces the ``(tenant_id, project_id, kind)`` upsert semantics and
asserts every call is tenant-scoped, so an unscoped query fails loudly.
"""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID, uuid4

import pytest

from app.reports import persist_report

TENANT_ID = uuid4()
OTHER_TENANT_ID = uuid4()
PROJECT_ID = uuid4()


def _norm(sql: str) -> str:
    return " ".join(sql.split()).lower()


class FakeDB:
    """Routes queries by shape; asserts every call is tenant-scoped."""

    def __init__(self) -> None:
        self.reports: dict[tuple[Any, Any, Any], dict[str, Any]] = {}
        self.audits: list[dict[str, Any]] = []

    async def fetchrow(self, tenant_id: UUID, sql: str, *args: Any) -> Any:
        assert tenant_id == TENANT_ID, "unscoped tenant_id"
        s = _norm(sql)
        if "insert into reports" in s:
            _, project_id, kind, content_md, payload = args
            key = (tenant_id, project_id, kind)
            existing = self.reports.get(key)
            row = {
                "id": existing["id"] if existing else uuid4(),
                "tenant_id": tenant_id,
                "project_id": project_id,
                "kind": kind,
                "content_md": content_md,
                "payload": json.loads(payload),
            }
            self.reports[key] = row
            return {"id": row["id"], "created_at": "2026-10-19T00:00:00Z", "updated_at": "2026-10-19T00:00:00Z"}
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
                    "status": status,
                    "error_message": error_message,
                }
            )
            return {"id": uuid4()}
        raise AssertionError(f"unexpected fetchrow: {s}")


@pytest.mark.asyncio
async def test_persist_report_inserts_then_updates_same_key() -> None:
    db = FakeDB()

    first = await persist_report(
        db, TENANT_ID, PROJECT_ID, "delivery", "# Report v1", payload={"reference_code": "ROB-1"}
    )
    second = await persist_report(
        db, TENANT_ID, PROJECT_ID, "delivery", "# Report v2", payload={"reference_code": "ROB-1"}
    )

    # Upsert replaces in place: one row, stable id, newest content.
    assert len(db.reports) == 1
    assert first["id"] == second["id"]
    stored = next(iter(db.reports.values()))
    assert stored["content_md"] == "# Report v2"
    assert stored["kind"] == "delivery"


@pytest.mark.asyncio
async def test_persist_report_keeps_kinds_separate() -> None:
    db = FakeDB()

    await persist_report(db, TENANT_ID, PROJECT_ID, "delivery", "# delivery")
    await persist_report(db, TENANT_ID, PROJECT_ID, "qa", "# qa")

    assert len(db.reports) == 2


@pytest.mark.asyncio
async def test_persist_report_logs_project_manager_audit() -> None:
    db = FakeDB()

    await persist_report(db, TENANT_ID, PROJECT_ID, "delivery", "# report")

    assert db.audits[-1]["agent_name"] == "project_manager"
    assert db.audits[-1]["action"] == "report_generated"
    assert db.audits[-1]["entity_type"] == "project"
    assert db.audits[-1]["entity_id"] == PROJECT_ID
    assert db.audits[-1]["status"] == "success"


@pytest.mark.asyncio
async def test_persist_report_is_tenant_scoped() -> None:
    db = FakeDB()

    await persist_report(db, TENANT_ID, PROJECT_ID, "delivery", "# report")

    key = next(iter(db.reports))
    assert key[0] == TENANT_ID
    assert all(row["tenant_id"] == TENANT_ID for row in db.reports.values())


@pytest.mark.asyncio
async def test_persist_report_rejects_missing_tenant() -> None:
    db = FakeDB()

    with pytest.raises(ValueError):
        await persist_report(db, None, PROJECT_ID, "delivery", "# report")  # type: ignore[arg-type]

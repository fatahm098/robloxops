"""Revision handler tests with the fake-DB pattern from test_brief.py.

Every fake call asserts the tenant guard, so an unscoped query fails loudly.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

import pytest

from app.handlers.revision import create_revision

TENANT_ID = uuid4()
PROJECT_ID = uuid4()


def _norm(sql: str) -> str:
    return " ".join(sql.split()).lower()


class FakeDB:
    """Routes queries by shape; asserts every call is tenant-scoped."""

    def __init__(self, *, has_project: bool = True) -> None:
        self.has_project = has_project
        self.revisions: list[dict[str, Any]] = []
        self.audits: list[dict[str, Any]] = []
        self.updates: list[tuple[str, tuple[Any, ...]]] = []

    async def fetchrow(self, tenant_id: UUID, sql: str, *args: Any) -> Any:
        assert tenant_id == TENANT_ID, "unscoped tenant_id"
        s = _norm(sql)
        if "select id from projects" in s:
            assert args == (TENANT_ID, PROJECT_ID)
            return {"id": PROJECT_ID} if self.has_project else None
        if "insert into revisions" in s:
            _, project_id, requested_by, reason = args
            row = {
                "id": uuid4(),
                "project_id": project_id,
                "requested_by": requested_by,
                "reason": reason,
                "status": "open",
                "created_at": "2026-10-19T00:00:00+00:00",
                "resolved_at": None,
            }
            self.revisions.append(row)
            return row
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
                    "input_summary": input_summary,
                    "output_summary": output_summary,
                    "status": status,
                    "error_message": error_message,
                }
            )
            return {"id": uuid4()}
        raise AssertionError(f"unexpected fetchrow: {s}")

    async def execute(self, tenant_id: UUID, sql: str, *args: Any) -> str:
        assert tenant_id == TENANT_ID, "unscoped tenant_id"
        self.updates.append((_norm(sql), args))
        return "UPDATE 1"


@pytest.mark.asyncio
async def test_create_revision_logs_bumps_project_and_audits() -> None:
    db = FakeDB()

    result = await create_revision(
        db, TENANT_ID, PROJECT_ID, "discord-user-1", "Make the visor matte"
    )

    assert result["status"] == "open"
    assert result["project_id"] == PROJECT_ID
    assert result["reason"] == "Make the visor matte"
    assert len(db.revisions) == 1

    assert len(db.updates) == 1
    sql, args = db.updates[0]
    assert "update projects" in sql
    assert "revision_count = revision_count + 1" in sql
    assert args == (TENANT_ID, PROJECT_ID)

    assert db.audits[-1]["agent_name"] == "project_manager"
    assert db.audits[-1]["action"] == "revision_created"
    assert db.audits[-1]["status"] == "success"
    assert db.audits[-1]["entity_type"] == "project"
    assert db.audits[-1]["entity_id"] == PROJECT_ID


@pytest.mark.asyncio
async def test_create_revision_unknown_project_raises_and_writes_nothing() -> None:
    db = FakeDB(has_project=False)

    with pytest.raises(ValueError):
        await create_revision(db, TENANT_ID, PROJECT_ID, None, "nope")

    assert db.revisions == []
    assert db.updates == []
    assert db.audits == []

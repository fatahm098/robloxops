"""Least-loaded designer routing tests (offline, shape-routing FakeDB)."""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

import pytest

from app.routing import SELECT_DESIGNER_SQL, pick_designer

TENANT_ID = uuid4()


class FakeDB:
    """Returns a scripted ``fetchval`` result and records every call."""

    def __init__(self, result: Any) -> None:
        self.result = result
        self.calls: list[tuple[Any, str, tuple[Any, ...]]] = []

    async def fetchval(self, tenant_id: UUID, sql: str, *args: Any) -> Any:
        assert tenant_id == TENANT_ID, "unscoped tenant_id"
        self.calls.append((tenant_id, sql, args))
        return self.result


@pytest.mark.asyncio
async def test_pick_designer_returns_fetched_assignee() -> None:
    designer_id = uuid4()
    db = FakeDB(designer_id)

    result = await pick_designer(db, TENANT_ID)

    assert result == designer_id
    assert db.calls[0][0] == TENANT_ID
    assert db.calls[0][2] == (TENANT_ID,)


@pytest.mark.asyncio
async def test_pick_designer_returns_none_when_no_assignee() -> None:
    db = FakeDB(None)

    result = await pick_designer(db, TENANT_ID)

    assert result is None
    assert all(call[0] == TENANT_ID for call in db.calls)


def test_designer_sql_is_tenant_scoped_and_ordered_by_open_tasks() -> None:
    sql = " ".join(SELECT_DESIGNER_SQL.split()).lower()

    assert "from users" in sql
    assert "tenant_id = $1" in sql
    assert "role in ('designer', 'manager')" in sql
    assert "left join tasks" in sql
    assert "t.status <> 'done'" in sql
    assert "order by count(t.id) asc" in sql
    assert "created_at asc" in sql
    assert "limit 1" in sql

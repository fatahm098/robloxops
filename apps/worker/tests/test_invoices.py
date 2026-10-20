"""Invoice tests using the fake-DB pattern from test_reports.py.

The fake enforces tenant-scoped calls, ``INV-####`` numbering and the
one-non-void-invoice-per-project rule, so unscoped or duplicate-writing code
fails loudly.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

import pytest

from app.invoices import (
    create_invoice,
    list_invoices,
    mark_invoice_paid,
    next_invoice_number,
)

TENANT_ID = uuid4()
OTHER_TENANT_ID = uuid4()
PROJECT_ID = uuid4()
PROJECT_2_ID = uuid4()


def _norm(sql: str) -> str:
    return " ".join(sql.split()).lower()


class FakeDB:
    """Routes queries by shape; asserts every call is tenant-scoped."""

    def __init__(self) -> None:
        self.projects: dict[UUID, dict[str, Any]] = {
            PROJECT_ID: {"id": PROJECT_ID, "price_robux": 1000, "price_usd": None},
            PROJECT_2_ID: {"id": PROJECT_2_ID, "price_robux": 500, "price_usd": None},
        }
        self.invoices: list[dict[str, Any]] = []
        self.audits: list[dict[str, Any]] = []
        self.calls: list[tuple[Any, str]] = []

    def _assert_tenant(self, tenant_id: UUID) -> None:
        assert tenant_id == TENANT_ID, "unscoped tenant_id"

    async def fetchval(self, tenant_id: UUID, sql: str, *args: Any) -> Any:
        self._assert_tenant(tenant_id)
        self.calls.append((tenant_id, _norm(sql)))
        s = _norm(sql)
        if "count(*) + 1" in s:
            return f"INV-{sum(1 for row in self.invoices if row['tenant_id'] == tenant_id) + 1:04d}"
        raise AssertionError(f"unexpected fetchval: {s}")

    async def fetchrow(self, tenant_id: UUID, sql: str, *args: Any) -> Any:
        self._assert_tenant(tenant_id)
        s = _norm(sql)
        self.calls.append((tenant_id, s))
        if "update invoices" in s:
            _, invoice_id = args
            row = next((r for r in self.invoices if r["id"] == invoice_id), None)
            if row is None or row["status"] == "void":
                return None
            row["status"] = "paid"
            row["paid_at"] = "2026-10-19T12:00:00Z"
            return dict(row)
        if "from projects" in s:
            _, project_id = args
            project = self.projects.get(project_id)
            return dict(project) if project is not None else None
        if "from invoices" in s:
            _, project_id = args
            rows = [
                row
                for row in self.invoices
                if row["tenant_id"] == tenant_id
                and row["project_id"] == project_id
                and row["status"] != "void"
            ]
            return dict(rows[-1]) if rows else None
        if "insert into invoices" in s:
            (
                _,
                project_id,
                number,
                amount_robux,
                rate,
                amount_usd,
            ) = args
            row = {
                "id": uuid4(),
                "tenant_id": tenant_id,
                "project_id": project_id,
                "number": number,
                "amount_robux": amount_robux,
                "rate_robux_per_usd": rate,
                "amount_usd": amount_usd,
                "status": "draft",
                "issued_at": "2026-10-19T00:00:00Z",
                "paid_at": None,
                "created_at": "2026-10-19T00:00:00Z",
            }
            self.invoices.append(row)
            return dict(row)
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

    async def fetch(self, tenant_id: UUID, sql: str, *args: Any) -> list[dict[str, Any]]:
        self._assert_tenant(tenant_id)
        s = _norm(sql)
        self.calls.append((tenant_id, s))
        if "from invoices" in s:
            _, *rest = args
            rows = [row for row in self.invoices if row["tenant_id"] == tenant_id]
            if "and project_id = $2" in s:
                project_id = rest[0]
                rows = [row for row in rows if row["project_id"] == project_id]
            return [dict(row) for row in rows]
        raise AssertionError(f"unexpected fetch: {s}")


@pytest.mark.asyncio
async def test_next_invoice_number_starts_at_one() -> None:
    db = FakeDB()

    assert await next_invoice_number(db, TENANT_ID) == "INV-0001"


@pytest.mark.asyncio
async def test_create_invoice_converts_robux_at_rate() -> None:
    db = FakeDB()

    invoice = await create_invoice(
        db, TENANT_ID, project_id=PROJECT_ID, rate_robux_per_usd=80
    )

    assert invoice["number"] == "INV-0001"
    assert invoice["status"] == "draft"
    assert invoice["amount_robux"] == 1000
    assert invoice["amount_usd"] == 12.5
    assert db.audits[-1]["agent_name"] == "project_manager"
    assert db.audits[-1]["action"] == "invoice_created"


@pytest.mark.asyncio
async def test_create_invoice_prefers_project_price_usd() -> None:
    db = FakeDB()
    db.projects[PROJECT_ID]["price_usd"] = Decimal("25.00")

    invoice = await create_invoice(
        db, TENANT_ID, project_id=PROJECT_ID, rate_robux_per_usd=80
    )

    assert invoice["amount_usd"] == 25.0


@pytest.mark.asyncio
async def test_create_invoice_amount_usd_override() -> None:
    db = FakeDB()

    invoice = await create_invoice(
        db,
        TENANT_ID,
        project_id=PROJECT_ID,
        rate_robux_per_usd=80,
        amount_robux=800,
        amount_usd=10.0,
    )

    assert invoice["amount_robux"] == 800
    assert invoice["amount_usd"] == 10.0


@pytest.mark.asyncio
async def test_create_invoice_dedupes_existing_non_void() -> None:
    db = FakeDB()

    first = await create_invoice(
        db, TENANT_ID, project_id=PROJECT_ID, rate_robux_per_usd=80
    )
    second = await create_invoice(
        db, TENANT_ID, project_id=PROJECT_ID, rate_robux_per_usd=80
    )

    assert first["id"] == second["id"]
    assert len(db.invoices) == 1
    assert [a["action"] for a in db.audits] == ["invoice_created"]


@pytest.mark.asyncio
async def test_create_invoice_unknown_project_raises() -> None:
    db = FakeDB()

    with pytest.raises(ValueError):
        await create_invoice(
            db, TENANT_ID, project_id=uuid4(), rate_robux_per_usd=80
        )


@pytest.mark.asyncio
async def test_mark_invoice_paid_sets_status_and_audits() -> None:
    db = FakeDB()
    invoice = await create_invoice(
        db, TENANT_ID, project_id=PROJECT_ID, rate_robux_per_usd=80
    )

    paid = await mark_invoice_paid(db, TENANT_ID, invoice["id"])

    assert paid is not None
    assert paid["status"] == "paid"
    assert paid["paid_at"] is not None
    assert db.audits[-1]["action"] == "invoice_paid"
    assert db.audits[-1]["entity_type"] == "invoice"

    assert await mark_invoice_paid(db, TENANT_ID, uuid4()) is None


@pytest.mark.asyncio
async def test_list_invoices_filters_by_project_and_limit() -> None:
    db = FakeDB()
    await create_invoice(db, TENANT_ID, project_id=PROJECT_ID, rate_robux_per_usd=80)
    await create_invoice(db, TENANT_ID, project_id=PROJECT_2_ID, rate_robux_per_usd=80)

    all_rows = await list_invoices(db, TENANT_ID)
    assert len(all_rows) == 2

    filtered = await list_invoices(db, TENANT_ID, project_id=PROJECT_2_ID)
    assert [row["project_id"] for row in filtered] == [PROJECT_2_ID]


@pytest.mark.asyncio
async def test_invoice_queries_are_tenant_scoped() -> None:
    db = FakeDB()
    await create_invoice(db, TENANT_ID, project_id=PROJECT_ID, rate_robux_per_usd=80)
    await list_invoices(db, TENANT_ID)

    assert db.calls
    assert all(tenant_id == TENANT_ID for tenant_id, _ in db.calls)
    assert all(row["tenant_id"] == TENANT_ID for row in db.invoices)

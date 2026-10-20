"""Invoice generation and payment marking.

The worker connects with the service role, which bypasses RLS, so every query
here filters on ``tenant_id`` (see ``app/db.py``). Invoices are simple: one
draft per project, numbered ``INV-0001`` per tenant, converted from Robux to
USD with a caller-supplied rate.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any
from uuid import UUID

from app.db import require_tenant_id
from app.handlers import log_audit

AGENT_NAME = "project_manager"

NEXT_NUMBER_SQL = """
select 'INV-' || lpad((count(*) + 1)::text, 4, '0') from invoices where tenant_id = $1
"""

PROJECT_SQL = """
SELECT id, price_robux, price_usd
FROM projects
WHERE tenant_id = $1 AND id = $2
"""

EXISTING_SQL = """
SELECT id, tenant_id, project_id, number, amount_robux, rate_robux_per_usd,
       amount_usd, status, issued_at, paid_at, created_at
FROM invoices
WHERE tenant_id = $1 AND project_id = $2 AND status <> 'void'
ORDER BY created_at DESC
LIMIT 1
"""

INSERT_SQL = """
INSERT INTO invoices (
    tenant_id, project_id, number, amount_robux, rate_robux_per_usd,
    amount_usd, status
)
VALUES ($1, $2, $3, $4, $5, $6, 'draft')
RETURNING id, tenant_id, project_id, number, amount_robux, rate_robux_per_usd,
          amount_usd, status, issued_at, paid_at, created_at
"""

PAID_SQL = """
UPDATE invoices
SET status = 'paid', paid_at = now()
WHERE tenant_id = $1 AND id = $2 AND status <> 'void'
RETURNING id, tenant_id, project_id, number, amount_robux, rate_robux_per_usd,
          amount_usd, status, issued_at, paid_at, created_at
"""

LIST_SQL = """
SELECT id, tenant_id, project_id, number, amount_robux, rate_robux_per_usd,
       amount_usd, status, issued_at, paid_at, created_at
FROM invoices
WHERE tenant_id = $1
"""


def _as_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


async def next_invoice_number(db: Any, tenant_id: UUID) -> str:
    """Return the next ``INV-####`` number for the tenant."""
    require_tenant_id(tenant_id)
    number = await db.fetchval(tenant_id, NEXT_NUMBER_SQL, tenant_id)
    return str(number)


async def create_invoice(
    db: Any,
    tenant_id: UUID,
    *,
    project_id: UUID,
    rate_robux_per_usd: float,
    amount_robux: int | None = None,
    amount_usd: float | None = None,
) -> dict[str, Any]:
    """Create (or return) the draft invoice for a project.

    ``amount_usd`` wins when supplied; otherwise the project's ``price_usd`` is
    used; otherwise it is derived from Robux at ``rate_robux_per_usd`` (rounded
    to cents). A non-void invoice already on the project is returned unchanged,
    so retries never create duplicates. Raises ``ValueError`` for an unknown or
    foreign project.
    """
    require_tenant_id(tenant_id)

    project = await db.fetchrow(tenant_id, PROJECT_SQL, tenant_id, project_id)
    if project is None:
        raise ValueError(f"unknown project {project_id}")

    existing = await db.fetchrow(tenant_id, EXISTING_SQL, tenant_id, project_id)
    if existing is not None:
        return dict(existing)

    effective_robux = amount_robux
    if effective_robux is None and project["price_robux"] is not None:
        effective_robux = int(project["price_robux"])

    if amount_usd is not None:
        computed_usd: float | None = _as_float(amount_usd)
    elif project["price_usd"] is not None:
        computed_usd = _as_float(project["price_usd"])
    elif effective_robux is not None:
        computed_usd = round(effective_robux / rate_robux_per_usd, 2)
    else:
        computed_usd = None

    number = await next_invoice_number(db, tenant_id)
    row = await db.fetchrow(
        tenant_id,
        INSERT_SQL,
        tenant_id,
        project_id,
        number,
        effective_robux,
        rate_robux_per_usd,
        computed_usd,
    )
    stored = dict(row)

    await log_audit(
        db,
        tenant_id,
        agent_name=AGENT_NAME,
        action="invoice_created",
        entity_type="project",
        entity_id=project_id,
        input_summary=f"number={stored['number']} rate={rate_robux_per_usd}",
        output_summary=f"invoice_id={stored['id']} amount_usd={stored['amount_usd']}",
    )
    return stored


async def mark_invoice_paid(
    db: Any, tenant_id: UUID, invoice_id: UUID
) -> dict[str, Any] | None:
    """Mark a non-void invoice paid. Returns None when no invoice matched."""
    require_tenant_id(tenant_id)
    row = await db.fetchrow(tenant_id, PAID_SQL, tenant_id, invoice_id)
    if row is None:
        return None
    stored = dict(row)
    await log_audit(
        db,
        tenant_id,
        agent_name=AGENT_NAME,
        action="invoice_paid",
        entity_type="invoice",
        entity_id=invoice_id,
        input_summary=f"number={stored['number']}",
        output_summary=f"amount_usd={stored['amount_usd']}",
    )
    return stored


async def list_invoices(
    db: Any,
    tenant_id: UUID,
    *,
    project_id: UUID | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """List the tenant's invoices, newest first, optionally for one project."""
    require_tenant_id(tenant_id)
    sql = LIST_SQL
    args: list[Any] = [tenant_id]
    if project_id is not None:
        sql += " AND project_id = $2"
        args.append(project_id)
    sql += f" ORDER BY created_at DESC LIMIT ${len(args) + 1}"
    args.append(limit)
    rows = await db.fetch(tenant_id, sql, *args)
    return [dict(row) for row in rows]

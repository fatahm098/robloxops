"""Follow-up persistence.

The worker connects with the service role, which bypasses RLS, so every query
here filters on ``tenant_id`` (see ``app/db.py``).
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from app.db import require_tenant_id
from app.handlers import log_audit

FollowUpKind = Literal["nudge", "report", "reminder"]
FollowUpStatus = Literal["pending", "sent", "failed", "skipped"]

RECORD_SQL = """
INSERT INTO followups (
    tenant_id, project_id, customer_id, kind, channel, status, due_at, sent_at, payload
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
RETURNING id, status
"""

LIST_DUE_SQL = """
SELECT id, project_id, customer_id, kind, channel, status, due_at, sent_at, payload, created_at
FROM followups
WHERE tenant_id = $1 AND status = 'pending'
ORDER BY due_at ASC NULLS LAST, created_at ASC
LIMIT $2
"""


async def record_followup(
    db: Any,
    tenant_id: UUID,
    *,
    kind: FollowUpKind = "nudge",
    project_id: UUID | None = None,
    customer_id: UUID | None = None,
    channel: str | None = None,
    status: FollowUpStatus = "pending",
    due_at: datetime | None = None,
    sent_at: datetime | None = None,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Persist one follow-up row and return ``{id, status}``."""
    require_tenant_id(tenant_id)
    row = await db.fetchrow(
        tenant_id,
        RECORD_SQL,
        tenant_id,
        project_id,
        customer_id,
        kind,
        channel,
        status,
        due_at,
        sent_at,
        json.dumps(payload or {}),
    )
    return dict(row)


async def list_due_followups(
    db: Any,
    tenant_id: UUID,
    *,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Return pending follow-ups for a tenant, oldest due date first."""
    require_tenant_id(tenant_id)
    rows = await db.fetch(tenant_id, LIST_DUE_SQL, tenant_id, limit)
    return [dict(row) for row in rows]


async def run_followup(
    db: Any,
    tenant_id: UUID,
    *,
    kind: FollowUpKind = "nudge",
    project_id: UUID | None = None,
    customer_id: UUID | None = None,
    channel: str | None = None,
    status: FollowUpStatus = "pending",
    due_at: datetime | None = None,
    sent_at: datetime | None = None,
    payload: dict[str, Any] | None = None,
    model_used: str | None = None,
) -> dict[str, Any]:
    """Persist a follow-up and write the matching ``project_manager`` audit row."""
    row = await record_followup(
        db,
        tenant_id,
        kind=kind,
        project_id=project_id,
        customer_id=customer_id,
        channel=channel,
        status=status,
        due_at=due_at,
        sent_at=sent_at,
        payload=payload,
    )
    entity_type = "project" if project_id is not None else "customer"
    entity_id = project_id if project_id is not None else customer_id
    await log_audit(
        db,
        tenant_id,
        agent_name="project_manager",
        action="followup_sent",
        entity_type=entity_type,
        entity_id=entity_id,
        input_summary=f"kind={kind} status={status}",
        output_summary=f"followup_id={row['id']} status={row['status']}",
        model_used=model_used,
    )
    return row

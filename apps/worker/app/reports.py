"""Report persistence.

The worker connects with the service role, which bypasses RLS, so every query
here filters on ``tenant_id`` (see ``app/db.py``). One row per
``(tenant_id, project_id, kind)`` — regenerating replaces the previous content.
"""

from __future__ import annotations

import json
from typing import Any, Literal
from uuid import UUID

from app.db import require_tenant_id
from app.handlers import log_audit

ReportKind = Literal["delivery", "qa", "summary"]

PERSIST_SQL = """
INSERT INTO reports (tenant_id, project_id, kind, content_md, payload)
VALUES ($1, $2, $3, $4, $5::jsonb)
ON CONFLICT (tenant_id, project_id, kind)
DO UPDATE SET content_md = excluded.content_md,
              payload = excluded.payload,
              updated_at = now()
RETURNING id, created_at, updated_at
"""


async def persist_report(
    db: Any,
    tenant_id: UUID,
    project_id: UUID,
    kind: ReportKind,
    content_md: str,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Upsert one report row and write the matching ``project_manager`` audit row.

    Returns ``{id, created_at, updated_at}``. Re-running with the same
    ``(tenant_id, project_id, kind)`` replaces ``content_md``/``payload`` in place.
    """
    require_tenant_id(tenant_id)
    row = await db.fetchrow(
        tenant_id,
        PERSIST_SQL,
        tenant_id,
        project_id,
        kind,
        content_md,
        json.dumps(payload or {}),
    )
    stored = dict(row)
    await log_audit(
        db,
        tenant_id,
        agent_name="project_manager",
        action="report_generated",
        entity_type="project",
        entity_id=project_id,
        input_summary=f"kind={kind}",
        output_summary=f"report_id={stored['id']} chars={len(content_md)}",
    )
    return stored

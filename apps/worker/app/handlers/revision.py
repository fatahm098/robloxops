"""Revision workflow: log a customer-requested change on a commission.

The worker connects with the service role, which bypasses RLS, so every query
here filters on ``tenant_id``.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.db import require_tenant_id
from app.handlers import log_audit

AGENT_NAME = "project_manager"

PROJECT_EXISTS_SQL = """
SELECT id FROM projects WHERE tenant_id = $1 AND id = $2
"""

REVISION_INSERT_SQL = """
INSERT INTO revisions (tenant_id, project_id, requested_by, reason)
VALUES ($1, $2, $3, $4)
RETURNING id, project_id, requested_by, reason, status, created_at, resolved_at
"""

PROJECT_STATUS_SQL = """
UPDATE projects
SET status = 'revision',
    revision_count = revision_count + 1,
    updated_at = NOW()
WHERE tenant_id = $1 AND id = $2
"""


async def create_revision(
    db: Any,
    tenant_id: UUID,
    project_id: UUID,
    requested_by: str | None,
    reason: str,
) -> dict[str, Any]:
    """Record a revision request and move the project into the revision status.

    Raises ``ValueError`` when the project does not belong to the tenant.
    """
    require_tenant_id(tenant_id)

    project = await db.fetchrow(tenant_id, PROJECT_EXISTS_SQL, tenant_id, project_id)
    if project is None:
        raise ValueError(f"unknown project {project_id}")

    row = await db.fetchrow(
        tenant_id,
        REVISION_INSERT_SQL,
        tenant_id,
        project_id,
        requested_by,
        reason,
    )
    await db.execute(tenant_id, PROJECT_STATUS_SQL, tenant_id, project_id)

    await log_audit(
        db,
        tenant_id,
        agent_name=AGENT_NAME,
        action="revision_created",
        status="success",
        entity_type="project",
        entity_id=project_id,
        input_summary=f"requested_by={requested_by or 'unknown'}",
        output_summary=reason,
    )

    return dict(row)

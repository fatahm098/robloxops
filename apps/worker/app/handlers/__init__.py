"""Shared handler helpers: audit logging and escalation."""

from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

import asyncpg

from app.db import require_tenant_id

AuditStatus = Literal["success", "failure", "escalated"]

AUDIT_SQL = """
INSERT INTO agent_audit_log (
    tenant_id, agent_name, action, entity_type, entity_id,
    input_summary, output_summary, model_used, status, error_message
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING id
"""

INBOUND_SQL = """
INSERT INTO conversations (
    tenant_id, project_id, customer_id, discord_channel_id, discord_message_id,
    direction, content, author_discord_id, sent_by_agent
)
VALUES ($1, $2, $3, $4, $5, 'inbound', $6, $7, FALSE)
ON CONFLICT DO NOTHING
RETURNING id
"""


def summarize(value: Any, limit: int = 200) -> str:
    """Collapse whitespace and truncate. Never pass raw customer text here."""
    text = " ".join(str(value or "").split())
    return text[:limit]


async def log_audit(
    db: Any,
    tenant_id: UUID,
    *,
    agent_name: str,
    action: str,
    status: AuditStatus = "success",
    entity_type: str | None = None,
    entity_id: UUID | None = None,
    input_summary: str = "",
    output_summary: str = "",
    model_used: str | None = None,
    error_message: str | None = None,
) -> None:
    require_tenant_id(tenant_id)
    await db.fetchrow(
        tenant_id,
        AUDIT_SQL,
        tenant_id,
        agent_name,
        action,
        entity_type,
        entity_id,
        summarize(input_summary),
        summarize(output_summary, limit=500),
        model_used,
        status,
        summarize(error_message, limit=1000) if error_message else None,
    )


async def log_inbound(
    db: Any,
    tenant_id: UUID,
    *,
    project_id: UUID | None,
    customer_id: UUID | None,
    channel_id: str,
    message_id: str,
    content: str,
    author_id: str,
) -> UUID | None:
    """Insert an inbound message; returns None when the message is a duplicate."""
    require_tenant_id(tenant_id)
    try:
        return await db.fetchval(
            tenant_id,
            INBOUND_SQL,
            tenant_id,
            project_id,
            customer_id,
            channel_id,
            message_id,
            content,
            author_id,
        )
    except asyncpg.UniqueViolationError:
        return None


async def escalate(
    db: Any,
    tenant_id: UUID,
    *,
    agent_name: str,
    action: str,
    error: str,
    entity_type: str | None = None,
    entity_id: UUID | None = None,
) -> None:
    """Record an escalation. Invalid data is never written to domain tables."""
    await log_audit(
        db,
        tenant_id,
        agent_name=agent_name,
        action=action,
        status="escalated",
        entity_type=entity_type,
        entity_id=entity_id,
        error_message=error,
    )

"""Outbound Discord messages: queue, human approval, delivery and audit.

The worker uses the service role and bypasses RLS, so every query here filters
on ``tenant_id`` (see ``app/db.py``). ``deliver`` never raises on a Discord
failure: the row is marked ``failed`` and an audit row is written instead.

Public helpers (imported by the API and future agents):
    queue_outbound, default_body, deliver, send_or_queue,
    approve_outbound, reject_outbound, send_manual_reply
"""

from __future__ import annotations

from typing import Any, Literal

from app.db import json_dict, require_tenant_id
from app.discord import DiscordSendError, send_message
from app.handlers import is_ai_paused, log_audit, summarize
from app.models import sanitize_inbound_text

OutboundKind = Literal[
    "deliverable", "brief", "status", "first_message", "followup", "manual"
]
OutboundStatus = Literal["pending", "sent", "rejected", "failed"]

AGENT_NAME = "communication_agent"

PROJECT_SQL = """
SELECT id, reference_code, title, status, discord_thread_id, customer_id
FROM projects
WHERE tenant_id = $1 AND id = $2
"""

QUEUE_SQL = """
INSERT INTO outbound_messages (
    tenant_id, project_id, channel_id, kind, body, status
)
VALUES ($1, $2, $3, $4, $5, 'pending')
RETURNING id, tenant_id, project_id, channel_id, kind, body, status,
          approved_by, sent_at, external_message_id, error, created_at
"""

FETCH_OUTBOUND_SQL = """
SELECT id, tenant_id, project_id, channel_id, kind, body, status,
       approved_by, sent_at, external_message_id, error, created_at
FROM outbound_messages
WHERE tenant_id = $1 AND id = $2
"""

SENT_SQL = """
UPDATE outbound_messages
SET status = 'sent', sent_at = NOW(), external_message_id = $3, error = NULL
WHERE tenant_id = $1 AND id = $2
RETURNING id, status, sent_at, external_message_id
"""

FAILED_SQL = """
UPDATE outbound_messages
SET status = 'failed', error = $3
WHERE tenant_id = $1 AND id = $2
RETURNING id, status, sent_at, external_message_id, error
"""

APPROVE_SQL = """
UPDATE outbound_messages
SET approved_by = $3
WHERE tenant_id = $1 AND id = $2 AND status = 'pending'
RETURNING id, tenant_id, project_id, channel_id, kind, body, status,
          approved_by, sent_at, external_message_id, error, created_at
"""

REJECT_SQL = """
UPDATE outbound_messages
SET status = 'rejected', approved_by = $3
WHERE tenant_id = $1 AND id = $2
RETURNING id, tenant_id, project_id, channel_id, kind, body, status,
          approved_by, sent_at, external_message_id, error, created_at
"""

CONVERSATION_SQL = """
INSERT INTO conversations (
    tenant_id, project_id, customer_id, discord_channel_id, discord_message_id,
    direction, content, sent_by_agent, agent_id
)
VALUES ($1, $2, $3, $4, $5, 'outbound', $6, $7, $8)
ON CONFLICT DO NOTHING
RETURNING id
"""


async def queue_outbound(
    db: Any,
    tenant_id: Any,
    *,
    project_id: Any,
    channel_id: str,
    kind: OutboundKind,
    body: str,
    created_by: str | None = None,
) -> dict[str, Any]:
    """Insert a ``pending`` outbound message and return the full row.

    ``created_by`` is accepted for callers that track the requester; the table
    records the approver in ``approved_by`` at decision time.
    """
    require_tenant_id(tenant_id)
    row = await db.fetchrow(
        tenant_id,
        QUEUE_SQL,
        tenant_id,
        project_id,
        channel_id,
        kind,
        body,
    )
    return dict(row)


def default_body(kind: OutboundKind, project: dict[str, Any]) -> str:
    """Deterministic, LLM-free message templates."""
    ref = project.get("reference_code") or "your project"
    title = project.get("title") or "Untitled"
    status = project.get("status") or "unknown"

    if kind == "deliverable":
        return f"Preview ready for {ref} — {title}. Reply here with any changes."
    if kind == "brief":
        return f"Here's the captured brief for {ref} — {title}. Tell us if anything is missing."
    if kind == "status":
        return f"Update on {ref} — {title}: status is now {status}."
    if kind in ("first_message", "followup"):
        return f"Quick update on {ref} — {title}."
    if kind == "manual":
        raise ValueError("manual messages require explicit content")
    raise ValueError(f"unsupported outbound kind: {kind}")


async def deliver(
    db: Any,
    tenant_id: Any,
    row: dict[str, Any],
    *,
    client: Any = None,
) -> dict[str, Any]:
    """Send one queued row and record the delivery, conversation and audit rows.

    Discord failures are swallowed: the row becomes ``failed`` and is returned.
    """
    require_tenant_id(tenant_id)
    outbound_id = row["id"]
    kind = row.get("kind") or "manual"
    project_id = row.get("project_id")
    body = row.get("body") or ""
    is_manual = kind == "manual"

    try:
        sent = await send_message(row["channel_id"], body, client=client)
    except DiscordSendError as exc:
        error = summarize(exc, limit=500)
        failed = await db.fetchrow(tenant_id, FAILED_SQL, tenant_id, outbound_id, error)
        result = dict(failed) if failed is not None else dict(row)
        result["status"] = "failed"
        result["error"] = error
        await log_audit(
            db,
            tenant_id,
            agent_name=AGENT_NAME,
            action="message_failed",
            status="failure",
            entity_type="project",
            entity_id=project_id,
            input_summary=f"outbound_id={outbound_id} kind={kind}",
            output_summary=f"outbound_id={outbound_id}",
            error_message=error,
        )
        return result

    external_id = str(sent.get("id") or "")
    sent_row = await db.fetchrow(
        tenant_id, SENT_SQL, tenant_id, outbound_id, external_id
    )
    result = dict(sent_row) if sent_row is not None else dict(row)
    result["status"] = "sent"
    result["external_message_id"] = external_id

    customer_id = None
    if project_id is not None:
        project = await db.fetchrow(
            tenant_id, PROJECT_SQL, tenant_id, project_id
        )
        if project is not None:
            customer_id = project.get("customer_id")

    await db.fetchrow(
        tenant_id,
        CONVERSATION_SQL,
        tenant_id,
        project_id,
        customer_id,
        row["channel_id"],
        external_id,
        body,
        not is_manual,
        "human" if is_manual else AGENT_NAME,
    )

    await log_audit(
        db,
        tenant_id,
        agent_name=AGENT_NAME,
        action="message_sent",
        status="success",
        entity_type="project",
        entity_id=project_id,
        input_summary=f"outbound_id={outbound_id} kind={kind}",
        output_summary=f"outbound_id={outbound_id} message_id={external_id}",
    )
    return result


async def send_or_queue(
    db: Any,
    tenant_id: Any,
    *,
    project_id: Any,
    kind: OutboundKind,
    body: str | None = None,
    tenant: dict[str, Any] | None = None,
    client: Any = None,
    force_auto: bool = False,
) -> dict[str, Any]:
    """Send now or queue for approval according to tenant settings.

    Returns one of ``{"status": "sent"|"failed"|"pending_approval", "outbound": row}``
    or ``{"status": "skipped", "detail": ...}``.
    """
    require_tenant_id(tenant_id)
    project = await db.fetchrow(tenant_id, PROJECT_SQL, tenant_id, project_id)
    if project is None:
        raise ValueError("unknown project")

    channel_id = project.get("discord_thread_id")
    if not channel_id:
        return {"status": "skipped", "detail": "project has no discord thread"}

    if tenant is None:
        tenant = await db.fetch_tenant(tenant_id)

    if not force_auto and kind != "manual" and is_ai_paused(tenant or {}):
        await log_audit(
            db,
            tenant_id,
            agent_name=AGENT_NAME,
            action="ai_paused",
            status="escalated",
            entity_type="project",
            entity_id=project_id,
            input_summary=f"kind={kind}",
            output_summary="skipped",
        )
        return {"status": "skipped", "detail": "ai_paused"}

    approval_mode = json_dict((tenant or {}).get("settings")).get("approval_mode", "auto")
    if not force_auto and kind != "manual" and approval_mode in ("preview", "human"):
        row = await queue_outbound(
            db,
            tenant_id,
            project_id=project_id,
            channel_id=channel_id,
            kind=kind,
            body=body if body is not None else default_body(kind, project),
        )
        await log_audit(
            db,
            tenant_id,
            agent_name=AGENT_NAME,
            action="awaiting_approval",
            status="success",
            entity_type="project",
            entity_id=project_id,
            input_summary=f"outbound_id={row['id']} kind={kind}",
            output_summary="pending",
        )
        return {"status": "pending_approval", "outbound": row}

    resolved_body = body if body is not None else default_body(kind, project)
    row = await queue_outbound(
        db,
        tenant_id,
        project_id=project_id,
        channel_id=channel_id,
        kind=kind,
        body=resolved_body,
    )
    delivered = await deliver(db, tenant_id, row, client=client)
    return {
        "status": "sent" if delivered.get("status") == "sent" else "failed",
        "outbound": delivered,
    }


async def approve_outbound(
    db: Any,
    tenant_id: Any,
    outbound_id: Any,
    *,
    approver: str | None = None,
    client: Any = None,
) -> dict[str, Any]:
    """Approve and immediately deliver a pending message."""
    require_tenant_id(tenant_id)
    row = await db.fetchrow(tenant_id, FETCH_OUTBOUND_SQL, tenant_id, outbound_id)
    if row is None:
        return {"status": "skipped", "detail": "unknown outbound message"}
    if row.get("status") != "pending":
        result = dict(row)
        result["detail"] = f"outbound is {row.get('status')}"
        return result

    updated = await db.fetchrow(
        tenant_id, APPROVE_SQL, tenant_id, outbound_id, approver
    )
    approved = dict(updated) if updated is not None else dict(row)
    approved["approved_by"] = approver
    return await deliver(db, tenant_id, approved, client=client)


async def reject_outbound(
    db: Any,
    tenant_id: Any,
    outbound_id: Any,
    *,
    approver: str | None = None,
) -> dict[str, Any]:
    """Mark a pending message rejected without sending it."""
    require_tenant_id(tenant_id)
    row = await db.fetchrow(tenant_id, FETCH_OUTBOUND_SQL, tenant_id, outbound_id)
    if row is None:
        return {"status": "skipped", "detail": "unknown outbound message"}
    if row.get("status") != "pending":
        result = dict(row)
        result["detail"] = f"outbound is {row.get('status')}"
        return result

    updated = await db.fetchrow(
        tenant_id, REJECT_SQL, tenant_id, outbound_id, approver
    )
    result = dict(updated) if updated is not None else dict(row)
    if result.get("status") != "rejected":
        result["status"] = "rejected"
    result["approved_by"] = approver

    await log_audit(
        db,
        tenant_id,
        agent_name=AGENT_NAME,
        action="message_rejected",
        status="success",
        entity_type="project",
        entity_id=result.get("project_id"),
        input_summary=f"outbound_id={outbound_id} approver={approver or 'unknown'}",
        output_summary="rejected",
    )
    return result


async def send_manual_reply(
    db: Any,
    tenant_id: Any,
    *,
    project_id: Any,
    content: str,
    author: str | None = None,
    client: Any = None,
) -> dict[str, Any]:
    """Send a human-authored reply, bypassing pause and approval gates."""
    require_tenant_id(tenant_id)
    cleaned = sanitize_inbound_text(content or "", max_chars=4000)
    if not cleaned:
        raise ValueError("content must not be empty")

    result = await send_or_queue(
        db,
        tenant_id,
        project_id=project_id,
        kind="manual",
        body=cleaned,
        client=client,
        force_auto=True,
    )
    if result.get("status") == "sent" and author:
        await log_audit(
            db,
            tenant_id,
            agent_name=AGENT_NAME,
            action="manual_reply",
            status="success",
            entity_type="project",
            entity_id=project_id,
            input_summary=f"author={summarize(author, limit=100)}",
            output_summary=f"outbound_id={(result.get('outbound') or {}).get('id')}",
        )
    return result

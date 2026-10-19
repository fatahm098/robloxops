"""Follow-up persistence.

The worker connects with the service role, which bypasses RLS, so every query
here filters on ``tenant_id`` (see ``app/db.py``).
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from app.db import json_dict, require_tenant_id
from app.discord import DiscordSendError, send_message
from app.handlers import log_audit

logger = logging.getLogger("robloxops.followups")

FOLLOWUP_AGENT = "followup_agent"
MAX_SENT_PER_PROJECT = 3
RATE_LIMIT_WINDOW_HOURS = 24
DEFAULT_MESSAGE = "Quick check-in on {reference} - anything you'd like to update?"

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

SENT_RECENT_SQL = f"""
SELECT count(*)
FROM followups
WHERE tenant_id = $1
  AND project_id IS NOT DISTINCT FROM $2
  AND status = 'sent'
  AND sent_at >= NOW() - interval '{RATE_LIMIT_WINDOW_HOURS} hours'
"""

SENT_TOTAL_SQL = """
SELECT count(*)
FROM followups
WHERE tenant_id = $1
  AND project_id IS NOT DISTINCT FROM $2
  AND status = 'sent'
"""

PROJECT_CHANNEL_SQL = """
SELECT id, customer_id, discord_thread_id
FROM projects
WHERE tenant_id = $1 AND id = $2
"""

MARK_SENT_SQL = """
UPDATE followups
SET status = 'sent', sent_at = NOW()
WHERE tenant_id = $1 AND id = $2
RETURNING id, status, sent_at, project_id, customer_id, channel
"""

MARK_SKIPPED_SQL = """
UPDATE followups
SET status = 'skipped'
WHERE tenant_id = $1 AND id = $2
RETURNING id, status, sent_at, project_id, customer_id, channel
"""

CONVERSATION_SQL = """
INSERT INTO conversations (
    tenant_id, project_id, customer_id, discord_channel_id, discord_message_id,
    direction, content, sent_by_agent, agent_id
)
VALUES ($1, $2, $3, $4, $5, 'outbound', $6, TRUE, $7)
ON CONFLICT DO NOTHING
RETURNING id
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


async def send_followup(
    db: Any,
    tenant_id: UUID,
    row: dict[str, Any],
    *,
    client: Any = None,
) -> dict[str, Any]:
    """Send one pending follow-up, enforcing the per-project limits.

    Limits are checked BEFORE any HTTP call:

    * max one sent follow-up per project in the last 24 hours -> ``rate_limited``
      (the row is left untouched);
    * max three sent follow-ups per project in total -> the row is marked
      ``skipped`` and an escalation audit is written.

    Discord failures leave the row ``pending`` so the next sweep can retry. This
    helper never raises: every failure is audited and returned as a status dict.
    """
    require_tenant_id(tenant_id)
    payload = json_dict(row.get("payload"))
    project_id = row.get("project_id")
    customer_id = row.get("customer_id")
    entity_type = "project" if project_id is not None else "customer"
    entity_id = project_id if project_id is not None else customer_id

    try:
        channel = row.get("channel")
        project: dict[str, Any] | None = None
        if project_id is not None:
            fetched = await db.fetchrow(
                tenant_id, PROJECT_CHANNEL_SQL, tenant_id, project_id
            )
            project = dict(fetched) if fetched is not None else None
            if not channel and project is not None:
                channel = project.get("discord_thread_id")
            if customer_id is None and project is not None:
                customer_id = project.get("customer_id")

        if not channel:
            await db.fetchrow(
                tenant_id, MARK_SKIPPED_SQL, tenant_id, row["id"]
            )
            return {"status": "skipped", "reason": "missing_channel"}

        recent = await db.fetchval(
            tenant_id, SENT_RECENT_SQL, tenant_id, project_id
        )
        if int(recent or 0) > 0:
            return {"status": "skipped", "reason": "rate_limited"}

        total = await db.fetchval(
            tenant_id, SENT_TOTAL_SQL, tenant_id, project_id
        )
        if int(total or 0) >= MAX_SENT_PER_PROJECT:
            await db.fetchrow(
                tenant_id, MARK_SKIPPED_SQL, tenant_id, row["id"]
            )
            await log_audit(
                db,
                tenant_id,
                agent_name=FOLLOWUP_AGENT,
                action="followup_escalated",
                status="escalated",
                entity_type=entity_type,
                entity_id=entity_id,
                input_summary=f"followup_id={row['id']} sent_total={total}",
                output_summary="max follow-ups reached; human review required",
            )
            return {"status": "escalated"}

        message = payload.get("message")
        if not isinstance(message, str) or not message.strip():
            reference = payload.get("reference_code") or "your project"
            message = DEFAULT_MESSAGE.format(reference=reference)

        sent = await send_message(str(channel), message, client=client)
        message_id = str(sent.get("id") or "")

        await db.fetchrow(
            tenant_id, MARK_SENT_SQL, tenant_id, row["id"]
        )
        await db.fetchrow(
            tenant_id,
            CONVERSATION_SQL,
            tenant_id,
            project_id,
            customer_id,
            str(channel),
            message_id,
            message,
            FOLLOWUP_AGENT,
        )
        await log_audit(
            db,
            tenant_id,
            agent_name=FOLLOWUP_AGENT,
            action="followup_sent",
            entity_type=entity_type,
            entity_id=entity_id,
            input_summary=f"followup_id={row['id']} kind={row.get('kind')}",
            output_summary=f"followup_id={row['id']} message_id={message_id}",
        )
        return {"status": "sent", "message_id": message_id}
    except DiscordSendError as exc:
        error = str(exc)
        logger.warning("follow-up %s send failed: %s", row.get("id"), error)
        await log_audit(
            db,
            tenant_id,
            agent_name=FOLLOWUP_AGENT,
            action="followup_failed",
            status="failure",
            entity_type=entity_type,
            entity_id=entity_id,
            input_summary=f"followup_id={row.get('id')}",
            output_summary="row left pending",
            error_message=error,
        )
        return {"status": "failed"}
    except Exception as exc:  # noqa: BLE001 - a sweep must never die on one row
        logger.exception("follow-up %s crashed", row.get("id"))
        try:
            await log_audit(
                db,
                tenant_id,
                agent_name=FOLLOWUP_AGENT,
                action="followup_failed",
                status="failure",
                entity_type=entity_type,
                entity_id=entity_id,
                input_summary=f"followup_id={row.get('id')}",
                output_summary="row left pending",
                error_message=f"{type(exc).__name__}: {exc}",
            )
        except Exception:  # noqa: BLE001 - auditing is best-effort here
            logger.exception("failed to audit follow-up failure")
        return {"status": "failed"}


async def send_due_followups(
    db: Any,
    tenant_id: UUID,
    *,
    limit: int = 20,
    client: Any = None,
) -> dict[str, int]:
    """Send every pending follow-up due for one tenant and count the outcomes."""
    require_tenant_id(tenant_id)
    rows = await list_due_followups(db, tenant_id, limit=limit)
    counts = {"sent": 0, "skipped": 0, "escalated": 0, "failed": 0}
    for row in rows:
        try:
            result = await send_followup(db, tenant_id, row, client=client)
        except Exception:  # noqa: BLE001 - one row must not stop the sweep
            logger.exception("follow-up %s crashed outside the helper", row.get("id"))
            counts["failed"] += 1
            continue
        status = result.get("status")
        if status in counts:
            counts[status] += 1
    return counts

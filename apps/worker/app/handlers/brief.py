"""M2 brief extraction: structured brief, completeness score, follow-up questions."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.db import json_dict
from app.handlers import escalate, is_ai_paused, log_audit, log_inbound
from app.llm import LLMError, LLMProtocol
from app.models import (
    BriefRefreshResult,
    ContinueRequest,
    ContinueResult,
    sanitize_inbound_text,
)

AGENT_NAME = "brief_collector"

CONVERSATION_EXISTS_SQL = """
SELECT id FROM conversations WHERE tenant_id = $1 AND discord_message_id = $2 LIMIT 1
"""

PROJECT_SQL = """
SELECT p.id, p.title, p.status, p.project_type, b.structured_data
FROM projects p
LEFT JOIN briefs b ON b.project_id = p.id AND b.tenant_id = p.tenant_id
WHERE p.tenant_id = $1 AND p.id = $2
"""

PROJECT_BY_THREAD_SQL = """
SELECT id, title, status FROM projects
WHERE tenant_id = $1 AND discord_thread_id = $2
ORDER BY created_at DESC
LIMIT 1
"""

TRANSCRIPT_SQL = """
SELECT direction, content FROM conversations
WHERE tenant_id = $1 AND project_id = $2
ORDER BY created_at ASC
LIMIT 50
"""

BRIEF_UPSERT_SQL = """
INSERT INTO briefs (tenant_id, project_id, structured_data, completeness_score, raw_conversation_summary)
VALUES ($1, $2, $3::jsonb, $4, $5)
ON CONFLICT (project_id) DO UPDATE SET
    structured_data = EXCLUDED.structured_data,
    completeness_score = EXCLUDED.completeness_score,
    raw_conversation_summary = EXCLUDED.raw_conversation_summary,
    updated_at = NOW()
"""

PROJECT_STATUS_SQL = """
UPDATE projects
SET status = CASE
        WHEN status = 'intake' THEN 'briefing'
        -- A message arriving after the customer has seen or received the work
        -- is a revision request; other active states stay put.
        WHEN status IN ('customer_review', 'delivered', 'approved') THEN 'revision'
        ELSE status
    END,
    updated_at = NOW()
WHERE tenant_id = $1 AND id = $2
"""


async def refresh_brief(
    db: Any, llm: LLMProtocol, tenant_id: UUID, project_id: UUID
) -> BriefRefreshResult | None:
    """Re-extract the brief from the conversation. Returns None when escalated."""
    project = await db.fetchrow(tenant_id, PROJECT_SQL, tenant_id, project_id)
    if project is None:
        return None

    rows = await db.fetch(tenant_id, TRANSCRIPT_SQL, tenant_id, project_id)
    transcript = "\n".join(
        f"{row['direction']}: {row['content']}" for row in rows
    ).strip()
    if not transcript:
        transcript = str(project["title"] or "")

    try:
        brief = await llm.extract_brief(
            transcript[:6000], project_type_hint=project["project_type"]
        )
    except LLMError as exc:
        await escalate(
            db,
            tenant_id,
            agent_name=AGENT_NAME,
            action="extract_brief",
            error=f"brief extraction failed: {exc}",
            entity_type="project",
            entity_id=project_id,
        )
        return None

    score = brief.completeness_score()
    await db.fetchrow(
        tenant_id,
        BRIEF_UPSERT_SQL,
        tenant_id,
        project_id,
        brief.model_dump_json(),
        score,
        transcript[:2000],
    )
    await db.execute(tenant_id, PROJECT_STATUS_SQL, tenant_id, project_id)

    return BriefRefreshResult(
        project_id=project_id,
        brief=brief,
        completeness_score=score,
        missing_fields=brief.missing_fields(),
    )


async def handle_continue(db: Any, llm: LLMProtocol, req: ContinueRequest) -> ContinueResult:
    tenant_id = req.tenant_id
    content = sanitize_inbound_text(req.content)

    existing = await db.fetchval(
        tenant_id, CONVERSATION_EXISTS_SQL, tenant_id, req.message_id
    )
    if existing:
        return ContinueResult(status="duplicate")

    tenant = await db.fetch_tenant(tenant_id)
    if tenant is None:
        raise ValueError(f"unknown tenant {tenant_id}")

    project = None
    if req.project_id is not None:
        project = await db.fetchrow(tenant_id, PROJECT_SQL, tenant_id, req.project_id)
    else:
        thread_id = req.thread_id or req.channel_id
        project = await db.fetchrow(tenant_id, PROJECT_BY_THREAD_SQL, tenant_id, thread_id)

    project_id = project["id"] if project is not None else None
    inserted = await log_inbound(
        db,
        tenant_id,
        project_id=project_id,
        customer_id=None,
        channel_id=req.channel_id,
        message_id=req.message_id,
        content=content,
        author_id=req.author_id,
    )
    if inserted is None:
        return ContinueResult(status="duplicate", project_id=project_id)

    if is_ai_paused(tenant):
        await log_audit(
            db,
            tenant_id,
            agent_name=AGENT_NAME,
            action="ai_paused",
            status="escalated",
            entity_type="project",
            entity_id=project_id,
            input_summary="ai_paused=true",
            output_summary="message recorded; no AI or Discord action taken",
        )
        return ContinueResult(status="escalated", project_id=project_id)

    if project_id is None:
        return ContinueResult(status="no_project")

    # Captured before refresh: refresh_brief may advance the status to revision.
    status_before = project["status"] if project is not None else None

    refreshed = await refresh_brief(db, llm, tenant_id, project_id)
    if refreshed is None:
        return ContinueResult(status="escalated", project_id=project_id)

    tone = str(json_dict(tenant["settings"]).get("tone", "friendly"))
    context: dict[str, Any] = {"missing_fields": refreshed.missing_fields}
    purpose = "clarification" if refreshed.missing_fields else "brief_updated"
    if status_before in ("customer_review", "delivered", "approved"):
        purpose = "revision"
    try:
        reply = await llm.draft_message(
            tenant_name=str(tenant["name"]), purpose=purpose, context=context, tone=tone
        )
    except LLMError:
        reply = "Thanks — I've updated your brief."

    return ContinueResult(
        status="processed",
        project_id=project_id,
        reply=reply,
        missing_fields=refreshed.missing_fields,
    )

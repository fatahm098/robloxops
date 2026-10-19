"""M1 intake: classify intent, upsert customer, create project + brief placeholder."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.db import json_dict
from app.handlers import escalate, log_audit, log_inbound
from app.llm import LLMError, LLMProtocol
from app.models import (
    IntakeRequest,
    IntakeResult,
    ProjectDraft,
    sanitize_inbound_text,
)

AGENT_NAME = "intake_agent"

CONVERSATION_EXISTS_SQL = """
SELECT id FROM conversations
WHERE tenant_id = $1 AND discord_message_id = $2
LIMIT 1
"""

CUSTOMER_UPSERT_SQL = """
INSERT INTO customers (tenant_id, discord_user_id, discord_username, display_name)
VALUES ($1, $2, $3, $3)
ON CONFLICT (tenant_id, discord_user_id)
DO UPDATE SET discord_username = EXCLUDED.discord_username
RETURNING id
"""

PROJECT_INSERT_SQL = """
INSERT INTO projects (
    tenant_id, customer_id, title, status, project_type, discord_thread_id
)
VALUES ($1, $2, $3, 'intake', $4, $5)
RETURNING id, reference_code
"""

BRIEF_INSERT_SQL = """
INSERT INTO briefs (tenant_id, project_id, raw_conversation_summary, structured_data, completeness_score)
VALUES ($1, $2, $3, '{}'::jsonb, 0)
ON CONFLICT (project_id) DO NOTHING
RETURNING id
"""

CONVERSATION_LINK_SQL = """
UPDATE conversations
SET project_id = $3, customer_id = $4
WHERE tenant_id = $1 AND discord_message_id = $2
"""


def _fallback_title(content: str) -> str:
    first_line = next((line.strip() for line in content.splitlines() if line.strip()), "")
    return (first_line or "Commission request")[:120]


async def handle_intake(db: Any, llm: LLMProtocol, req: IntakeRequest) -> IntakeResult:
    tenant_id = req.tenant_id
    content = sanitize_inbound_text(req.content)

    existing = await db.fetchval(
        tenant_id, CONVERSATION_EXISTS_SQL, tenant_id, req.message_id
    )
    if existing:
        return IntakeResult(status="duplicate", intent="other")

    tenant = await db.fetch_tenant(tenant_id)
    if tenant is None:
        raise ValueError(f"unknown tenant {tenant_id}")
    tenant_name = str(tenant["name"])
    tone = str(json_dict(tenant["settings"]).get("tone", "friendly"))

    try:
        intent = await llm.classify_intent(content, tenant_name=tenant_name)
    except LLMError as exc:
        await escalate(
            db,
            tenant_id,
            agent_name=AGENT_NAME,
            action="classify_intent",
            error=f"intent classification failed: {exc}",
            entity_type="conversation",
        )
        return IntakeResult(status="escalated", intent="other")

    if not intent.is_commission:
        inserted = await log_inbound(
            db,
            tenant_id,
            project_id=None,
            customer_id=None,
            channel_id=req.channel_id,
            message_id=req.message_id,
            content=content,
            author_id=req.author_id,
        )
        if inserted is None:
            return IntakeResult(status="duplicate", intent=intent.intent)
        await log_audit(
            db,
            tenant_id,
            agent_name=AGENT_NAME,
            action="classify_intent",
            entity_type="conversation",
            entity_id=inserted,
            input_summary=f"intent={intent.intent} confidence={intent.confidence:.2f}",
            model_used=type(llm).__name__,
        )
        return IntakeResult(status="ignored", intent=intent.intent)

    customer_id = await db.fetchval(
        tenant_id,
        CUSTOMER_UPSERT_SQL,
        tenant_id,
        req.author_id,
        req.author_name or req.author_id,
    )
    conversation_id = await log_inbound(
        db,
        tenant_id,
        project_id=None,
        customer_id=customer_id,
        channel_id=req.channel_id,
        message_id=req.message_id,
        content=content,
        author_id=req.author_id,
    )
    if conversation_id is None:
        return IntakeResult(status="duplicate", intent=intent.intent)

    draft = ProjectDraft(
        title=_fallback_title(content),
        project_type="unknown",
        customer_discord_id=req.author_id,
        customer_username=req.author_name,
    )
    project = await db.fetchrow(
        tenant_id,
        PROJECT_INSERT_SQL,
        tenant_id,
        customer_id,
        draft.title,
        None if draft.project_type == "unknown" else draft.project_type,
        req.thread_id,
    )
    project_id = project["id"]
    reference_code = project["reference_code"]

    await db.fetchrow(tenant_id, BRIEF_INSERT_SQL, tenant_id, project_id, content[:1000])
    await db.execute(
        tenant_id, CONVERSATION_LINK_SQL, tenant_id, req.message_id, project_id, customer_id
    )
    await log_audit(
        db,
        tenant_id,
        agent_name=AGENT_NAME,
        action="create_project_from_intake",
        entity_type="project",
        entity_id=project_id,
        input_summary=f"intent={intent.intent} confidence={intent.confidence:.2f}",
        output_summary=f"reference={reference_code}",
        model_used=type(llm).__name__,
    )

    try:
        reply = await llm.draft_message(
            tenant_name=tenant_name,
            purpose="intake_confirmation",
            context={"reference_code": reference_code},
            tone=tone,
        )
    except LLMError:
        reply = f"Thanks! Your commission is logged as {reference_code}."

    return IntakeResult(
        status="created",
        intent=intent.intent,
        customer_id=customer_id,
        project_id=project_id,
        reference_code=reference_code,
        reply=reply,
    )

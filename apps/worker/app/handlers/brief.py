"""M2 brief extraction: structured brief, completeness score, follow-up questions."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from app.db import json_dict
from app.email import send_email
from app.handlers import escalate, is_ai_paused, log_audit, log_inbound
from app.llm import LLMError, LLMProtocol
from app.notifications import notify_user
from app.models import (
    BriefRefreshResult,
    ContinueRequest,
    ContinueResult,
    sanitize_inbound_text,
)
from app.routing import pick_designer

AGENT_NAME = "brief_collector"

logger = logging.getLogger("robloxops.worker")

CONVERSATION_EXISTS_SQL = """
SELECT id FROM conversations WHERE tenant_id = $1 AND discord_message_id = $2 LIMIT 1
"""

PROJECT_SQL = """
SELECT p.id, p.title, p.status, p.project_type, p.human_takeover, p.reference_code,
       p.deadline, p.price_robux, p.price_usd, p.assigned_designer_id, b.structured_data
FROM projects p
LEFT JOIN briefs b ON b.project_id = p.id AND b.tenant_id = p.tenant_id
WHERE p.tenant_id = $1 AND p.id = $2
"""

PROJECT_BY_THREAD_SQL = """
SELECT id, title, status, project_type, human_takeover, reference_code,
       deadline, price_robux, price_usd, assigned_designer_id
FROM projects
WHERE tenant_id = $1 AND discord_thread_id = $2
ORDER BY created_at DESC
LIMIT 1
"""

REVISION_INSERT_SQL = """
INSERT INTO revisions (tenant_id, project_id, requested_by, reason)
VALUES ($1, $2, $3, $4)
RETURNING id
"""

PROJECT_APPROVE_SQL = """
UPDATE projects
SET status = 'approved',
    updated_at = NOW()
WHERE tenant_id = $1 AND id = $2
"""

PROJECT_REVISION_SQL = """
UPDATE projects
SET status = 'revision',
    revision_count = revision_count + 1,
    updated_at = NOW()
WHERE tenant_id = $1 AND id = $2
"""

TASKS_BY_PROJECT_SQL = """
SELECT id, title, status, due_at
FROM tasks
WHERE tenant_id = $1 AND project_id = $2
ORDER BY created_at DESC
LIMIT 1
"""

TASK_PROGRESS_SQL = """
UPDATE tasks
SET status = 'in_progress',
    updated_at = NOW()
WHERE tenant_id = $1 AND project_id = $2
"""

INVOICE_LATEST_SQL = """
SELECT number, amount_robux, amount_usd, status
FROM invoices
WHERE tenant_id = $1 AND project_id = $2
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

ENSURE_TASK_SQL = """
INSERT INTO tasks (tenant_id, project_id, assigned_to, title, status, priority)
SELECT $1, $2, $3, $4, 'pending', 0
WHERE NOT EXISTS (
    SELECT 1 FROM tasks WHERE tenant_id = $1 AND project_id = $2
)
RETURNING id
"""

ASSIGNEE_EMAIL_SQL = """
SELECT email FROM users
WHERE tenant_id = $1 AND id = $2
"""


async def ensure_design_task(
    db: Any, tenant_id: UUID, project_id: UUID, title: str, assigned_to: Any
) -> Any | None:
    """Idempotently create the single design task for a project; returns its id."""
    return await db.fetchval(
        tenant_id, ENSURE_TASK_SQL, tenant_id, project_id, assigned_to, title
    )


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

    result = BriefRefreshResult(
        project_id=project_id,
        brief=brief,
        completeness_score=score,
        missing_fields=brief.missing_fields(),
    )

    try:
        assigned_to = await pick_designer(db, tenant_id)
        title = (brief.title or str(project["title"] or "")).strip() or "New commission"
        task_id = await ensure_design_task(
            db, tenant_id, project_id, title, assigned_to
        )
        if task_id is not None and assigned_to is not None:
            await _notify_assignment(
                db,
                tenant_id,
                project_id=project_id,
                user_id=assigned_to,
                project_title=str(project["title"] or title),
                task_title=title,
            )
    except Exception:
        logger.exception("brief routing failed for project %s", project_id)

    return result


async def _notify_assignment(
    db: Any,
    tenant_id: UUID,
    *,
    project_id: UUID,
    user_id: Any,
    project_title: str,
    task_title: str,
) -> None:
    """Best-effort in-app + email notification for a freshly assigned task.

    Each step is isolated so a missing email row or unavailable mail provider
    never prevents the other notification from being written.
    """
    try:
        await notify_user(
            db,
            tenant_id,
            user_id=user_id,
            kind="task_assigned",
            title=f"New design task: {task_title}",
            body=f"You were assigned {project_title}.",
            project_id=project_id,
        )
    except Exception:  # noqa: BLE001 - notification is best-effort
        logger.exception("task notification failed for project %s", project_id)

    try:
        email = await db.fetchval(
            tenant_id, ASSIGNEE_EMAIL_SQL, tenant_id, user_id
        )
        if email:
            await send_email(
                db,
                tenant_id,
                to=str(email),
                subject=f"New design task: {task_title}",
                text=(
                    "You have been assigned a new design task on RobloxOps.\n\n"
                    f"Project: {project_title}\n"
                    f"Task: {task_title}\n"
                ),
            )
    except Exception:  # noqa: BLE001 - notification is best-effort
        logger.exception("task assignment email failed for project %s", project_id)


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

    if project is not None and project["human_takeover"]:
        return ContinueResult(status="human_takeover", project_id=project_id)

    if project_id is None:
        return ContinueResult(status="no_project")

    # Captured before refresh: refresh_brief or revision may advance the status.
    status_before = str(project["status"] or "intake") if project is not None else None
    ref_code = str(project.get("reference_code") or "your project") if project is not None else "your project"
    tenant_name = str(tenant["name"])
    tone = str(json_dict(tenant["settings"]).get("tone", "friendly"))

    # 1. Classify the customer's intent in this ongoing conversation
    thread_intent = await llm.classify_thread_intent(
        content,
        tenant_name=tenant_name,
        project_status=status_before,
        context={"project": dict(project) if project is not None else {}},
    )

    if thread_intent.intent == "status_inquiry" and status_before not in ("intake", "briefing"):
        task = None
        try:
            task = await db.fetchrow(tenant_id, TASKS_BY_PROJECT_SQL, tenant_id, project_id)
        except Exception:
            pass
        context = {
            "reference_code": ref_code,
            "project_status": status_before,
            "deadline": project.get("deadline") if project else None,
            "task_status": task.get("status") if task else "in_progress",
        }
        try:
            reply = await llm.draft_message(
                tenant_name=tenant_name, purpose="status_update", context=context, tone=tone
            )
        except LLMError:
            reply = f"Hi! {ref_code} is currently {status_before}. Our team is working on it and we will update you soon!"

        await log_audit(
            db,
            tenant_id,
            agent_name="communication_agent",
            action="status_inquiry_replied",
            status="success",
            entity_type="project",
            entity_id=project_id,
            input_summary=content[:200],
            output_summary=reply[:200],
        )
        return ContinueResult(
            status="processed",
            project_id=project_id,
            reply=reply,
            intent="status_inquiry",
        )

    if thread_intent.intent == "approval":
        try:
            await db.execute(tenant_id, PROJECT_APPROVE_SQL, tenant_id, project_id)
        except Exception as exc:
            logger.warning("failed to update project status to approved: %s", exc)

        context = {"reference_code": ref_code}
        try:
            reply = await llm.draft_message(
                tenant_name=tenant_name, purpose="approval_confirmed", context=context, tone=tone
            )
        except LLMError:
            reply = f"Awesome! Thank you for approving {ref_code}. We are finalizing the delivery package for you now."

        await log_audit(
            db,
            tenant_id,
            agent_name="project_manager",
            action="project_approved",
            status="success",
            entity_type="project",
            entity_id=project_id,
            input_summary=content[:200],
            output_summary=reply[:200],
        )

        designer_id = project.get("assigned_designer_id") if project else None
        if designer_id:
            try:
                await notify_user(
                    db,
                    tenant_id,
                    user_id=designer_id,
                    kind="project_approved",
                    title=f"Project approved: {ref_code}",
                    body="The customer has approved the design preview.",
                    project_id=project_id,
                )
            except Exception:
                pass

        return ContinueResult(
            status="processed",
            project_id=project_id,
            reply=reply,
            intent="approval",
        )

    if thread_intent.intent == "revision_request":
        reason = thread_intent.details or content
        try:
            await db.fetchrow(
                tenant_id,
                REVISION_INSERT_SQL,
                tenant_id,
                project_id,
                req.author_name or "customer",
                reason[:500],
            )
            await db.execute(tenant_id, PROJECT_REVISION_SQL, tenant_id, project_id)
            await db.execute(tenant_id, TASK_PROGRESS_SQL, tenant_id, project_id)
        except Exception as exc:
            logger.warning("revision recording failed: %s", exc)

        context = {"reference_code": ref_code, "reason": reason}
        try:
            reply = await llm.draft_message(
                tenant_name=tenant_name, purpose="revision", context=context, tone=tone
            )
        except LLMError:
            reply = f"Thanks for the revision notes on {ref_code} — I've passed them to the designer."

        await log_audit(
            db,
            tenant_id,
            agent_name="project_manager",
            action="revision_created",
            status="success",
            entity_type="project",
            entity_id=project_id,
            input_summary=content[:200],
            output_summary=reply[:200],
        )

        designer_id = project.get("assigned_designer_id") if project else None
        if designer_id:
            try:
                await notify_user(
                    db,
                    tenant_id,
                    user_id=designer_id,
                    kind="revision_requested",
                    title=f"Revision requested: {ref_code}",
                    body=reason[:200],
                    project_id=project_id,
                )
            except Exception:
                pass

        return ContinueResult(
            status="processed",
            project_id=project_id,
            reply=reply,
            intent="revision_request",
        )

    if thread_intent.intent == "payment_inquiry":
        settings_dict = json_dict(tenant["settings"])
        instructions = (
            settings_dict.get("payment_instructions")
            or settings_dict.get("robux_instructions")
            or "You can pay via our Roblox Group Funds or Gamepass link."
        )
        invoice = None
        try:
            invoice = await db.fetchrow(tenant_id, INVOICE_LATEST_SQL, tenant_id, project_id)
        except Exception:
            pass

        price_robux = project.get("price_robux") if project else None
        price_usd = project.get("price_usd") if project else None
        if invoice:
            price_robux = price_robux or invoice.get("amount_robux")
            price_usd = price_usd or invoice.get("amount_usd")

        context = {
            "reference_code": ref_code,
            "amount_robux": price_robux,
            "amount_usd": price_usd,
            "payment_instructions": instructions,
        }
        try:
            reply = await llm.draft_message(
                tenant_name=tenant_name, purpose="payment_info", context=context, tone=tone
            )
        except LLMError:
            reply = f"Payment details for {ref_code}: {instructions}"

        await log_audit(
            db,
            tenant_id,
            agent_name="communication_agent",
            action="payment_inquiry_replied",
            status="success",
            entity_type="project",
            entity_id=project_id,
            input_summary=content[:200],
            output_summary=reply[:200],
        )
        return ContinueResult(
            status="processed",
            project_id=project_id,
            reply=reply,
            intent="payment_inquiry",
        )

    # Otherwise default to brief extraction / refresh
    refreshed = await refresh_brief(db, llm, tenant_id, project_id)
    if refreshed is None:
        return ContinueResult(status="escalated", project_id=project_id)

    reply = ""
    # In intake/briefing stage, prefer using conversational orchestrator (Lexi)
    # so customer gets a natural, multi-turn Indonesian chat that answers questions like 'apa artinya?'
    if status_before in ("intake", "briefing"):
        try:
            from app.orchestrator.graph import process_customer_turn
            session_thread_id = str(req.thread_id or project_id)
            orch_state = process_customer_turn(
                message=content,
                customer_name=req.author_name or "Kak",
                discord_user_id=session_thread_id,
                tenant_id=str(tenant_id),
            )
            reply = orch_state.get("reply_to_customer") or ""
        except Exception as exc:
            logger.warning("orchestrator turn in brief continue failed: %s", exc)

    if not reply:
        context = {
            "customer_message": content,
            "missing_fields": refreshed.missing_fields,
            "reference_code": ref_code,
        }
        purpose = "clarification" if refreshed.missing_fields else "brief_updated"
        if status_before in ("customer_review", "delivered", "approved"):
            purpose = "revision"
        try:
            reply = await llm.draft_message(
                tenant_name=tenant_name, purpose=purpose, context=context, tone=tone
            )
        except LLMError:
            reply = f"Halo Kak! Catatan untuk {ref_code} sudah kami perbarui ya. Ada lagi detail yang ingin ditambahkan?"

    return ContinueResult(
        status="processed",
        project_id=project_id,
        reply=reply,
        missing_fields=refreshed.missing_fields,
        intent="brief_update",
    )

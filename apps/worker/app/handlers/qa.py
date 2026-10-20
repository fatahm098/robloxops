"""P2 QA: compare a deliverable against the brief and store the checklist."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from app.db import json_dict
from app.handlers import escalate, is_ai_paused, log_audit
from app.llm import LLMError, LLMProtocol
from app.models import QAReport

logger = logging.getLogger("robloxops.qa")

AGENT_NAME = "qa_agent"
PASS_THRESHOLD = 80
HANDLED_SEND_STATUSES = {"sent", "pending_approval"}

DELIVERABLE_SQL = """
SELECT d.id, d.project_id, d.file_path, d.file_type, d.sent_to_customer_at,
       p.title, b.structured_data
FROM deliverables d
JOIN projects p ON p.id = d.project_id AND p.tenant_id = d.tenant_id
LEFT JOIN briefs b ON b.project_id = d.project_id AND b.tenant_id = d.tenant_id
WHERE d.tenant_id = $1 AND d.id = $2
"""

QA_UPDATE_SQL = """
UPDATE deliverables
SET qa_status = $3, qa_report = $4::jsonb
WHERE tenant_id = $1 AND id = $2
"""

SENT_TO_CUSTOMER_SQL = """
UPDATE deliverables
SET sent_to_customer_at = NOW()
WHERE tenant_id = $1 AND id = $2 AND sent_to_customer_at IS NULL
"""


async def _send_preview_if_passed(
    db: Any,
    tenant_id: UUID,
    *,
    deliverable_id: UUID,
    project_id: Any,
    sent_to_customer_at: Any,
) -> None:
    """Best-effort: push the customer preview through the outbound pipeline.

    Never raises: QA must stay green even if outbound/tenant lookup fails.
    ``sent_to_customer_at`` is only set for ``sent``/``pending_approval`` so a
    ``skipped``/``failed`` result can be retried on a later pass.
    """
    if sent_to_customer_at is not None:
        return
    try:
        tenant = await db.fetch_tenant(tenant_id)
        if tenant is None or is_ai_paused(tenant):
            return

        from app.outbound import send_or_queue

        result = await send_or_queue(
            db,
            tenant_id,
            project_id=project_id,
            kind="deliverable",
            tenant=tenant,
        )
        if result.get("status") not in HANDLED_SEND_STATUSES:
            return
        await db.execute(
            tenant_id, SENT_TO_CUSTOMER_SQL, tenant_id, deliverable_id
        )
    except Exception:  # noqa: BLE001 - auto-send must never break QA
        logger.exception(
            "auto-send deliverable preview failed tenant=%s deliverable=%s",
            tenant_id,
            deliverable_id,
        )


async def run_qa(
    db: Any, llm: LLMProtocol, tenant_id: UUID, deliverable_id: UUID
) -> QAReport | None:
    """Run the checklist. Returns None (and escalates) if the LLM output is invalid."""
    row = await db.fetchrow(tenant_id, DELIVERABLE_SQL, tenant_id, deliverable_id)
    if row is None:
        raise ValueError(f"unknown deliverable {deliverable_id}")

    brief = json_dict(row["structured_data"])
    file_path = row["file_path"]
    deliverable = {
        "file_path": file_path,
        "file_type": row["file_type"],
        "project_title": row["title"],
    }
    # Vision QA only runs when a genuinely reachable URL is available. Storage
    # paths are private bucket keys that need a signed URL the worker cannot
    # mint here, so we only forward file_path when it already is a URL.
    if isinstance(file_path, str) and file_path.startswith(("http://", "https://")):
        deliverable["url"] = file_path

    try:
        report = await llm.qa_check(brief, deliverable)
    except LLMError as exc:
        await escalate(
            db,
            tenant_id,
            agent_name=AGENT_NAME,
            action="qa_check",
            error=f"QA validation failed: {exc}",
            entity_type="deliverable",
            entity_id=deliverable_id,
        )
        return None

    qa_status = "passed" if report.score >= PASS_THRESHOLD else "failed"
    await db.execute(
        tenant_id,
        QA_UPDATE_SQL,
        tenant_id,
        deliverable_id,
        qa_status,
        report.model_dump_json(),
    )
    await log_audit(
        db,
        tenant_id,
        agent_name=AGENT_NAME,
        action="qa_check",
        entity_type="deliverable",
        entity_id=deliverable_id,
        input_summary=f"brief_fields={len(brief)} deliverable={row['file_type']}",
        output_summary=f"score={report.score} status={qa_status}",
        model_used=type(llm).__name__,
    )
    if qa_status == "passed":
        await _send_preview_if_passed(
            db,
            tenant_id,
            deliverable_id=deliverable_id,
            project_id=row["project_id"],
            sent_to_customer_at=row["sent_to_customer_at"],
        )
    return report

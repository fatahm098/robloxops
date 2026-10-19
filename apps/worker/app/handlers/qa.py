"""P2 QA: compare a deliverable against the brief and store the checklist."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.db import json_dict
from app.handlers import escalate, log_audit
from app.llm import LLMError, LLMProtocol
from app.models import QAReport

AGENT_NAME = "qa_agent"
PASS_THRESHOLD = 80

DELIVERABLE_SQL = """
SELECT d.id, d.project_id, d.file_path, d.file_type, p.title, b.structured_data
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


async def run_qa(
    db: Any, llm: LLMProtocol, tenant_id: UUID, deliverable_id: UUID
) -> QAReport | None:
    """Run the checklist. Returns None (and escalates) if the LLM output is invalid."""
    row = await db.fetchrow(tenant_id, DELIVERABLE_SQL, tenant_id, deliverable_id)
    if row is None:
        raise ValueError(f"unknown deliverable {deliverable_id}")

    brief = json_dict(row["structured_data"])
    deliverable = {
        "file_path": row["file_path"],
        "file_type": row["file_type"],
        "project_title": row["title"],
    }

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
    return report

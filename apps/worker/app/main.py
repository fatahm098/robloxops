"""FastAPI entrypoint for the RobloxOps AI worker (internal API only)."""

from __future__ import annotations

import logging
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, AsyncIterator

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Request, status

from app.config import get_settings
from app.db import Database, json_dict
from app.followups import run_followup
from app.handlers import log_audit
from app.handlers.brief import handle_continue
from app.handlers.intake import handle_intake
from app.handlers.qa import run_qa
from app.handlers.revision import create_revision
from app.llm import LLMError, LLMProtocol, get_llm as build_llm
from app.reports import persist_report
from app.models import (
    ContinueRequest,
    ContinueResult,
    FollowUpDraft,
    FollowUpRequest,
    IntakeRequest,
    IntakeResult,
    QARequest,
    ReportRequest,
    ReportResult,
    RevisionCreateRequest,
)

logger = logging.getLogger("robloxops.worker")

FOLLOWUP_SQL = """
SELECT id, reference_code, title, status, updated_at
FROM projects
WHERE tenant_id = $1
  AND status IN ('brief_review', 'customer_review', 'revision')
  AND updated_at < NOW() - ($2 || ' hours')::interval
ORDER BY updated_at ASC
LIMIT $3
"""

REPORT_SQL = """
SELECT p.id, p.reference_code, p.title, p.status, p.price_robux, p.price_usd,
       c.discord_username, b.structured_data
FROM projects p
JOIN customers c ON c.id = p.customer_id AND c.tenant_id = p.tenant_id
LEFT JOIN briefs b ON b.project_id = p.id AND b.tenant_id = p.tenant_id
WHERE p.tenant_id = $1 AND p.id = $2
"""


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    logging.basicConfig(
        level=settings.log_level.upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    db: Database | None = None
    if settings.database_url:
        db = await Database.connect(settings.database_url)
        logger.info("connected to postgres")
    else:
        logger.warning("DATABASE_URL is empty — endpoints that touch the DB will return 503")

    app.state.db = db
    app.state.llm = build_llm(settings)
    logger.info("llm backend: %s", type(app.state.llm).__name__)
    try:
        yield
    finally:
        if db is not None:
            await db.close()


app = FastAPI(title="RobloxOps AI Worker", version="0.1.0", lifespan=lifespan)


async def require_internal_token(authorization: str | None = Header(default=None)) -> None:
    expected = get_settings().internal_worker_token
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="INTERNAL_WORKER_TOKEN is not configured",
        )
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not secrets.compare_digest(token, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid internal token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_db(request: Request) -> Database:
    db: Database | None = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="database unavailable"
        )
    return db


def get_llm(request: Request) -> LLMProtocol:
    return request.app.state.llm


router = APIRouter(dependencies=[Depends(require_internal_token)])


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "llm": type(app.state.llm).__name__ if hasattr(app.state, "llm") else "uninitialised",
        "db": "connected" if getattr(app.state, "db", None) is not None else "disabled",
    }


@router.post("/intake", response_model=IntakeResult)
async def intake(
    body: IntakeRequest,
    db: Database = Depends(get_db),
    llm: LLMProtocol = Depends(get_llm),
) -> IntakeResult:
    try:
        return await handle_intake(db, llm, body)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/conversation/continue", response_model=ContinueResult)
async def conversation_continue(
    body: ContinueRequest,
    db: Database = Depends(get_db),
    llm: LLMProtocol = Depends(get_llm),
) -> ContinueResult:
    try:
        return await handle_continue(db, llm, body)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/qa/check")
async def qa_check(
    body: QARequest,
    db: Database = Depends(get_db),
    llm: LLMProtocol = Depends(get_llm),
) -> dict[str, Any]:
    try:
        report = await run_qa(db, llm, body.tenant_id, body.deliverable_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if report is None:
        return {"status": "escalated", "report": None}
    return {"status": "ok", "report": report.model_dump()}

@router.post("/followup/run")
async def followup_run(
    body: FollowUpRequest,
    db: Database = Depends(get_db),
    llm: LLMProtocol = Depends(get_llm),
) -> dict[str, Any]:
    tenant = await db.fetch_tenant(body.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="unknown tenant")

    rows = await db.fetch(
        body.tenant_id,
        FOLLOWUP_SQL,
        body.tenant_id,
        str(body.min_hours),
        body.limit,
    )
    now = datetime.now(timezone.utc)
    drafts: list[FollowUpDraft] = []
    for row in rows:
        hours = max(0, int((now - row["updated_at"]).total_seconds() // 3600))
        try:
            message = await llm.draft_message(
                tenant_name=str(tenant["name"]),
                purpose="followup",
                context={
                    "reference_code": row["reference_code"],
                    "title": row["title"],
                    "hours_since_update": hours,
                },
            )
        except LLMError:
            message = f"Quick check-in on {row['reference_code']} — anything you'd like to update?"
        followup = await run_followup(
            db,
            body.tenant_id,
            kind="nudge",
            project_id=row["id"],
            status="pending",
            payload={
                "reference_code": row["reference_code"],
                "message": message,
                "hours_since_update": hours,
            },
            model_used=type(llm).__name__,
        )
        drafts.append(
            FollowUpDraft(
                project_id=row["id"],
                reference_code=row["reference_code"],
                message=message,
                hours_since_update=hours,
                followup_id=followup["id"],
            )
        )

    await log_audit(
        db,
        body.tenant_id,
        agent_name="followup_agent",
        action="followup_run",
        output_summary=f"drafts={len(drafts)} min_hours={body.min_hours}",
        model_used=type(llm).__name__,
    )
    return {"status": "ok", "drafts": [draft.model_dump() for draft in drafts]}


@router.post("/report/generate", response_model=ReportResult)
async def report_generate(
    body: ReportRequest,
    db: Database = Depends(get_db),
    llm: LLMProtocol = Depends(get_llm),
) -> ReportResult:
    row = await db.fetchrow(body.tenant_id, REPORT_SQL, body.tenant_id, body.project_id)
    if row is None:
        raise HTTPException(status_code=404, detail="unknown project")

    project = {
        "reference_code": row["reference_code"],
        "title": row["title"],
        "status": row["status"],
        "price_robux": row["price_robux"],
        "price_usd": float(row["price_usd"]) if row["price_usd"] is not None else None,
        "customer": row["discord_username"],
    }
    try:
        markdown = await llm.draft_report(project, json_dict(row["structured_data"]))
    except LLMError as exc:
        raise HTTPException(status_code=502, detail="report generation failed") from exc
    await log_audit(
        db,
        body.tenant_id,
        agent_name="reporting_agent",
        action="generate_report",
        entity_type="project",
        entity_id=body.project_id,
        input_summary=f"reference={row['reference_code']}",
        output_summary=f"chars={len(markdown)}",
        model_used=type(llm).__name__,
    )

    report_id = None
    if body.project_id is not None:
        stored = await persist_report(
            db,
            body.tenant_id,
            body.project_id,
            body.kind,
            markdown,
            payload={
                "reference_code": row["reference_code"],
                "status": row["status"],
                "model_used": type(llm).__name__,
            },
        )
        report_id = stored["id"]

    return ReportResult(
        project_id=body.project_id,
        reference_code=row["reference_code"],
        markdown=markdown,
        report_id=report_id,
    )


@router.post("/revision/create")
async def revision_create(
    body: RevisionCreateRequest,
    db: Database = Depends(get_db),
) -> dict[str, Any]:
    try:
        return await create_revision(
            db,
            body.tenant_id,
            body.project_id,
            body.requested_by,
            body.reason,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


app.include_router(router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8080)

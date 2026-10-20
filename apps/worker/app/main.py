"""FastAPI entrypoint for the RobloxOps AI worker (internal API only)."""

from __future__ import annotations

import logging
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, AsyncIterator

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Request, status

from app.config import get_settings
from app.assistant import chat as assistant_turn
from app.db import Database, json_dict
from app.followups import run_followup
from app.handlers import log_audit
from app.handlers.brief import handle_continue
from app.handlers.intake import handle_intake
from app.handlers.qa import run_qa
from app.handlers.revision import create_revision
from app.invoices import create_invoice, mark_invoice_paid
from app.llm import LLMError, LLMRateLimited, build_llm_for_tenant, get_llm
from app.outbound import (
    approve_outbound,
    reject_outbound,
    send_manual_reply,
    send_or_queue,
)
from app.reports import persist_report
from app.social import draft_for_project, publish as publish_portfolio, reject as reject_portfolio
from app.models import (
    AssistantChatRequest,
    AssistantReply,
    ContinueRequest,
    ContinueResult,
    ConversationReplyRequest,
    FollowUpDraft,
    FollowUpRequest,
    IntakeRequest,
    IntakeResult,
    InvoiceCreateRequest,
    InvoicePaidRequest,
    NotifyRequest,
    NotifyResult,
    OutboundDecisionRequest,
    PortfolioDraftRequest,
    PortfolioDraftResult,
    PortfolioPublishRequest,
    PortfolioPublishResult,
    PortfolioRejectRequest,
    PortfolioRejectResult,
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
    app.state.llm = get_llm(settings)
    logger.info("default llm backend: %s", type(app.state.llm).__name__)
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
) -> IntakeResult:
    llm = await build_llm_for_tenant(db, body.tenant_id, get_settings())
    try:
        return await handle_intake(db, llm, body)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/conversation/continue", response_model=ContinueResult)
async def conversation_continue(
    body: ContinueRequest,
    db: Database = Depends(get_db),
) -> ContinueResult:
    llm = await build_llm_for_tenant(db, body.tenant_id, get_settings())
    try:
        return await handle_continue(db, llm, body)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/qa/check")
async def qa_check(
    body: QARequest,
    db: Database = Depends(get_db),
) -> dict[str, Any]:
    llm = await build_llm_for_tenant(db, body.tenant_id, get_settings())
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
) -> dict[str, Any]:
    llm = await build_llm_for_tenant(db, body.tenant_id, get_settings())
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
) -> ReportResult:
    llm = await build_llm_for_tenant(db, body.tenant_id, get_settings())
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


@router.post("/invoice/create")
async def invoice_create(
    body: InvoiceCreateRequest,
    db: Database = Depends(get_db),
) -> dict[str, Any]:
    try:
        return await create_invoice(
            db,
            body.tenant_id,
            project_id=body.project_id,
            rate_robux_per_usd=body.rate_robux_per_usd,
            amount_robux=body.amount_robux,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/invoice/paid")
async def invoice_paid(
    body: InvoicePaidRequest,
    db: Database = Depends(get_db),
) -> dict[str, Any]:
    invoice = await mark_invoice_paid(db, body.tenant_id, body.invoice_id)
    if invoice is None:
        raise HTTPException(status_code=404, detail="unknown invoice")
    return invoice


def _notify_result(result: dict[str, Any]) -> NotifyResult:
    """Map an outbound helper result onto the public ``NotifyResult`` shape."""
    status_value = result.get("status")
    if status_value in ("sent", "pending_approval", "skipped", "failed"):
        mapped = status_value
    else:
        mapped = "skipped"
    outbound = result.get("outbound") if isinstance(result.get("outbound"), dict) else result
    outbound_id = outbound.get("id") if isinstance(outbound, dict) else None
    message_id = outbound.get("external_message_id") if isinstance(outbound, dict) else None
    return NotifyResult(
        status=mapped,
        outbound_id=outbound_id,
        message_id=message_id,
        detail=str(result.get("detail") or ""),
    )


@router.post("/notify", response_model=NotifyResult)
async def notify(
    body: NotifyRequest,
    db: Database = Depends(get_db),
) -> NotifyResult:
    try:
        result = await send_or_queue(
            db,
            body.tenant_id,
            project_id=body.project_id,
            kind=body.kind,
            body=body.message,
        )
    except ValueError as exc:
        message = str(exc)
        if body.kind == "manual" and not (body.message or "").strip():
            raise HTTPException(status_code=422, detail=message) from exc
        raise HTTPException(status_code=404, detail=message) from exc
    return _notify_result(result)


@router.post("/notify/approve", response_model=NotifyResult)
async def notify_approve(
    body: OutboundDecisionRequest,
    db: Database = Depends(get_db),
) -> NotifyResult:
    result = await approve_outbound(
        db,
        body.tenant_id,
        body.outbound_id,
        approver=body.approver,
    )
    return _notify_result(result)


@router.post("/notify/reject")
async def notify_reject(
    body: OutboundDecisionRequest,
    db: Database = Depends(get_db),
) -> dict[str, Any]:
    return await reject_outbound(
        db,
        body.tenant_id,
        body.outbound_id,
        approver=body.approver,
    )


@router.post("/conversation/reply", response_model=NotifyResult)
async def conversation_reply(
    body: ConversationReplyRequest,
    db: Database = Depends(get_db),
) -> NotifyResult:
    try:
        result = await send_manual_reply(
            db,
            body.tenant_id,
            project_id=body.project_id,
            content=body.content,
            author=body.author,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _notify_result(result)


@router.post("/assistant/chat", response_model=AssistantReply)
async def assistant_chat(
    body: AssistantChatRequest,
    db: Database = Depends(get_db),
) -> AssistantReply:
    """One assistant turn: read/write studio data through a bounded tool loop."""
    llm = await build_llm_for_tenant(db, body.tenant_id, get_settings())
    try:
        return await assistant_turn(
            db,
            llm,
            tenant_id=body.tenant_id,
            user_id=body.user_id,
            message=body.message,
            thread_id=body.thread_id,
        )
    except LLMError as exc:
        logger.warning("assistant turn failed tenant=%s: %s", body.tenant_id, exc)
        rate_limited = isinstance(exc, LLMRateLimited) or "429" in str(exc)
        detail = "assistant_rate_limited" if rate_limited else "assistant_unavailable"
        raise HTTPException(status_code=502, detail=detail) from exc


@router.post("/portfolio/draft", response_model=PortfolioDraftResult)
async def portfolio_draft(
    body: PortfolioDraftRequest,
    db: Database = Depends(get_db),
) -> PortfolioDraftResult:
    """Draft a portfolio caption for a finished project (never publishes)."""
    llm = await build_llm_for_tenant(db, body.tenant_id, get_settings())
    try:
        return await draft_for_project(
            db,
            llm,
            body.tenant_id,
            body.project_id,
            media_urls=[item.model_dump() for item in body.media],
        )
    except LLMError as exc:
        logger.warning("portfolio draft failed tenant=%s: %s", body.tenant_id, exc)
        detail = (
            "portfolio_rate_limited"
            if isinstance(exc, LLMRateLimited) or "429" in str(exc)
            else "portfolio_unavailable"
        )
        raise HTTPException(status_code=502, detail=detail) from exc


@router.post("/portfolio/publish", response_model=PortfolioPublishResult)
async def portfolio_publish(
    body: PortfolioPublishRequest,
    db: Database = Depends(get_db),
) -> PortfolioPublishResult:
    return await publish_portfolio(db, body.tenant_id, body.post_id)


@router.post("/portfolio/reject", response_model=PortfolioRejectResult)
async def portfolio_reject(
    body: PortfolioRejectRequest,
    db: Database = Depends(get_db),
) -> PortfolioRejectResult:
    result = await reject_portfolio(db, body.tenant_id, body.post_id, body.reason)
    return PortfolioRejectResult(
        status="rejected" if result.get("status") == "rejected" else "skipped",
        detail=str(result.get("detail") or ""),
    )


app.include_router(router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8080)

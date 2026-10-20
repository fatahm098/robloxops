"""Background queue consumer.

Claims jobs from the Postgres queue and dispatches them to the handlers. This is
the fallback path: the bot calls the HTTP API first and only enqueues when the
worker is unreachable, so nothing is lost during a deploy or restart.

Run with::

    python runner.py
"""

from __future__ import annotations

import asyncio
import logging
import signal
import time
from typing import Any
from uuid import UUID

from app.config import get_settings
from app.db import Database
from app.followups import send_due_followups
from app.handlers import escalate_if_ai_paused
from app.handlers.brief import handle_continue
from app.handlers.intake import handle_intake
from app.handlers.qa import run_qa
from app.llm import LLMError, build_llm_for_tenant, get_llm
from app.models import ContinueRequest, IntakeRequest, PortfolioDraftRequest
from app.queue import Job, claim_jobs, complete_job, fail_job, reap_stale_jobs
from app.social import draft_for_project

logger = logging.getLogger("robloxops.runner")

HANDLED_KINDS = {"intake", "conversation_continue", "qa_check", "portfolio_draft"}
REAP_EVERY_ITERATIONS = 30
FOLLOWUP_SWEEP_SECONDS = 900


def _payload(job: Job) -> dict[str, Any]:
    data = dict(job.payload)
    data["tenant_id"] = str(job.tenant_id)
    return data


async def dispatch(db: Database, llm: Any, job: Job) -> bool:
    """Run one job. Returns ``False`` when the kind is unsupported (already failed).

    ``llm`` is only a fallback: each job resolves the tenant's own LLM config
    (Vault key + model overrides) so tenants never share a process-wide key.
    """
    try:
        tenant_llm = await build_llm_for_tenant(db, job.tenant_id, get_settings())
    except Exception:  # noqa: BLE001 - a bad secret must not fail the job outright
        logger.exception("tenant llm resolution failed for job %s", job.id)
        tenant_llm = llm

    payload = _payload(job)
    if job.kind == "intake":
        await handle_intake(db, tenant_llm, IntakeRequest(**payload))
    elif job.kind == "conversation_continue":
        await handle_continue(db, tenant_llm, ContinueRequest(**payload))
    elif job.kind == "qa_check":
        # qa.run_qa has no ai_paused short-circuit (unlike intake/brief), so a
        # paused tenant would otherwise still run vision/LLM QA here.
        deliverable_id = UUID(str(payload["deliverable_id"]))
        if await escalate_if_ai_paused(
            db,
            job.tenant_id,
            agent_name="qa_agent",
            action="ai_paused",
            entity_type="deliverable",
            entity_id=deliverable_id,
        ):
            return True
        await run_qa(db, tenant_llm, UUID(str(job.tenant_id)), deliverable_id)
    elif job.kind == "portfolio_draft":
        request = PortfolioDraftRequest(**payload)
        await draft_for_project(
            db,
            tenant_llm,
            request.tenant_id,
            request.project_id,
            media_urls=[item.model_dump() for item in request.media],
        )
    else:
        logger.warning("unsupported job kind %r for job %s", job.kind, job.id)
        await fail_job(db.pool, job.id, f"unsupported job kind: {job.kind}")
        return False
    return True


async def run_once(db: Database, llm: Any, worker_id: str, batch: int) -> int:
    jobs = await claim_jobs(db.pool, worker_id, batch, kinds=HANDLED_KINDS)
    for job in jobs:
        try:
            handled = await dispatch(db, llm, job)
        except (LLMError, ValueError) as exc:
            logger.warning("job %s failed: %s", job.id, exc)
            await fail_job(db.pool, job.id, str(exc))
        except Exception as exc:  # noqa: BLE001 - a crash must not kill the loop
            logger.exception("job %s crashed", job.id)
            await fail_job(db.pool, job.id, f"{type(exc).__name__}: {exc}")
        else:
            if handled:
                await complete_job(db.pool, job.id)
    return len(jobs)


async def sweep_followups(db: Database, client: Any = None) -> int:
    """Send due follow-ups for every tenant. Returns the number of tenants processed.

    Best-effort: one tenant failing must not stop the sweep (or the consumer
    loop), so each tenant is isolated and its error only logged.
    """
    tenant_ids = await db.all_tenant_ids()
    processed = 0
    for tenant_id in tenant_ids:
        try:
            counts = await send_due_followups(db, tenant_id, client=client)
            processed += 1
            if any(counts.values()):
                logger.info("follow-up sweep tenant=%s %s", tenant_id, counts)
        except Exception:  # noqa: BLE001 - one tenant must not stop the sweep
            logger.exception("follow-up sweep failed for tenant %s", tenant_id)
    return processed


async def run_forever() -> None:
    settings = get_settings()
    logging.basicConfig(
        level=settings.log_level.upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    if not settings.database_url:
        raise SystemExit("DATABASE_URL is required to run the queue consumer")

    db = await Database.connect(settings.database_url)
    fallback_llm = get_llm(settings)
    worker_id = settings.worker_id or "worker-1"
    stop = asyncio.Event()

    def _shutdown(*_: Any) -> None:
        stop.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            signal.signal(sig, _shutdown)
        except (ValueError, OSError):  # not supported on this platform
            pass

    logger.info("consumer %s started (batch=%s)", worker_id, settings.worker_batch_size)

    async def _reap() -> None:
        try:
            reaped = await reap_stale_jobs(db.pool)
            if reaped:
                logger.warning("reaped %d stale running job(s)", reaped)
        except Exception:  # noqa: BLE001 - reaping must never stop the consumer
            logger.exception("stale job reap failed")

    try:
        await _reap()
        last_sweep = time.monotonic()
        try:
            await sweep_followups(db)
        except Exception:  # noqa: BLE001 - the initial sweep is best-effort
            logger.exception("initial follow-up sweep failed")
        iterations = 0
        while not stop.is_set():
            processed = await run_once(db, fallback_llm, worker_id, settings.worker_batch_size)
            iterations += 1
            if iterations % REAP_EVERY_ITERATIONS == 0:
                await _reap()
            if time.monotonic() - last_sweep >= FOLLOWUP_SWEEP_SECONDS:
                last_sweep = time.monotonic()
                try:
                    await sweep_followups(db)
                except Exception:  # noqa: BLE001 - the sweep must not stop the loop
                    logger.exception("follow-up sweep failed")
            if processed == 0:
                try:
                    await asyncio.wait_for(stop.wait(), timeout=settings.worker_poll_seconds)
                except asyncio.TimeoutError:
                    pass
    finally:
        await db.close()
        logger.info("consumer stopped")


if __name__ == "__main__":
    try:
        asyncio.run(run_forever())
    except KeyboardInterrupt:
        pass

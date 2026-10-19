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
from typing import Any
from uuid import UUID

from app.config import get_settings
from app.db import Database
from app.handlers import escalate_if_ai_paused
from app.handlers.brief import handle_continue
from app.handlers.intake import handle_intake
from app.handlers.qa import run_qa
from app.llm import LLMError, get_llm
from app.models import ContinueRequest, IntakeRequest
from app.queue import Job, claim_jobs, complete_job, fail_job, reap_stale_jobs

logger = logging.getLogger("robloxops.runner")

HANDLED_KINDS = {"intake", "conversation_continue", "qa_check"}
REAP_EVERY_ITERATIONS = 30


def _payload(job: Job) -> dict[str, Any]:
    data = dict(job.payload)
    data["tenant_id"] = str(job.tenant_id)
    return data


async def dispatch(db: Database, llm: Any, job: Job) -> bool:
    """Run one job. Returns ``False`` when the kind is unsupported (already failed)."""
    payload = _payload(job)
    if job.kind == "intake":
        await handle_intake(db, llm, IntakeRequest(**payload))
    elif job.kind == "conversation_continue":
        await handle_continue(db, llm, ContinueRequest(**payload))
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
        await run_qa(db, llm, UUID(str(job.tenant_id)), deliverable_id)
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


async def run_forever() -> None:
    settings = get_settings()
    logging.basicConfig(
        level=settings.log_level.upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    if not settings.database_url:
        raise SystemExit("DATABASE_URL is required to run the queue consumer")

    db = await Database.connect(settings.database_url)
    llm = get_llm(settings)
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
        iterations = 0
        while not stop.is_set():
            processed = await run_once(db, llm, worker_id, settings.worker_batch_size)
            iterations += 1
            if iterations % REAP_EVERY_ITERATIONS == 0:
                await _reap()
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

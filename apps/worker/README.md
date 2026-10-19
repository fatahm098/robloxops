# RobloxOps AI Worker + Discord Bot

Python 3.12 service that runs the commission workflow agents for RobloxOps:
intent classification, brief extraction, QA checklists, follow-ups and
completion reports. It is an **internal** API — every endpoint except `/health`
requires `Authorization: Bearer $INTERNAL_WORKER_TOKEN`.

## Layout

```
app/config.py          pydantic-settings (env vars)
app/db.py              asyncpg pool + tenant-scoped query helpers
app/models.py          Pydantic contracts + inbound text sanitisation
app/llm.py             OpenAI-compatible client + deterministic FakeLLM
app/queue.py           jobs table / claim_jobs / complete_job / fail_job
app/main.py            FastAPI: /intake /conversation/continue /qa/check
                                /followup/run /report/generate /health
app/handlers/intake.py M1: classify -> customer -> project + brief -> audit
app/handlers/brief.py  M2: structured brief + completeness + clarification
app/handlers/qa.py     P2: text/vision checklist against the brief
bot.py                 discord.py v2 bot (monitors channels, slash commands)
tests/                 offline unit tests (fake DB, FakeLLM)
```

## Run

```bash
cd apps/worker
python -m venv .venv
.venv/Scripts/activate          # Windows; source .venv/bin/activate on Linux
pip install -r requirements.txt

cp .env.example .env            # fill DATABASE_URL and INTERNAL_WORKER_TOKEN
uvicorn app.main:app --reload --port 8080
```

Without `LLM_API_KEY` the worker uses `FakeLLM` (deterministic, offline). Point
`LLM_BASE_URL` at any OpenAI-compatible endpoint (OpenAI, DeepSeek, vLLM).

Bot (separate process, same image):

```bash
python bot.py
```

The bot exits 0 with a clear log line when `DISCORD_BOT_TOKEN` or
`DATABASE_URL` is missing, so local dev and CI do not fail.

### Docker

```bash
docker build -t robloxops-worker apps/worker

# API
docker run --env-file apps/worker/.env -p 8080:8080 robloxops-worker

# Bot (same image, different command)
docker run --env-file apps/worker/.env robloxops-worker python bot.py
```

Deploy the two commands as separate Fly.io processes / containers; the API
container's healthcheck hits `/health`.

## Tenant isolation

The worker connects with the Supabase **service role**, which bypasses RLS.
`app/db.py` therefore refuses any query whose SQL does not mention `tenant_id`,
and `require_tenant_id` rejects falsy ids. The single exception is the tenant
lookup (`tenants.id` *is* the tenant id), isolated in `Database.fetch_tenant`.
Cross-tenant access must never be derived from request input.

## Queue contract

Postgres, **not pg-boss** (Node-only). The migration must provide:

```sql
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  kind TEXT NOT NULL,               -- intake | conversation_continue | qa | ...
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE FUNCTION claim_jobs(worker_id TEXT, batch INT) RETURNS SETOF jobs ...
CREATE FUNCTION complete_job(id UUID) RETURNS VOID ...
CREATE FUNCTION fail_job(id UUID, error TEXT) RETURNS VOID ...
```

Payload keys are snake_case (`tenant_id`, `channel_id`, `message_id`,
`author_id`, `content`, `thread_id`). `claim_jobs` returns a `SETOF jobs`;
`complete_job`/`fail_job` take the job id (and error for failures, truncated to
2000 chars). `enqueue_job` inserts directly with `tenant_id`.

## Behaviour notes

- **Idempotency:** the inbound Discord `message_id` is stored in
  `conversations`. Duplicate events return `status="duplicate"` before any LLM
  call; unique violations are caught.
- **Prompt injection:** inbound text is stripped of control characters and
  capped at 4000 chars, wrapped in `<customer_message>` tags, and the system
  prompt is fixed per tenant. All structured outputs are Pydantic-validated;
  failures write `agent_audit_log.status='escalated'` and no domain data.
- **Reference codes:** `ROB-{YY}{seq:04d}` from `tenant_counters`
  (`tenant_id`, `name='project_ref'`); if that table is absent the handler
  falls back to a per-tenant project count.
- **Bot fast path:** the bot posts the event to the worker for an immediate
  intent/reference, then enqueues the same event. The queued copy is deduped on
  `message_id`, so it is a no-op replay that covers worker downtime.
- **Monitored channels:** `tenants.settings.monitored_channel_ids` (also accepts
  `monitored_channels` or `settings.intake.channel_ids`). Threads whose parent
  is monitored are treated as continuation messages.
- **Follow-ups:** `/followup/run` returns drafted messages only; sending and the
  max-3-per-project counter belong to the caller until a `followups` table
  exists.
- **Reports:** `/report/generate` returns Markdown; persistence is the web app's
  responsibility.

## Tests

```bash
py -3 -m pytest apps/worker/tests -q
py -3 -m compileall apps/worker
```

Tests use fake DB/pool objects and `FakeLLM` — no network, no database.

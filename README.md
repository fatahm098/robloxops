# RobloxOps

AI-powered operations SaaS for Roblox design studios. A studio connects its Discord
server; the platform handles intake, brief collection, project records, the designer
queue and delivery notifications, so the designer only designs.

Planning source: `../roblox-studio-saas-plan.md`. UI reference:
`../robloxops-design/stitch_robloxops_studio_dashboard_system/`.

## Status

Milestone 1 ("bot hears and records") is implemented end-to-end in code and runs in
demo mode without credentials. The core workflow (intake, brief, QA, revisions,
follow-ups, report persistence, Discord OAuth) is wired; every dashboard surface
(overview, billing, settings, onboarding, projects filters, sidebar) now reads live
data with a demo fallback. Follow-up *sending*, email and realtime are not done yet.

| Area | State |
|---|---|
| Postgres schema, RLS, per-tenant reference codes | done |
| Postgres job queue (`claim_jobs` / `complete_job` / `fail_job`) | done |
| FastAPI worker: intake, brief, QA, follow-up, report | done (LLM optional), follow-ups/reports persist |
| Discord bot: channel monitoring, threads, slash commands (`/status` `/brief` `/revision` `/help`) | done, needs a real guild |
| Next.js dashboard: overview, projects, detail, tasks, audit, customers, deliverables, revisions, agents, analytics, billing, settings, onboarding | done |
| tRPC API + Supabase auth context + signed uploads | tRPC scaffolded but unused; uploads live |
| Stripe billing, auth UI, onboarding, agent pause | done |
| Revision workflow, follow-up/report persistence, Discord OAuth callback | done |
| Outbound Discord delivery, human-approval queue, per-project takeover | done |
| Auto task creation + least-loaded designer routing | done |
| Follow-up sending (1/24h, max 3 → escalate) + cron sweep | done |
| Dashboard live wiring (overview values, billing, settings, onboarding steps, sidebar badges, project filters) | done |
| CI (GitHub Actions: typecheck/build + pytest/compileall) | done |
| Designer notifications, payments/Robux, realtime | not started |

Current state and the prioritized remaining backlog live in
[`docs/HANDOFF.md`](docs/HANDOFF.md).

## Architecture

```
Discord ──▶ bot.py (discord.py) ──▶ jobs table ──▶ worker (FastAPI)
                                                      │
                                        Postgres (Supabase) + Storage
                                                      │
Next.js dashboard ──▶ tRPC ──▶ Supabase (RLS: tenant_id = JWT claim)
```

Three deployable units: Next.js (Vercel), worker (Fly.io), bot (Fly.io). The worker
uses the service role, so it bypasses RLS and must pass `tenant_id` explicitly on
every query — enforced by `app.db.require_tenant_id`.

`pg-boss` from the original plan was replaced by a SQL queue: pg-boss is Node-only
and the worker is Python.

## Repository layout

```
apps/web                     Next.js 15 App Router, TypeScript, Tailwind
  src/app/(dashboard)/       overview, projects, projects/[id], tasks, audit
  src/components/            shell, overview, projects, project-detail, tasks, audit
  src/lib/data.ts            single data-access seam (mock ⇄ Supabase)
  src/lib/mock.ts            demo dataset used when env vars are absent
  src/server/                tRPC context + routers
  src/lib/supabase/          browser, server, admin clients + row mappers
apps/worker                  Python 3.12 worker + Discord bot
  app/handlers/              intake, brief, qa
  app/queue.py               Postgres queue client
  runner.py                  queue consumer (fallback path when the API is down)
supabase/migrations          schema, RLS, job queue
supabase/seed.sql            demo tenant with 8 projects
docs/DATABASE.md             table map, isolation notes, verification queries
```

## Quick start (demo mode, no credentials)

```bash
npm install
npm run dev          # http://localhost:3000
```

Without `NEXT_PUBLIC_SUPABASE_URL`, every page reads from `src/lib/mock.ts`, so the
dashboard is fully navigable. Same idea in the worker: without `LLM_API_KEY` it uses
a deterministic FakeLLM.

## Supabase setup

1. Create a project, then run the migrations in order:
   `supabase db push` (or paste `0001`, `0002`, `0003` in the SQL editor).
2. Load the demo data: `supabase db reset` runs `seed.sql` automatically.
3. Copy `apps/web/.env.example` to `apps/web/.env.local` and fill:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`.
4. The JWT must carry a `tenant_id` claim. Add it with a Supabase Auth hook or a
   custom access token hook; `public.current_tenant_id()` reads it.
5. Storage bucket `deliverables`, private, path `tenants/{tenant_id}/deliverables/...`.

Verify isolation with the queries in `docs/DATABASE.md`.

## Worker setup

```bash
cd apps/worker
py -3 -m venv .venv
.venv/Scripts/pip install -r requirements.txt
cp .env.example .env        # DATABASE_URL + INTERNAL_WORKER_TOKEN at minimum
.venv/Scripts/python -m uvicorn app.main:app --port 8080
```

Bot (separate process, same env plus `DISCORD_BOT_TOKEN`):

```bash
.venv/Scripts/python bot.py
```

Queue consumer (separate process, drains the fallback queue):

```bash
.venv/Scripts/python runner.py
```

Endpoints: `POST /intake`, `/conversation/continue`, `/qa/check`, `/followup/run`,
`/report/generate`, `GET /health`. All but `/health` require
`Authorization: Bearer $INTERNAL_WORKER_TOKEN`.

Tests: `PYTHONPATH=apps/worker .venv/Scripts/python -m pytest tests -q` (82 passing,
no network, no database).

## Discord setup

1. Create an application, enable the **Message Content** privileged intent.
2. Scopes: `bot`, `applications.commands`. Permissions: View Channel, Send Messages,
   Read Message History, Use Application Commands, Manage Threads.
3. Add the bot to the studio guild; the bot maps `discord_guild_id` → tenant.
4. Channels to monitor live in `tenants.settings` (`monitored_channel_ids`).

## Environment

Web (`apps/web/.env.local`):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | enable the live data path |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only admin client |
| `INTERNAL_WORKER_TOKEN` | shared secret with the worker |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | billing (not wired yet) |

Worker (`apps/worker/.env`): `DATABASE_URL`, `INTERNAL_WORKER_TOKEN`,
`LLM_API_KEY`, `LLM_MODEL_FAST/MID/VISION`, `DISCORD_BOT_TOKEN`,
`DISCORD_WORKER_URL`.

## Features

**Dashboard**
- Overview: AI activity strip, four KPI cards, urgent deliverables table, QA preview
  card, studio stream, team allocation with load bars, Discord relay status.
- Projects: status pills with live counts, search, status/lead filters, dense table,
  pagination footer.
- Project detail: header actions (revision / download / deliver), AI brief with specs
  and palette, references, engineering directives, deliverables with engine
  validation checklist, execution timeline, Discord transcript.
- Tasks: three-column board (pending / in progress / blocked) with priority and due
  dates.
- Audit: append-only agent log with token/cost/duration columns and status filters.

**Worker agents**
- Intake: sanitize → classify intent → upsert customer → create project + brief stub
  → link conversation → audit → confirmation draft. Duplicate Discord message IDs are
  no-ops.
- Brief collector: transcript → structured brief (pydantic) → completeness score →
  clarification questions.
- QA: brief vs deliverable checklist, stored as `qa_report`, status passed/failed.
- Follow-up: stale projects → drafted nudges (respects 24h cadence in the caller).
- Reporting: completion summary markdown.

**Safety**
- RLS on every tenant table; audit table is append-only.
- Worker guards every query with `require_tenant_id`.
- Structured LLM output only; validation failures escalate, never write.
- Inbound text sanitized and capped at 4,000 characters.
- `settings.ai_paused` is checked before automated actions.

## Design system

Tokens live in `apps/web/tailwind.config.ts` and `src/app/globals.css`: canvas
`#020617`, surfaces `#0F172A` / `#1E293B`, borders `#334155`, accent `#00A2FF`,
crimson `#A21A24`. Inter for UI, JetBrains Mono for references, asset IDs and costs.
4–8px radii, 44px interactive targets, tabular numerals everywhere.

## Known gaps

See [`docs/HANDOFF.md`](docs/HANDOFF.md) for the full, prioritized list. Summary:
designer notifications (email/in-app), payments/Robux, realtime, routing the bot's
own replies through the approval path, and the unused tRPC layer. RLS policies
assume a `tenant_id` JWT claim; configure the auth hook before launch.

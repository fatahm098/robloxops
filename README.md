# RobloxOps

AI-powered operations SaaS for Roblox design studios. A studio connects its Discord
server; the platform handles intake, brief collection, project records, the designer
queue and delivery notifications, so the designer only designs.

The original product plan and UI reference live outside this repository. This
README is self-contained: everything needed to clone, run and verify the project
is here.

## Status

Milestone 1 ("bot hears and records") runs end-to-end in demo mode without
credentials. The table below describes what is implemented and exercised by the
worker test suite. Every dashboard surface renders live Supabase data when it is
configured and falls back to `src/lib/mock.ts` when it is not.

Last verified **2026-10-20**: `tsc --noEmit` clean, `next build` succeeds,
**151 worker tests pass**, **13 Playwright tests pass**, and
`npm run scan:secrets:all` reports no findings.

| Area | State |
|---|---|
| Postgres schema, RLS, per-tenant reference codes | done (18 migrations) |
| Postgres job queue (`claim_jobs` / `complete_job` / `fail_job`) | done |
| FastAPI worker: intake, brief, QA, follow-up, report, revision, invoice, notify | done (LLM optional) |
| Discord bot: channel monitoring, threads, slash commands (`/status` `/brief` `/revision` `/help`) | done, needs a real guild |
| Next.js dashboard: overview, projects, detail, tasks, audit, customers, deliverables, revisions, agents, analytics, billing, settings, onboarding, notifications, assistant, portfolio | done |
| Stripe billing (checkout, portal, webhook, per-tenant key) | done |
| Outbound Discord delivery, human-approval queue, per-project takeover | done |
| Auto task creation + least-loaded designer routing | done |
| Per-tenant API keys (Supabase Vault) + per-tenant LLM/Stripe | done |
| Designer notifications (in-app + Resend email) | done |
| In-app assistant with 9 audited tools | done |
| Portfolio drafts + X publishing behind an approval gate | done |
| Realtime dashboard refresh (`postgres_changes` → `router.refresh()`) | done |
| Browser end-to-end tests (Playwright, demo mode, 13 scenarios) | done |
| tRPC API | scaffolded but unused by the UI |
| Payments/Robux | not started |

Current state and the prioritized remaining backlog live in
[`docs/HANDOFF.md`](docs/HANDOFF.md).

## Architecture

```
Discord ──▶ bot.py (discord.py) ──▶ jobs table ──▶ worker (FastAPI)
                                                      │
                                        Postgres (Supabase) + Storage
                                                      │
Next.js dashboard ──▶ server components + server actions ──▶ Supabase
                                  (RLS: tenant_id = JWT claim)
```

Three deployable units: Next.js (Vercel), worker API + queue runner, and the bot
process. The worker uses the service role, so it bypasses RLS and must pass
`tenant_id` explicitly on every query — enforced by `app.db.require_tenant_id`.

`pg-boss` from the original plan was replaced by a SQL queue: pg-boss is Node-only
and the worker is Python.

## Repository layout

```
apps/web                     Next.js 15 App Router, TypeScript, Tailwind
  src/app/(dashboard)/       overview, projects, projects/[id], tasks, audit, customers,
                             deliverables, revisions, agents, analytics, billing,
                             settings, onboarding, notifications, assistant, portfolio
  src/components/            shell, overview, projects, project-detail, tasks, audit,
                             assistant, portfolio, settings
  src/lib/data.ts            single data-access seam (mock ⇄ Supabase)
  src/lib/mock.ts            demo dataset used when env vars are absent
  src/lib/realtime.ts        postgres_changes → debounced router.refresh()
  src/server/                tRPC context + routers (not mounted by the UI)
  src/lib/supabase/          browser, server, admin clients + row mappers
apps/worker                  Python 3.12 worker + Discord bot
  app/handlers/              intake, brief, qa, revision
  app/assistant.py            in-app chat loop with tool calling
  app/assistant_tools.py      9 allowlisted tools + argument validation
  app/social.py               portfolio drafts + X publishing (OAuth 1.0a)
  app/outbound.py             outbound queue + human-approval delivery
  app/queue.py                Postgres queue client
  runner.py                   queue consumer (fallback path when the API is down)
supabase/migrations           schema, RLS, job queue, assistant, portfolio (0001–0018)
supabase/seed.sql            demo tenant with 8 projects
docs/                        DATABASE, AUTH, BILLING, ASSISTANT, PORTFOLIO,
                             DISCORD_TESTING, SECURITY, HANDOFF
```

## Quick start (demo mode, no credentials)

```bash
npm install
npm run dev          # http://localhost:3000
npm run e2e          # Playwright, builds + starts on :3100 in demo mode
```

Without `NEXT_PUBLIC_SUPABASE_URL`, every page reads from `src/lib/mock.ts`, so the
dashboard is fully navigable. Same idea in the worker: without `LLM_API_KEY` it uses
a deterministic FakeLLM.

The Playwright suite forces the Supabase variables to empty strings, so it always
runs in demo mode — no credentials, no database. It covers the auth screens, the
overview, the project list and its filters, project detail, the revision action,
the outbound approval queue, revisions, billing and the audit log. First run needs
`npx playwright install chromium`.

## Supabase setup

1. Create a project, then apply every migration in order:
   `supabase db push` (the files are `0001` through `0018`; several later ones
   depend on earlier ones, so do not skip).
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
`/report/generate`, `/revision/create`, `/invoice/create`, `/invoice/paid`,
`/notify`, `/notify/approve`, `/notify/reject`, `/conversation/reply`,
`/assistant/chat`, `/portfolio/draft`, `/portfolio/publish`, `/portfolio/reject`,
and `GET /health`. All but `/health` require
`Authorization: Bearer $INTERNAL_WORKER_TOKEN`.

Tests: `PYTHONPATH=apps/worker .venv/Scripts/python -m pytest tests -q`
(**142 passing**, no network, no database).

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
| `INTERNAL_WORKER_URL` | worker base URL (default `http://127.0.0.1:8080`) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | billing |
| `DISCORD_CLIENT_ID` / `_SECRET` | OAuth connect flow |

Per-tenant keys (`LLM_API_KEY`, `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, the four
`X_*` credentials) are entered in **Settings → Integrations** and stored in
Supabase Vault, not in this file.

Worker (`apps/worker/.env`): `APP_ENV`, `DATABASE_URL`, `INTERNAL_WORKER_TOKEN`,
`LLM_API_KEY`, `LLM_MODEL_FAST/MID/VISION`, `DISCORD_BOT_TOKEN`,
`DISCORD_WORKER_URL`.

Only the `.env.example` templates are tracked. Every real env file is gitignored;
see [Security](#security) before you add a new variable.

## Security

Full details, threat model and rotation runbook: [`docs/SECURITY.md`](docs/SECURITY.md).

**Nothing secret is committed.** `.gitignore` blocks `.env`, `.env.*`, `*.env`,
`*.pem`, `*.key` and friends, while `!.env.example` keeps the templates tracked.
The only key allowed in the browser bundle is the Supabase anon key, because RLS
is what protects the data.

```bash
npm run scan:secrets        # tracked files — before every commit
npm run scan:secrets:all    # + full git history — before every push
```

The scanner looks for Supabase JWTs, Stripe keys, GitHub/Slack/Discord tokens,
Google/OpenAI keys, private key blocks and password-bearing Postgres DSNs. It
exits `1` on a hit, so it can gate CI. History mode catches a key that was
committed and deleted later — the case `git status` cannot see.

**Tenant isolation.** RLS is enabled on every `public` table, keyed on
`tenant_id = current_tenant_id()` (JWT claim, falling back to
`app_metadata.tenant_id`). The service role bypasses RLS, so every worker query
filters `tenant_id` explicitly and the tenant always comes from the verified
session — never from a request body or a model response.

**Worker auth.** Every endpoint except `/health` requires a bearer token compared
with `secrets.compare_digest`. With `APP_ENV=production` the worker refuses to
boot if `INTERNAL_WORKER_TOKEN` is the development default or shorter than 24
characters, or if `DATABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are empty.

**Approval gates.** Customer messages and portfolio posts are queued, not sent.
A human approves before anything leaves the studio.

**Headers.** `next.config.mjs` sets `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`, `Permissions-Policy`, a framing/plugin CSP, COOP, and HSTS in
production; `X-Powered-By` is disabled.

## Features

**Two view modes** (toggle in the topbar, persisted per browser)
- **Mode Desainer** (default): plain-language, task-first. The sidebar shows only
  Beranda, Antrian Tugas, Proyek, Upload, and Revisi; ops metrics are hidden. `/`
  lands on `/today` — a calm "what to do today" list with one clear action per
  project (revisi, cek QA, upload, dll).
- **Mode Developer**: the full studio pipeline — CRM, agents, analytics, audit,
  billing, settings, and the dense operations overview at `/`.

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

**Assistant and portfolio**
- In-app chat at `/assistant`. The model can call nine tools: `studio_overview`,
  `list_projects`, `get_project`, `list_tasks`, `create_project`,
  `update_project_status`, `create_task`, `log_revision`,
  `draft_customer_message`. No delete tools, and the tenant comes from the
  session rather than the model.
- Every tool call is written to the audit log as `tool:<name>` with summarised
  arguments, so the transcript shows what changed and why.
- `draft_customer_message` only queues an `outbound_messages` row; a human still
  approves it before anything reaches the customer.
- When a project becomes `delivered` or `approved`, the worker drafts an
  Indonesian caption from up to four image deliverables. `/portfolio` lets a
  designer edit the caption, publish to X, or reject it.
- X publishing uses OAuth 1.0a with per-tenant credentials from Supabase Vault.
  Without a connected account the post is marked `failed` with a readable reason
  instead of silently disappearing.

**Notifications**
- In-app notifications at `/notifications` when a task is assigned or a project
  changes status, plus transactional email through Resend when
  `RESEND_API_KEY` is configured (best-effort: a delivery failure never breaks
  the worker action that triggered it).

**Safety**
- RLS on every tenant table; audit table is append-only.
- Worker guards every query with `require_tenant_id`.
- Structured LLM output only; validation failures escalate, never write.
- Inbound text sanitized and capped at 4,000 characters.
- `settings.ai_paused` is checked before automated actions.
- Assistant tools are a fixed allowlist with no delete operations; every call is
  audited as `tool:<name>`.
- Outbound messages and portfolio posts require human approval before sending.
- Details: [`docs/SECURITY.md`](docs/SECURITY.md).

## Design system

Tokens live in `apps/web/tailwind.config.ts` and `src/app/globals.css`: canvas
`#020617`, surfaces `#0F172A` / `#1E293B`, borders `#334155`, accent `#00A2FF`,
crimson `#A21A24`. Inter for UI, JetBrains Mono for references, asset IDs and costs.
4–8px radii, 44px interactive targets, tabular numerals everywhere.

## Known gaps

See [`docs/HANDOFF.md`](docs/HANDOFF.md) for the full, prioritized list. Summary:

- **Payments/Robux** — `payment_status` is edited by hand; there is no rate
  tracking, invoice generation or payment follow-up agent.
- **The bot's fast-path reply bypasses the approval queue.** Worker-originated
  messages are gated; a direct reply from `bot.py` is not yet routed through
  `app/outbound.py`.
- **tRPC is scaffolded but unused.** The UI uses server components and server
  actions; `src/server/routers` is only reachable via `/api/trpc`.
- **Realtime requires the `supabase_realtime` publication** (migration `0015`).
  Without it the dashboard still works but only updates on navigation.
- **Deployment is not automated.** There is a Dockerfile for the worker; the web
  app has no deployment config in the repo.

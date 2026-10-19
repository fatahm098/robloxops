# AGENTS.md — RobloxOps

Guide for AI coding agents working in this repository. Read `docs/HANDOFF.md`
before starting: it has the current state and the prioritized remaining backlog.

## What this is

Multi-tenant B2B SaaS for Roblox design studios. A studio links a Discord server;
the platform handles commission intake, brief collection, project records, the
designer queue and delivery notifications. Planning doc lives at
`../roblox-studio-saas-plan.md`. UI reference: `../robloxops-design/`.

## Layout

```
apps/web                 Next.js 15 App Router + TypeScript + Tailwind
  src/lib/data.ts        data-access seam (mock <=> Supabase)
  src/lib/insights.ts    analytics/agents/audit/billing reads (mock <=> Supabase)
  src/lib/tenant.ts      tenant settings + team count reads (mock <=> Supabase)
  src/lib/mock.ts        demo dataset used when Supabase env is absent
  src/server/            tRPC routers (currently only reachable via /api/trpc)
  src/app/(dashboard)/** server components + server actions
apps/worker              Python 3.12 FastAPI worker + Discord bot + queue runner
  app/handlers/          intake, brief, qa, revision
  app/discord.py         Discord REST sender (bot token)
  app/outbound.py        outbound queue + human-approval delivery
  app/routing.py         least-loaded designer assignment
  app/followups.py       follow-up persistence + sending (rate-limited)
  app/reports.py         report persistence helpers
  app/queue.py           Postgres queue client
  runner.py              queue consumer + follow-up cron sweep
supabase/migrations      0001..0011 (schema, RLS, jobs, provisioning, billing, storage, revisions, followups, reports, outbound/takeover)
docs/                    DATABASE.md, AUTH.md, BILLING.md, HANDOFF.md
```

## Commands (Windows PowerShell, run from repo root)

```powershell
npm install                       # workspaces: apps/web
npm run dev                       # dashboard, demo mode if no Supabase env
npm --workspace apps/web run typecheck
npm --workspace apps/web run build

# Worker tests (offline; fake DB + FakeLLM, no network)
$env:PYTHONPATH="apps/worker"; & "apps/worker/.venv/Scripts/python.exe" -m pytest apps/worker/tests -q
& "apps/worker/.venv/Scripts/python.exe" -m compileall -q apps/worker
```

Worker API / bot / queue consumer (see apps/worker/README.md):
`python -m uvicorn app.main:app --port 8080`, `python bot.py`, `python runner.py`.

## Non-negotiable rules

1. **Tenant isolation.** Web uses Supabase RLS (`tenant_id` JWT claim via
   `public.current_tenant_id()`). The worker/bot use the service role and BYPASS
   RLS, so every business query must include `tenant_id` from a trusted source,
   never from request input.
2. **Demo mode.** With no `NEXT_PUBLIC_SUPABASE_URL`, the dashboard reads
   `src/lib/mock.ts` / `insights.ts` fallbacks and the worker uses `FakeLLM`.
   Keep both paths working; never break demo mode.
3. **Mutations** from the UI go through server actions that follow the existing
   pattern (`src/app/(dashboard)/settings/actions.ts`): `createClient()` +
   `getAuthSession()`, validate, write, `revalidatePath`, then return a
   `{ ok, message }` result. Do not introduce a new state layer.
4. **Migrations are append-only.** New files: `0012_*.sql`, etc. Never edit an
   applied migration. 0006 replaces the `claim_jobs` function signature.
5. **No secrets in the repo.** Copy `.env.example` files; never commit keys.
6. **Structured LLM output only.** Worker handlers validate with Pydantic;
   invalid output escalates (`agent_audit_log.status='escalated'`) and writes no
   domain data.
7. **Do not commit** unless the user explicitly asks.

## Verification gates (must pass before you claim done)

- `npm --workspace apps/web run typecheck`
- `npm --workspace apps/web run build`
- worker `pytest` (82 tests currently) + `compileall`

## Where things are going

- The **tRPC layer is scaffolded but unused**; the UI uses server components +
  server actions. Either mount tRPC and migrate, or delete it — do not leave
  half-wired.
- Remaining backlog, priorities and file pointers: `docs/HANDOFF.md`.

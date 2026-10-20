# RobloxOps — Handoff

> Purpose: a new agent (or a future you) should be able to resume from this file
> alone. It states what exists, how to verify it, and what is left. Read
> `AGENTS.md` first for the rules and commands.

**Snapshot: 2026-10-20** · branch `master` · run `git log -1` for the exact
commit · working tree clean after each phase commit.

## Status at a glance

| Area | State |
|---|---|
| Postgres schema, RLS, per-tenant reference codes | done (`0001`–`0018`) |
| Job queue (`claim_jobs` / `complete_job` / `fail_job` + reaper) | done (`0003`, `0006`) |
| Tenant provisioning RPC (`provision_tenant`) | done (`0004`) |
| Stripe billing (checkout / portal / webhook, `billing_events`) | done (`0005`) |
| Deliverables storage bucket + policies | done (`0007`) |
| Revisions table + RLS | done (`0008`) |
| Follow-ups table + RLS + persistence + sending | done (`0009`) |
| Reports table + RLS + persistence | done (`0010`) |
| Outbound Discord delivery + approval queue + takeover | done (`0011`) |
| Per-tenant secrets in Supabase Vault | done (`0012`) |
| Notifications (in-app + Resend email) | done (`0013`) |
| Invoices | done (`0014`) |
| Realtime publication + client refresh helper | done (`0015`) |
| Assistant chat + 9 audited tools | done (`0016`) |
| Portfolio drafts + X publishing | done (`0017`) |
| `current_tenant_id()` reads `app_metadata` | done (`0018`) |
| FastAPI worker: 16 endpoints | done |
| Discord bot: channels, threads, `/status` `/brief` `/revision` `/help` | done, needs a real guild |
| Next.js dashboard: 19 pages + 6 API routes | done |
| CI: typecheck + build + pytest + compileall | done (`.github/workflows/ci.yml`) |
| Browser end-to-end tests (Playwright, demo mode) | done — 13 tests |
| RLS integration tests (two tenants, live Postgres) | **not started** |
| Structured logging / runbook / health page | **not started** |
| tRPC API | scaffolded, unused by the UI |
| Payments / Robux | not started |

## Verification (run these, not the old numbers)

```powershell
# from the repo root
npm run typecheck                                   # tsc --noEmit, clean
npm run build                                       # next build, succeeds
npm run scan:secrets                                # no findings
npm run scan:secrets:all                            # includes git history
npm run e2e                                         # 13 Playwright tests, demo mode

# worker (offline: fake DB + FakeLLM, no network)
cd apps/worker
.venv/Scripts/python.exe -m pytest -q               # 147 passed
.venv/Scripts/python.exe -m compileall -q app       # clean
```

Last run of all of the above on 2026-10-20: green.

## What exists

**Worker** (`apps/worker`): FastAPI app with 16 token-guarded endpoints plus an
open `/health`. Five pipeline handlers (intake, brief, qa, revision, plus
follow-up/report helpers), a Postgres-backed queue consumer (`runner.py`), a
Discord bot, per-tenant LLM resolution (tenant Vault key → env key → `FakeLLM`),
outbound delivery with human approval, notifications, invoices, the assistant
loop with tool calling, and portfolio drafting/publishing.

**Web** (`apps/web`): Next.js 15 App Router. Every page reads Supabase when the
env is present and falls back to `src/lib/mock.ts` when it is not. Mutations go
through server actions that return `{ ok, message }`. Realtime refresh is mounted
in the dashboard layout.

**Database**: 18 migrations, 23 tables, RLS enabled on every table with
`tenant_id = current_tenant_id()`. `current_tenant_id()` reads the top-level
`tenant_id` claim and falls back to `app_metadata.tenant_id`.

## Remaining backlog (prioritized)

### P0 — correctness

1. **The bot's fast-path reply bypasses the approval queue.** `bot.py` sends the
   intake/continue reply directly; only worker-originated messages go through
   `app/outbound.py`. Route the bot reply through `/notify` or `outbound.py`.
2. **`app/db.py` guard is weaker than its docstring.** `require_tenant_id` only
   checks that the argument is truthy; it does not inspect the SQL text. Either
   add a check that the statement contains `tenant_id` or narrow the claim.

### P1 — proof

3. **RLS integration tests.** Isolation is asserted by policy review, not by a
   test that logs in as two tenants against a real Postgres.
4. **Observability.** Logs are plain text; there is no correlation id, no queue
   depth on `/health`, and no operator runbook.

### P2 — polish

5. **tRPC is dead code.** `TRPCReactProvider` is never mounted; routers are only
   reachable via `/api/trpc`. Delete it or migrate mutations.
6. **Seed tenant has no `monitored_channel_ids`**, so the bot monitors nothing for
   the demo tenant out of the box.
7. **Reference-code doc drift.** README historically said `ROB-{YY}{seq:04d}`; the
   function returns `ROB-{seq}`. The function is the source of truth.
8. **Unused worker config:** `supabase_url`, `supabase_service_role_key`,
   `discord_application_id` are declared in `app/config.py` but never read.
9. **Payments / Robux.** `payment_status` is edited by hand; no rate tracking,
   invoice generation or payment follow-up agent.
10. **Deployment is manual.** The worker has a Dockerfile; the web app has no
    deployment config in the repo.

## Environment setup checklist (not in repo — required to run live)

- **Supabase**: create a project, apply `0001`→`0018` in order, load
  `supabase/seed.sql`. **Enable the Email provider** in Authentication — it is
  disabled by default in some projects and signup fails with
  `email_provider_disabled`. Create the `deliverables` bucket (migration `0007`
  does it). Ensure Vault is available (`0012`).
- **Web env** (`apps/web/.env.local`): `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `INTERNAL_WORKER_TOKEN`, `INTERNAL_WORKER_URL`.
- **Worker env** (`apps/worker/.env`): `APP_ENV`, `DATABASE_URL`,
  `INTERNAL_WORKER_TOKEN`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL_FAST/MID/VISION`,
  `DISCORD_BOT_TOKEN`, `DISCORD_WORKER_URL`.
- **Per-tenant keys** are entered in Settings → Integrations and stored in Vault:
  `LLM_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`,
  `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`.
- **Discord**: enable the Message Content intent; scopes `bot`,
  `applications.commands`; redirect URI `${NEXT_PUBLIC_APP_URL}/api/discord/callback`.
- **Production**: `APP_ENV=production` makes the worker refuse to boot with the
  development token or empty `DATABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.

## Gotchas

- **The worker uses the service role and bypasses RLS.** Every new query must
  filter `tenant_id` from a trusted source, never from request input.
- **`withFallback` hides broken queries** in non-production. Watch for
  `[data] ... failed` in the console; a page that looks fine may be showing mock
  data.
- **Migration `0006` replaces the `claim_jobs` signature**; apply it after `0003`.
- **Migrations are append-only.** Add `0019_*.sql`; never edit an applied file.
- **npm workspaces**: run commands from the repo root, not `apps/web`.
- **`npm run worker:dev` uses the system Python**, which lacks the worker
  dependencies. Use `apps/worker/.venv/Scripts/python.exe -m uvicorn ...`.
- **LLM quota is the usual cause of `assistant_rate_limited`** — the Gemini free
  tier allows ~20 requests/day. It is not a code bug.
- History from earlier sessions (2026-10-19 and before) was removed from this
  file to keep it accurate. Use `git log` for the detailed record.

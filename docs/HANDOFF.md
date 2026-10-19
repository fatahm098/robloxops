# RobloxOps — Handoff / Memory

> Purpose: if the current agent runs out of credits, the next agent (any tool)
> should be able to resume from this file alone. It is the source of truth for
> "what is done" and "what is left". Read `AGENTS.md` first for rules/commands.

Snapshot: **2026-10-19** · branch `master` · last commit `d2c93e2`
("feat: RobloxOps MVP scaffold") · the entire feature build below is **uncommitted
in the working tree**. Nothing has been committed since that scaffold.

## Status at a glance

| Area | State |
|---|---|
| Postgres schema, RLS, per-tenant reference codes | done (0001–0002) |
| Postgres job queue (`claim_jobs`/`complete_job`/`fail_job` + kind filter + reaper) | done (0003, 0006) |
| Tenant provisioning RPC (`provision_tenant`) | done (0004) |
| Stripe billing (checkout/portal/webhook, `billing_events`) | done (0005) |
| Deliverables storage bucket + policies | done (0007) |
| Revisions table + RLS | done (0008) |
| Follow-ups table + RLS + worker persistence | done (0009) |
| Reports table + RLS + worker persistence | done (0010) |
| Tenant billing period (`tenants.current_period_end`) | done (0005) |
| FastAPI worker: intake, brief, QA, follow-up, report | implemented AND persisting (follow-ups, reports) |
| Discord bot: monitored channels, threads, `/status` `/brief` `/revision` `/help` | fixed; needs a real guild to run |
| Discord OAuth callback (`/api/discord/callback`) | wired this session; needs `DISCORD_CLIENT_ID/SECRET` |
| Next.js dashboard: overview, projects, detail, tasks, audit, customers, deliverables, revisions, agents, analytics, billing, settings, onboarding, auth | built; all surface values/actions now live (demo fallback) |
| Billing page (credits, renewal, invoices) | live this session (0011 + `getBillingSummary`) |
| Settings defaults/channels + GDPR workspace-data delete | live this session |
| Onboarding step completion | computed live this session |
| Sidebar badges + `/analytics` link | live this session |
| Projects table filters/pagination/selection/CSV export | live this session |
| Overview cards + widget actions (QA approve/flag, chips) | live this session |
| Deliverable upload flow (signed URL → storage → queue QA) | wired earlier session |
| Project status actions (revision / delivered / send-to-customer / report download) | wired earlier + this session |
| AI pause switch (global + per-agent via `tenants.settings`) | wired + enforced end-to-end (handlers + queue, this session) |
| tRPC API | scaffolded but **unused** by the UI |
| Follow-up *sending* (bot send + rate limits), email, realtime | not done |

## Verify (current results)

```powershell
$env:PYTHONPATH="apps/worker"; & "apps/worker/.venv/Scripts/python.exe" -m pytest apps/worker/tests -q   # 53 passed
& "apps/worker/.venv/Scripts/python.exe" -m compileall -q apps/worker                                     # clean
npm --workspace apps/web run typecheck                                                                    # clean
npm --workspace apps/web run build                                                                        # 23 pages, OK
```

## Completed in the 2026-10-19 session (P0 backlog)

### #5 `ai_paused` end-to-end
- Gap found: the bot fast path was already gated transitively (paused intake
  handlers return `escalated`, no reply), but the **queue path** ran `qa_check` for
  paused tenants (`qa` had no pause short-circuit like intake/brief).
- `apps/worker/runner.py` — guards `qa_check` via `escalate_if_ai_paused`; paused →
  job completes without running QA.
- `apps/worker/app/handlers/__init__.py` — additive `escalate_if_ai_paused(...)`
  helper (`action="ai_paused"`, `escalated` audit row).
- `apps/worker/bot.py` — unchanged (delegates to handlers).
- Tests: `tests/test_queue.py` (paused skips + audits QA), `tests/test_bot.py`
  (paused channel/thread → no reply, inbound recorded, escalated; `/help` `/status`
  still answer while paused).

### #2 Report persistence
- `supabase/migrations/0010_reports.sql` — `reports` table, unique
  `(tenant_id, project_id, kind)`, index, RLS (mirrors 0002).
- `apps/worker/app/reports.py` (NEW) — `persist_report` upsert + audit
  (`project_manager`/`report_generated`), tenant-scoped.
- `apps/worker/app/main.py` — `/report/generate` persists and returns `report_id`
  (Markdown response unchanged). `models.py` — additive `ReportRequest.kind`
  (default `delivery`), `ReportResult.report_id`.
- Web: `insights.ts` — `getProjectReport`/`listReports` (demo → null);
  `projects/actions.ts` — best-effort report generate on `delivered`, new
  `fetchProjectReport`; `project-actions.tsx` — "Download report" button.
- Tests: `tests/test_reports.py` (upsert, kind separation, audit, tenant scope).

### #4 Discord OAuth callback
- `src/app/api/discord/callback/route.ts` (NEW) — GET handler: guards missing env
  (`?discord=unconfigured`), missing `code` (`?discord=error`), no session/tenant
  (→ `/login?next=/onboarding`); exchanges the code at Discord's token endpoint
  (form-encoded), reads guild id from the partial `guild.id` else `guild_id`,
  updates `tenants.discord_guild_id` via the user-scoped client, maps unique
  violation to `?discord=taken`, success → `/onboarding?discord=connected`. No
  secret/token logging; no bot token stored.
- `src/app/(dashboard)/onboarding/page.tsx` — step 1 `done` now reflects
  `tenant.discordGuild` (real id vs `"Not connected"`).
- `apps/web/.env.example` — added `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET`.

### #3 Revision workflow
- `supabase/migrations/0008_revisions.sql` — `revisions` table + 2 indexes + RLS
  (mirrors 0002).
- `apps/worker/app/handlers/revision.py` — `create_revision` validates
  project↔tenant, inserts, sets `projects.status='revision'` and bumps
  `revision_count`, logs audit (`project_manager`/`revision_created`).
- `apps/worker/app/main.py` — `POST /revision/create` (token router), `ValueError`
  → 404. `apps/worker/app/models.py` — additive `RevisionCreateRequest`.
- `apps/worker/bot.py` — `BotRepo.create_revision` + `/revision` slash command
  (decorator-registered, tenant-scoped); `/help` updated.
- `src/lib/insights.ts` — `listRevisions` is now live (tenant-scoped join to
  `projects`, `created_at desc`, limit 100) with demo fallback.
- `src/app/(dashboard)/revisions/page.tsx` + `components/revisions/revisions-table.tsx`
  (NEW) + one sidebar link (`Repeat2`, label "Revisions").
- Tests: `tests/test_revision.py`; `tests/test_bot.py` command set updated.

### #1 Follow-up persistence
- `supabase/migrations/0009_followups.sql` — `followups` table (nullable
  `project_id`/`customer_id`, kind/status checks, `payload jsonb`, 3 indexes, RLS).
- `apps/worker/app/followups.py` (NEW) — `record_followup`, `list_due_followups`,
  `run_followup` (insert + `project_manager`/`followup_sent` audit), tenant-scoped.
- `apps/worker/app/main.py` — `/followup/run` now persists each draft and returns
  `followup_id` (response shape otherwise unchanged). `models.py` —
  `FollowUpDraft.followup_id`.
- Tests: `tests/test_followups.py`. Web was intentionally NOT wired (no follow-up
  surface on the dashboard yet).

## Completed in the 2026-10-19 session (earlier)

### Worker / bot bug fixes
- `apps/worker/bot.py` — removed duplicate `tree.add_command(...)` calls that
  raised `CommandAlreadyRegistered` at startup (`@self.tree.command` already
  registers). Tests: `tests/test_bot.py`.
- `apps/worker/app/queue.py` + `supabase/migrations/0006_jobs_queue_fixes.sql` —
  queue dedup key aligned to `payload->>'message_id'` (unique index), `ENQUEUE_SQL`
  now `ON CONFLICT DO NOTHING`, `claim_jobs(worker_id, batch, kinds)` filters kinds
  in SQL (no more leaked `running` jobs), added `reap_stale_jobs()`.
- `apps/worker/runner.py` — claims only handled kinds, fails unknown kinds
  gracefully, reaps stale jobs at startup + every 30 iterations.
- `apps/worker/Dockerfile` — now `COPY runner.py`.
- `apps/worker/app/models.py` — `ProjectType` uses `other` (matches the DB CHECK;
  removed the `unknown`→NULL workaround in intake).
- `apps/worker/app/handlers/{intake,brief}.py` + `handlers/__init__.py` — enforce
  `tenants.settings.ai_paused`: inbound is still recorded, an `escalated` audit
  row is written, no LLM call, no Discord reply.
- `apps/worker/app/handlers/qa.py` + `models.py` — QA report uses the UI shape
  `{checks:[{label,value,passed}], score, max_score, summary}`; vision URL is
  forwarded when `file_path` is an http(s) URL.
- `apps/worker/app/llm.py` — retry on `HTTPStatusError` 429/5xx; `FakeLLM` gained
  a `revision` draft purpose.
- Tests: `test_brief.py`, `test_qa.py` added; `test_intake.py`, `test_models.py`,
  `test_queue.py` updated. **20 → 34 passing.**

### Web live-data wiring
- `src/lib/insights.ts` — `getAnalytics` and `getAgentStatuses` now query Supabase
  (projects, deliverables, agent_audit_log, tenants.settings) with the demo
  fallback; added `listAuditEntries`, `getAgentPauseState`. `listRevisions` stays
  demo-only (no `revisions` table).
- `src/lib/data.ts` — `listCustomers` computes live `activeProjects`,
  `totalSpentUsd`, `lastOrderAt`, `state`; exported `readContext`/`withFallback`.
- `src/app/(dashboard)/audit/page.tsx` — reads live audit entries, demo fallback;
  added `components/audit/audit-export-button.tsx` (JSON export).
- `src/app/(dashboard)/agents/page.tsx` — live statuses + wired Pause-all /
  per-agent Pause·Resume via `src/app/(dashboard)/agents/actions.ts`
  (`tenants.settings.ai_paused` and `settings.agents_paused`), with
  `components/agents/*` client controls. Buttons are disabled in demo mode.
- `src/app/(dashboard)/analytics/page.tsx` — chart math guarded for empty data.

### Web upload + project actions
- `supabase/migrations/0007_storage.sql` — private `deliverables` bucket +
  tenant-prefix storage policies.
- `src/app/(dashboard)/deliverables/actions.ts` — `prepareUpload` (validate,
  signed upload URL via service role, insert `deliverables` row with next
  version) and `finalizeUpload` (enqueue `qa_check` job).
- `src/components/deliverables/upload-panel.tsx` — real client upload:
  prepare → `storage.uploadToSignedUrl` → finalize → refresh. Disabled in demo.
- `src/app/(dashboard)/deliverables/page.tsx` — passes open projects to the panel;
  header button anchors to `#upload-panel`.
- `src/app/(dashboard)/projects/actions.ts` — `updateProjectStatus` (audit row
  `human:<id>`) and `createDeliverableDownloadUrl` (signed URL).
- `src/components/project-detail/project-actions.tsx` (header) — Request Revision
  → `revision`, Mark Delivered → `delivered`, Download → signed URL of the final
  deliverable. `deliverable-actions.tsx` — Send to Customer → `customer_review`,
  3D viewer intentionally disabled.

## Completed in the 2026-10-19 session (P1 UI wiring)

Built by four parallel agents on disjoint files (owner in parentheses), then the
final typecheck + build + `pytest` were run on the merged tree.

### Dashboard live values + overview widgets (A)
- `src/lib/types.ts` — additive `OverviewStats`: `qaCheck`, `inDesign`,
  `highPriorityOpen`.
- `src/lib/data.ts` — `DataContext` gains `userId`/`email`; `getOverview()` returns
  `viewerName` (users row → email local-part → `"Alex"`) and computes the new
  counts; demo fallback updated.
- `src/app/(dashboard)/page.tsx` — live greeting, live QA/Design counts, live
  bottleneck count; removed the un-derivable "94% efficiency"/"● Live Feed"
  claims; "Connect Discord Server" → `<Link href="/api/discord/authorize">`.
- `src/components/overview/qa-preview.tsx` — now client; real `qaScore/qaScoreMax`,
  spec text when present; "Approve & Export Package" / "Flag Revision" call
  `updateProjectStatus("approved"|"revision")` (disabled in demo).
- `src/components/overview/team-allocation.tsx` — "Rebalance Task Queue" → `/tasks`.
- `src/components/overview/urgent-deliverables.tsx` — filter chips are live Links
  to `/projects?status=…` with counts from props; Critical badge computed.

### Billing live (B)
- `src/lib/insights.ts` — additive `getBillingSummary()` (tenant row incl.
  `current_period_end` from 0005 + invoices mapped defensively from
  `billing_events`, `[]` otherwise).
- `src/app/(dashboard)/billing/page.tsx` — live credits/renewal/invoices; "No
  invoices yet" empty state; demo path unchanged (`demo: true`).

### Settings + onboarding live (C)
- `src/lib/tenant.ts` (NEW) — `getTenantSettings()` (tenant row + users count,
  demo fallback).
- `src/app/(dashboard)/settings/page.tsx` — real `defaults` from `tenant.settings`,
  live monitored channels, plan badge, demo banner.
- `src/app/(dashboard)/settings/actions.ts` — `deleteWorkspaceData(confirmation)`
  (owner-gated via `users` role + admin client, requires literal `DELETE`, wipes
  tenant-owned rows in FK-safe order incl. storage objects; never deletes the
  tenant/users/auth users; disabled in demo) +
  `components/settings/delete-workspace-button.tsx` confirm modal.
- `src/app/(dashboard)/onboarding/page.tsx` — every `STEPS[].done` computed live.

### Shell + projects UI (D)
- `src/app/(dashboard)/layout.tsx` — fetches project/task counts, passes to Sidebar.
- `src/components/shell/sidebar.tsx` — live badges; "Discord Comm" → `/settings`;
  added `/analytics` link.
- `src/app/(dashboard)/projects/page.tsx` + `components/projects/*` — assignee +
  deadline-month filters, rows-per-page, real pagination (Link-based, param
  preserving), selection state and working CSV export
  (`projects-table-client.tsx`, `project-csv.ts`, `projects-export-button.tsx`).

## Remaining backlog (prioritized)

### P0 — correctness / completeness of the MVP workflow
_All P0 items are now done:_ report persistence (0010), `ai_paused` end-to-end
(runner + `escalate_if_ai_paused`), follow-up persistence (0009), revision
workflow (0008), Discord OAuth callback. See the session sections above.

### P1 — wire the remaining inert UI
_All P1 items are now done_ (see "Completed in the 2026-10-19 session (P1 UI
wiring)" below). Nothing left in P1.

The earlier create-actions / task-status work (also done): `createProject` +
`createTask` dialogs, dashboard "Upload Deliverable" link, and the task board
status mutation (`updateTaskStatus` + `TaskStatusMenu`). Files:
`src/app/(dashboard)/projects/actions.ts`, `src/app/(dashboard)/tasks/actions.ts`,
`src/components/projects/create-project-dialog.tsx`,
`src/components/tasks/create-task-dialog.tsx`, `src/components/tasks/task-status-menu.tsx`,
`src/components/tasks/task-row.tsx`, `src/components/tasks/task-board.tsx`,
`src/components/ui/modal.tsx`.

### P2 — robustness / tech debt
11. **tRPC is dead code.** `src/trpc/react.tsx` `TRPCReactProvider` is never
    mounted; routers in `src/server/routers/*` are only reachable via
    `/api/trpc`. Decide: mount + migrate mutations, or delete.
12. **`apps/worker/app/db.py`** claims to reject non-tenant SQL but only checks the
    `tenant_id` argument is truthy. Either enforce SQL text inspection or fix the
    docstring/README claim.
13. **Seed tenant has no `monitored_channel_ids`** in `tenants.settings`
    (`supabase/seed.sql`), so the bot monitors nothing for the demo tenant.
14. **Reference-code doc drift:** README says `ROB-{YY}{seq:04d}`; the DB function
    `next_reference_code` returns `ROB-{seq}`. Align docs or function.
15. **Unused worker config:** `supabase_url`, `supabase_service_role_key`,
    `discord_application_id` in `apps/worker/app/config.py` are never read.
16. **Follow-up send path.** `/followup/run` now persists `pending` rows, but
    nothing actually sends them via the bot or enforces max 1/24h / max 3 before
    escalation. Add the send + limits. Files: `apps/worker/app/followups.py`,
    `apps/worker/bot.py`, `apps/worker/runner.py`.
17. **Report regenerate UX.** `project-actions.tsx` lazily loads the report via
    `fetchProjectReport`; thread the report through the project detail page/header
    as a prop so it is server-rendered (the prop path already takes precedence).

## Environment setup checklist (not in repo — required to run live)

- **Supabase**: create project, apply migrations `0001`→`0010` in order
  (`supabase db push`), load `supabase/seed.sql` (`supabase db reset`), configure
  the `tenant_id` JWT claim (see `docs/AUTH.md`), create the `deliverables`
  bucket (0007 does this). Web env: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `INTERNAL_WORKER_TOKEN`.
- **Stripe** (optional): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `STRIPE_PRICE_STARTER/_GROWTH/_PRO`, `NEXT_PUBLIC_APP_URL` (see `docs/BILLING.md`).
- **Worker** (`apps/worker/.env`): `DATABASE_URL`, `INTERNAL_WORKER_TOKEN`,
  `LLM_API_KEY` (blank ⇒ `FakeLLM`), `LLM_MODEL_FAST/MID/VISION`,
  `DISCORD_BOT_TOKEN`, `DISCORD_WORKER_URL`. Web→worker calls also read
  `INTERNAL_WORKER_URL` (default `http://localhost:8080`) + `INTERNAL_WORKER_TOKEN`.
- **Discord**: enable the Message Content intent; scopes `bot`,
  `applications.commands`; permissions View Channel, Send Messages, Read Message
  History, Use Application Commands, Manage Threads. For the OAuth callback set
  the web env `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` and register the
  redirect URI `${NEXT_PUBLIC_APP_URL}/api/discord/callback` in the developer
  portal.

## Gotchas / decisions

- `pg-boss` was replaced by a plain SQL queue (`jobs` table) because pg-boss is
  Node-only and the worker is Python. Queue contract: `apps/worker/README.md`.
- Migrations `0006` **drops and recreates `claim_jobs` with a 3-arg signature**;
  apply it after `0003` or the worker's RPC call fails.
- Web server actions are the mutation pattern; `src/lib/data.ts` `withFallback`
  silently returns mock data in non-production on query errors — it masks broken
  live queries, watch the `[data] ... failed` console logs.
- The worker uses the service role and bypasses RLS: every new query must filter
  by `tenant_id`.
- Purchasing/`pnpm` note: this repo uses **npm workspaces** (`apps/web`); run
  commands from the repo root, not `apps/web`.

# RobloxOps — Database

PostgreSQL 15 / Supabase. Shared schema, `tenant_id` on every tenant-owned row, RLS for isolation.

| File | Contents |
|---|---|
| `supabase/migrations/0001_init.sql` | Tables, checks, indexes, `set_updated_at`, reference-code allocator |
| `supabase/migrations/0002_rls.sql` | `current_tenant_id()`, policies, grants |
| `supabase/migrations/0003_jobs.sql` | Postgres job queue + RPCs |
| `supabase/seed.sql` | Apex UGC Studio demo data (tenant, 3 users, 8 customers, ROB-096…104) |

## Table map

| Table | Purpose | Tenant-scoped |
|---|---|---|
| `tenants` | Studio account, plan, Discord guild, `settings` JSON | itself |
| `users` | Studio team; `id` FK → `auth.users(id)` ON DELETE CASCADE | yes |
| `tenant_counters` | Per-tenant `ROB-{seq}` counter | yes |
| `customers` | End clients, unique per `(tenant_id, discord_user_id)` | yes |
| `projects` | Commissions, unique `(tenant_id, reference_code)` | yes |
| `briefs` | One per project (`project_id` unique), `structured_data` JSON | yes |
| `deliverables` | File versions, QA status/report, `uploaded_by` | yes |
| `conversations` | Discord message log, unique `(tenant_id, discord_message_id)` | yes |
| `agent_audit_log` | Append-only agent action/cost log | yes |
| `tasks` | Designer queue | yes |
| `jobs` | Queue rows (see below) | yes |

### UI type mapping

| `apps/web/src/lib/types.ts` | Database |
|---|---|
| `ProjectSummary.reference` | `projects.reference_code` |
| `projectType`, `status`, `paymentStatus` | same-named columns |
| `priceUsd`, `priceRobux`, `deadline`, `updatedAt` | `price_usd`, `price_robux`, `deadline`, `updated_at` |
| `assignee` | `users` via `projects.assigned_designer_id` |
| `qaScore`, `qaScoreMax` | latest deliverable `qa_report->>'score'`, `->>'max_score'` |
| `discordTicket` | `projects.discord_thread_id` |
| `assetDetail`, `specLine`, `deadlineLabel` | derived in the app from `project_type` + brief |
| `Brief` | `briefs.structured_data` (`summary`, `specs`, `palette`, `references`, `directives`) + `completeness_score`, `approved_by_designer` |
| `Deliverable.name` | basename of `file_path`; `previewUrl` from Storage; `uploadedBy` from `uploaded_by` |
| `Task.reference` | join `projects.reference_code` |
| `TimelineEvent` | derived from `agent_audit_log` + `conversations` + `tasks` (no table) |

## Tenant isolation

- Supabase Auth issues a JWT with a `tenant_id` claim. `public.current_tenant_id()` reads `auth.jwt() ->> 'tenant_id'` and returns NULL if missing/malformed.
- RLS is enabled on every table above. Policies compare `tenant_id = (select public.current_tenant_id())` for SELECT/INSERT/UPDATE/DELETE.
- `tenants`: members read their own row, only `owner` updates it.
- `users`: members read their team, only `owner`/`manager` update. `current_user_role()` is `SECURITY DEFINER` to avoid RLS recursion.
- `agent_audit_log`: SELECT + INSERT only. No UPDATE/DELETE policy, so those statements affect 0 rows.
- `jobs`: members can SELECT their tenant's jobs; enqueue/claim/complete/fail are service-role only.
- `tenants` and `users` have no INSERT policy: signup provisioning must run with `service_role` (it creates the tenant and the first owner in one transaction).

**service_role bypasses RLS.** The Python worker and any admin script connect with `service_role` (or `postgres`), so Postgres will not filter a single row for them. Every worker query must include `where tenant_id = $1`, with the tenant id taken from the job payload or guild mapping — never from user input. The same rule applies to joins.

**Emergency stop:** `tenants.settings->>'ai_paused'`. Read it as `coalesce((settings->>'ai_paused')::boolean, false)` before any LLM call or Discord send. The bot may still record inbound messages and enqueue jobs while paused.

### Reference codes

`projects.reference_code` is auto-filled by a BEFORE INSERT trigger calling `public.next_reference_code(tenant_id)`, which does an atomic upsert on `tenant_counters`:

```sql
insert into tenant_counters (tenant_id, last_seq) values ($1, 1)
on conflict (tenant_id) do update set last_seq = tenant_counters.last_seq + 1
returning last_seq;
```

The upsert takes a row lock, so concurrent inserts serialize and never share a number. Explicit values are preserved (the seed uses ROB-096…104 and sets the counter to 104). Dashboard/worker inserts can simply omit `reference_code`. Only `service_role` may call `next_reference_code('<tenant uuid>')` directly to pre-allocate; the trigger is `SECURITY DEFINER`, so normal authenticated inserts still work. A rolled-back project insert also rolls back its number, so sequences can have gaps.

## Job queue

```sql
-- enqueue (duplicate Discord events are ignored by the partial unique index)
insert into jobs (tenant_id, kind, payload)
values ($1, 'discord.message', $2::jsonb)
on conflict do nothing
returning id;

-- worker loop
select * from claim_jobs('worker-1', 5);   -- status queued -> running, attempts + 1
select complete_job('<job id>');           -- status done
select fail_job('<job id>', 'traceback');  -- retry or dead
```

- `claim_jobs(worker_id text, batch int default 5)` uses `FOR UPDATE SKIP LOCKED`; concurrent workers never receive the same row.
- `fail_job` requeues with backoff `30s * 2^(attempts-1)` (30s, 60s, 120s… capped at 1h). When `attempts >= max_attempts` it sets `status = 'dead'` and stores `last_error` (with the default max of 3, the third failure goes straight to dead).
- `complete_job` sets `done` and clears the lock.
- Idempotency: unique `(kind, payload->>'discord_message_id')` where the key exists. To retry an existing event, update that job row (`status='queued', attempts=0, run_at=now()`); do not insert a second one.
- No automatic reaper for crashed workers. Requeue stale rows manually:

```sql
update jobs set status = 'queued', locked_at = null, locked_by = null
where status = 'running' and locked_at < now() - interval '15 minutes';
```

Queue RPCs are executable only by `service_role`.

## Running

```bash
supabase start
supabase db reset          # applies 0001-0003, then seed.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
```

Demo logins: `elena@apexugc.studio`, `marcus@apexugc.studio`, `devon@apexugc.studio` / `robloxops123`. The seed inserts matching `auth.users` rows because `public.users.id` references them.

## Isolation tests

Paste the whole block into the SQL editor (or psql) as the `postgres` user. It creates a second tenant, acts as Elena (tenant A), runs the checks, then rolls everything back.

```sql
begin;

-- Setup as owner (bypasses RLS): tenant B with one project.
insert into public.tenants (id, name, slug)
values ('22222222-2222-4222-8222-222222222222', 'Rival Studio', 'rival-studio');

insert into public.customers (id, tenant_id, discord_user_id, discord_username)
values ('c0000000-0000-4000-8000-0000000000ff',
        '22222222-2222-4222-8222-222222222222', '999000111222', 'rivalclient');

insert into public.projects (id, tenant_id, customer_id, title, status)
values ('a0000000-0000-4000-8000-0000000000ff',
        '22222222-2222-4222-8222-222222222222',
        'c0000000-0000-4000-8000-0000000000ff', 'Rival secret project', 'in_design');

-- Act as Elena (tenant A).
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b0000000-0000-4000-8000-000000000001","tenant_id":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true);

-- 1. Only tenant A rows are visible. Expect 8.
select count(*) as visible_projects from public.projects;

-- 2. Explicitly asking for tenant B returns nothing. Expect 0.
select count(*) as rival_projects
from public.projects
where tenant_id = '22222222-2222-4222-8222-222222222222';

-- 3. Same for customers. Expect 0.
select count(*) as rival_customers
from public.customers
where tenant_id = '22222222-2222-4222-8222-222222222222';

-- 4. Cross-tenant update is invisible. Expect UPDATE 0.
update public.projects
set title = 'pwned'
where id = 'a0000000-0000-4000-8000-0000000000ff';

-- 5. Cross-tenant insert is rejected. Expect:
--    ERROR: new row violates row-level security policy for table "projects"
insert into public.projects (tenant_id, customer_id, title)
values ('22222222-2222-4222-8222-222222222222',
        'c0000000-0000-4000-8000-0000000000ff', 'Smuggled project');

rollback;
```

Bonus — audit log is append-only. Run this as a separate transaction; both statements expect `0`:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b0000000-0000-4000-8000-000000000001","tenant_id":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true);

update public.agent_audit_log set action = 'tampered';  -- UPDATE 0
delete from public.agent_audit_log;                     -- DELETE 0
rollback;
```

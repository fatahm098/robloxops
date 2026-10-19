-- RobloxOps — Postgres job queue
--
-- pg-boss is a Node library and the worker is Python, so the queue is plain
-- SQL. Contract:
--   enqueue : insert into jobs (tenant_id, kind, payload) values (...)
--             on conflict do nothing  -- duplicate Discord events
--   claim   : select * from claim_jobs('worker-1', 5)
--   success : select complete_job('<job id>')
--   failure : select fail_job('<job id>', 'traceback ...')
--
-- Only service_role may execute the queue functions; the worker always uses
-- the service_role key, so it must also filter by tenant_id when it reads
-- business tables.

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'failed', 'dead')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts >= 1),
  run_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_payload_is_object check (jsonb_typeof(payload) = 'object')
);

create index jobs_status_run_at_idx on public.jobs (status, run_at);
create index jobs_tenant_created_idx on public.jobs (tenant_id, created_at desc);

-- Discord delivers the same gateway event more than once. A job is uniquely
-- identified by (kind, discord_message_id) while that key is present, so a
-- duplicate enqueue hits this index and can be ignored with
-- `on conflict do nothing` (no conflict target needed).
create unique index jobs_discord_message_id_uniq
  on public.jobs (kind, (payload ->> 'discord_message_id'))
  where payload ? 'discord_message_id';

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- claim_jobs
-- ---------------------------------------------------------------------------

-- Claims up to `batch` due jobs for one worker. FOR UPDATE SKIP LOCKED makes
-- concurrent workers skip rows another transaction already holds, so two
-- workers can never claim the same job. attempts is incremented at claim time
-- (an attempt that crashes the worker still counts).
create or replace function public.claim_jobs(worker_id text, batch int default 5)
returns setof public.jobs
language plpgsql
as $$
begin
  if worker_id is null or btrim(worker_id) = '' then
    raise exception 'claim_jobs: worker_id is required';
  end if;

  if batch is null or batch < 1 then
    raise exception 'claim_jobs: batch must be >= 1';
  end if;

  return query
  with next_jobs as (
    select j.id
    from public.jobs j
    where j.status = 'queued'
      and j.run_at <= now()
    order by j.run_at asc, j.created_at asc
    for update skip locked
    limit batch
  )
  update public.jobs j
     set status = 'running',
         attempts = j.attempts + 1,
         locked_at = now(),
         locked_by = worker_id,
         updated_at = now()
    from next_jobs n
   where j.id = n.id
  returning j.*;
end;
$$;

-- ---------------------------------------------------------------------------
-- fail_job
-- ---------------------------------------------------------------------------

-- Retryable failures go back to 'queued' with exponential backoff
-- (30s, 60s, 120s, ... capped at 1h). Once attempts >= max_attempts the job is
-- moved to 'dead' and left for a human.
create or replace function public.fail_job(job_id uuid, err text)
returns public.jobs
language plpgsql
as $$
declare
  v_job public.jobs;
begin
  update public.jobs j
     set status = case
                    when j.attempts >= j.max_attempts then 'dead'
                    else 'queued'
                  end,
         run_at = case
                    when j.attempts >= j.max_attempts then j.run_at
                    else now() + make_interval(
                      secs => least(
                        3600,
                        30 * power(2, greatest(j.attempts - 1, 0))
                      )::double precision
                    )
                  end,
         locked_at = null,
         locked_by = null,
         last_error = err,
         updated_at = now()
   where j.id = job_id
  returning j.* into v_job;

  return v_job;
end;
$$;

-- ---------------------------------------------------------------------------
-- complete_job
-- ---------------------------------------------------------------------------

create or replace function public.complete_job(job_id uuid)
returns public.jobs
language plpgsql
as $$
declare
  v_job public.jobs;
begin
  update public.jobs j
     set status = 'done',
         locked_at = null,
         locked_by = null,
         updated_at = now()
   where j.id = job_id
  returning j.* into v_job;

  return v_job;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS + privileges
-- ---------------------------------------------------------------------------

alter table public.jobs enable row level security;

-- Team members may watch their tenant's queue from the dashboard; enqueue and
-- state transitions happen through service_role only.
create policy jobs_select on public.jobs
  for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

revoke all on function public.claim_jobs(text, int) from public, anon, authenticated;
revoke all on function public.fail_job(uuid, text) from public, anon, authenticated;
revoke all on function public.complete_job(uuid) from public, anon, authenticated;

grant execute on function public.claim_jobs(text, int) to service_role;
grant execute on function public.fail_job(uuid, text) to service_role;
grant execute on function public.complete_job(uuid) to service_role;

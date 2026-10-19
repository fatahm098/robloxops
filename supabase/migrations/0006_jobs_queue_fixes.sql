-- RobloxOps — job queue fixes
--
-- 0003 built the queue with a dedup index on payload->>'discord_message_id' and
-- a two-argument claim_jobs(worker_id, batch). The application actually enqueues
-- with the payload key `message_id` and claims with a `kinds` filter, so:
--
--   1. the dedup index is rebuilt to match the real payload key (`message_id`);
--   2. claim_jobs becomes kind-aware (three arguments) so a worker never marks a
--      job it cannot dispatch as `running`;
--   3. reap_stale_jobs(timeout_seconds) returns jobs stuck in `running` (e.g. a
--      worker that died mid-job) to `queued` so they can be retried.
--
-- Idempotent: every index/function uses create/drop ... if [not] exists and the
-- functions are (re)created in place.

-- 1. dedup index -------------------------------------------------------------
-- Match the payload key the bot and app.queue actually write.

drop index if exists public.jobs_discord_message_id_uniq;

create unique index if not exists jobs_message_id_uniq
  on public.jobs (tenant_id, kind, (payload ->> 'message_id'))
  where payload ? 'message_id';

-- 2. kind-aware claim --------------------------------------------------------
-- The old two-argument signature is dropped so `claim_jobs($1, $2)` is no longer
-- ambiguous with the defaulted third argument below.

drop function if exists public.claim_jobs(text, int);
drop function if exists public.claim_jobs(text, int, text[]);

-- Claims up to `batch` due jobs of the requested `kinds` for one worker.
-- FOR UPDATE SKIP LOCKED makes concurrent workers skip rows another transaction
-- already holds. attempts is incremented at claim time (an attempt that crashes
-- the worker still counts). A null/empty `kinds` claims every due job.
create or replace function public.claim_jobs(
  worker_id text,
  batch int default 5,
  kinds text[] default null
)
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
      and (kinds is null or j.kind = any(kinds))
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

-- 3. stale-job reaper --------------------------------------------------------
-- A worker that crashes after claiming leaves rows in `running` with an old
-- locked_at. This resets them to `queued` (without touching attempts, so the
-- retry budget is still enforced by fail_job) and returns the count reaped.

create or replace function public.reap_stale_jobs(timeout_seconds int default 300)
returns integer
language plpgsql
as $$
declare
  reaped integer;
begin
  if timeout_seconds is null or timeout_seconds < 1 then
    raise exception 'reap_stale_jobs: timeout_seconds must be >= 1';
  end if;

  with stale as (
    update public.jobs j
       set status = 'queued',
           locked_at = null,
           locked_by = null,
           last_error = coalesce(j.last_error, 'reaped: worker stopped responding'),
           updated_at = now()
     where j.status = 'running'
       and j.locked_at is not null
       and j.locked_at < now() - make_interval(secs => timeout_seconds)
    returning 1
  )
  select count(*) into reaped from stale;

  return reaped;
end;
$$;

-- 4. privileges --------------------------------------------------------------
-- Only service_role may execute the queue functions.

revoke all on function public.claim_jobs(text, int, text[]) from public, anon, authenticated;
revoke all on function public.reap_stale_jobs(int) from public, anon, authenticated;

grant execute on function public.claim_jobs(text, int, text[]) to service_role;
grant execute on function public.reap_stale_jobs(int) to service_role;

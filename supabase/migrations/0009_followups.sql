-- 0009_followups.sql
-- Persisted follow-up queue. One row per nudge/report/reminder the worker
-- decides to send (or has sent) for a tenant. project_id is nullable because
-- some follow-ups are customer-level rather than tied to a single commission.

create table if not exists public.followups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  kind text not null default 'nudge'
    check (kind in ('nudge', 'report', 'reminder')),
  channel text,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'skipped')),
  due_at timestamptz,
  sent_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint followups_payload_is_object check (jsonb_typeof(payload) = 'object')
);

create index if not exists followups_tenant_created_idx
  on public.followups (tenant_id, created_at desc);
create index if not exists followups_tenant_status_idx
  on public.followups (tenant_id, status);
create index if not exists followups_project_idx
  on public.followups (project_id);

alter table public.followups enable row level security;

create policy followups_select on public.followups
  for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

create policy followups_insert on public.followups
  for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id()));

create policy followups_update on public.followups
  for update to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

create policy followups_delete on public.followups
  for delete to authenticated
  using (tenant_id = (select public.current_tenant_id()));

comment on table public.followups is
  'Tenant-scoped follow-up queue (nudge/report/reminder). RLS filters by tenant_id; service_role bypasses RLS, so worker/bot queries must always add where tenant_id = $1.';

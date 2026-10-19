-- 0008_revisions.sql
-- Customer revision requests logged against a commission. Rows are the
-- per-request history; projects.revision_count/max_revisions stay the summary.

create table if not exists public.revisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  requested_by text,
  reason text not null,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists revisions_tenant_created_idx
  on public.revisions (tenant_id, created_at desc);
create index if not exists revisions_project_idx
  on public.revisions (project_id);

alter table public.revisions enable row level security;

create policy revisions_select on public.revisions
  for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

create policy revisions_insert on public.revisions
  for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id()));

create policy revisions_update on public.revisions
  for update to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

create policy revisions_delete on public.revisions
  for delete to authenticated
  using (tenant_id = (select public.current_tenant_id()));

comment on table public.revisions is
  'Tenant-scoped revision requests. RLS filters by tenant_id; service_role bypasses RLS, so worker/bot queries must always add where tenant_id = $1.';

-- 0010_reports.sql
-- Persisted generated reports. One row per (tenant, project, kind); regenerating
-- replaces the existing row. Stored in Postgres (not Storage) so the dashboard can
-- query the latest report for a delivered project without signing an object URL.

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null default 'delivery'
    check (kind in ('delivery', 'qa', 'summary')),
  content_md text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reports_tenant_project_kind_key unique (tenant_id, project_id, kind)
);

create index if not exists reports_tenant_created_idx
  on public.reports (tenant_id, created_at desc);

alter table public.reports enable row level security;

create policy reports_select on public.reports
  for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

create policy reports_insert on public.reports
  for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id()));

create policy reports_update on public.reports
  for update to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

create policy reports_delete on public.reports
  for delete to authenticated
  using (tenant_id = (select public.current_tenant_id()));

comment on table public.reports is
  'Tenant-scoped generated reports, one row per (tenant_id, project_id, kind) upserted on regenerate. RLS filters by tenant_id; service_role bypasses RLS, so worker/bot queries must always add where tenant_id = $1.';

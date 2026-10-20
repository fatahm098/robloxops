-- 0014_invoices.sql
-- Simple per-tenant invoices for delivered projects, priced from a
-- Robux -> USD rate. One row per issued invoice; `number` is unique per tenant
-- (INV-0001, INV-0002, ...). RLS filters by tenant_id; service_role bypasses
-- RLS, so worker/bot queries must always add where tenant_id = $1.

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  number text not null,
  amount_robux bigint,
  rate_robux_per_usd numeric(12,4),
  amount_usd numeric(10,2),
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'paid', 'void')),
  issued_at timestamptz not null default now(),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invoices_tenant_number_key unique (tenant_id, number)
);

create index if not exists invoices_tenant_status_idx
  on public.invoices (tenant_id, status);
create index if not exists invoices_project_idx
  on public.invoices (project_id);

alter table public.invoices enable row level security;

create policy invoices_select on public.invoices
  for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

create policy invoices_insert on public.invoices
  for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id()));

create policy invoices_update on public.invoices
  for update to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

comment on table public.invoices is
  'Tenant-scoped invoices for delivered projects, priced from a Robux/USD rate. Status is draft/sent/paid/void. RLS filters by tenant_id; service_role bypasses RLS, so worker/bot queries must always add where tenant_id = $1.';

-- 0011_outbound_takeover.sql
-- Outbound message queue (with human approval) and per-project human takeover.
-- Every row is tenant-scoped; service_role bypasses RLS, so worker queries must
-- always add `where tenant_id = $1`.

create table if not exists public.outbound_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  channel_id text,
  kind text not null
    check (kind in ('deliverable', 'brief', 'status', 'first_message', 'followup', 'manual')),
  body text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'rejected', 'failed')),
  approved_by text,
  sent_at timestamptz,
  external_message_id text,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists outbound_messages_tenant_status_created_idx
  on public.outbound_messages (tenant_id, status, created_at);
create index if not exists outbound_messages_project_idx
  on public.outbound_messages (project_id);

alter table public.outbound_messages enable row level security;

create policy outbound_messages_select on public.outbound_messages
  for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

create policy outbound_messages_insert on public.outbound_messages
  for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id()));

create policy outbound_messages_update on public.outbound_messages
  for update to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

create policy outbound_messages_delete on public.outbound_messages
  for delete to authenticated
  using (tenant_id = (select public.current_tenant_id()));

alter table public.projects
  add column if not exists human_takeover boolean not null default false,
  add column if not exists takeover_by uuid references public.users(id) on delete set null,
  add column if not exists takeover_at timestamptz;

comment on table public.outbound_messages is
  'Tenant-scoped outbound Discord queue. status=pending waits for human approval in preview/human mode. RLS filters by tenant_id; service_role bypasses RLS, so worker queries must always add where tenant_id = $1.';

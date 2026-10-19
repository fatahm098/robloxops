-- RobloxOps — Row Level Security
--
-- Tenant isolation model: every tenant-owned row carries tenant_id and every
-- policy compares it with public.current_tenant_id(), which reads the
-- `tenant_id` claim from the request JWT (Supabase Auth custom claim).
--
-- IMPORTANT — service_role bypasses RLS. The Python worker connects with the
-- service_role key, so Postgres will NOT filter a single row for it. Every
-- worker query MUST include `where tenant_id = $1`, with the tenant id taken
-- from the job payload / guild mapping — never from user-supplied input.
-- The same applies to the postgres role used by migrations and psql.
--
-- agent_audit_log is append-only: SELECT and INSERT policies only. There is
-- deliberately no UPDATE or DELETE policy, so those statements affect 0 rows
-- for authenticated users (service_role can still delete for GDPR wipes).

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Returns NULL for a missing or malformed claim instead of raising a cast error.
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
as $$
  select case
    when (auth.jwt() ->> 'tenant_id')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (auth.jwt() ->> 'tenant_id')::uuid
    else null
  end;
$$;

-- SECURITY DEFINER so the users policy can read the caller's role without
-- recursing into users' own RLS. Owned by the migration role, which bypasses
-- RLS on public.users.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.role
  from public.users u
  where u.id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------

alter table public.tenants enable row level security;
alter table public.users enable row level security;
alter table public.tenant_counters enable row level security;
alter table public.customers enable row level security;
alter table public.projects enable row level security;
alter table public.briefs enable row level security;
alter table public.deliverables enable row level security;
alter table public.conversations enable row level security;
alter table public.agent_audit_log enable row level security;
alter table public.tasks enable row level security;

-- ---------------------------------------------------------------------------
-- tenants: members read their own tenant; only the owner may update it
-- ---------------------------------------------------------------------------

create policy tenants_select_member on public.tenants
  for select to authenticated
  using (id = (select public.current_tenant_id()));

create policy tenants_update_owner on public.tenants
  for update to authenticated
  using (
    id = (select public.current_tenant_id())
    and (select public.current_user_role()) = 'owner'
  )
  with check (
    id = (select public.current_tenant_id())
    and (select public.current_user_role()) = 'owner'
  );

-- ---------------------------------------------------------------------------
-- users: members read their tenant's team; owner/manager may update
-- (rows are created by the signup provisioning path using service_role)
-- ---------------------------------------------------------------------------

create policy users_select_tenant on public.users
  for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

create policy users_update_manager on public.users
  for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (select public.current_user_role()) in ('owner', 'manager')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.current_user_role()) in ('owner', 'manager')
  );

-- ---------------------------------------------------------------------------
-- tenant_counters: readable by members, written only by next_reference_code()
-- ---------------------------------------------------------------------------

create policy tenant_counters_select_member on public.tenant_counters
  for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------

create policy customers_select on public.customers
  for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

create policy customers_insert on public.customers
  for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id()));

create policy customers_update on public.customers
  for update to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

create policy customers_delete on public.customers
  for delete to authenticated
  using (tenant_id = (select public.current_tenant_id()));

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------

create policy projects_select on public.projects
  for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

create policy projects_insert on public.projects
  for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id()));

create policy projects_update on public.projects
  for update to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

create policy projects_delete on public.projects
  for delete to authenticated
  using (tenant_id = (select public.current_tenant_id()));

-- ---------------------------------------------------------------------------
-- briefs
-- ---------------------------------------------------------------------------

create policy briefs_select on public.briefs
  for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

create policy briefs_insert on public.briefs
  for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id()));

create policy briefs_update on public.briefs
  for update to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

create policy briefs_delete on public.briefs
  for delete to authenticated
  using (tenant_id = (select public.current_tenant_id()));

-- ---------------------------------------------------------------------------
-- deliverables
-- ---------------------------------------------------------------------------

create policy deliverables_select on public.deliverables
  for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

create policy deliverables_insert on public.deliverables
  for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id()));

create policy deliverables_update on public.deliverables
  for update to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

create policy deliverables_delete on public.deliverables
  for delete to authenticated
  using (tenant_id = (select public.current_tenant_id()));

-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------

create policy conversations_select on public.conversations
  for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

create policy conversations_insert on public.conversations
  for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id()));

create policy conversations_update on public.conversations
  for update to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

create policy conversations_delete on public.conversations
  for delete to authenticated
  using (tenant_id = (select public.current_tenant_id()));

-- ---------------------------------------------------------------------------
-- agent_audit_log: append-only (SELECT + INSERT only)
-- ---------------------------------------------------------------------------

create policy agent_audit_log_select on public.agent_audit_log
  for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

create policy agent_audit_log_insert on public.agent_audit_log
  for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id()));

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------

create policy tasks_select on public.tasks
  for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id()));

create policy tasks_update on public.tasks
  for update to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

create policy tasks_delete on public.tasks
  for delete to authenticated
  using (tenant_id = (select public.current_tenant_id()));

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

-- The reference allocator is SECURITY DEFINER (it writes tenant_counters).
-- Callers go through the projects BEFORE INSERT trigger, which is also
-- SECURITY DEFINER; authenticated users cannot call the allocator directly
-- (that would let them burn another tenant's sequence).
revoke all on function public.next_reference_code(uuid) from public;
revoke all on function public.next_reference_code(uuid) from anon;
revoke all on function public.next_reference_code(uuid) from authenticated;
grant execute on function public.next_reference_code(uuid) to service_role;

comment on table public.projects is
  'Tenant-scoped. RLS filters by tenant_id; service_role bypasses RLS, so worker queries must always add where tenant_id = $1.';
comment on table public.agent_audit_log is
  'Append-only audit trail: SELECT/INSERT policies only, no UPDATE/DELETE policy.';

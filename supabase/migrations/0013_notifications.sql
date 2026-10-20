-- 0013_notifications.sql
-- Tenant-scoped in-app notifications (designer assignment, approval requests).
--
-- Notifications are written by the worker with the service role, which bypasses
-- RLS. Interactive users may only read and mark their own rows as read: there
-- are deliberately no insert/delete policies (service_role still bypasses RLS
-- and can insert/clean up). Every worker query must filter on tenant_id.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_tenant_user_created_idx
  on public.notifications (tenant_id, user_id, created_at desc);
create index if not exists notifications_project_idx
  on public.notifications (project_id);

alter table public.notifications enable row level security;

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and user_id = (select auth.uid())
  );

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and user_id = (select auth.uid())
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and user_id = (select auth.uid())
  );

-- No insert/delete policies: workers write with service_role.

comment on table public.notifications is
  'Tenant-scoped in-app notifications. RLS lets authenticated users select/update only their own rows (tenant_id = current_tenant_id() and user_id = auth.uid()). Inserts/deletes are worker-only via service_role, so every worker query must add where tenant_id = $1.';

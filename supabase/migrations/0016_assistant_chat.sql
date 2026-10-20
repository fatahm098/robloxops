-- 0016_assistant_chat.sql
-- In-web assistant chat history (designer <-> AI assistant).
--
-- The assistant runs in the worker with the service role, so every worker
-- query must filter on tenant_id explicitly. Interactive users may read their
-- own threads and append messages; updates/deletes are worker-only.
--
-- Threads are per-user on purpose: a conversation between a designer and the
-- assistant is not shared with the rest of the studio.

create table if not exists public.assistant_threads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assistant_threads_tenant_user_created_idx
  on public.assistant_threads (tenant_id, user_id, created_at desc);

create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  thread_id uuid not null references public.assistant_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  -- Trace of the tools the assistant called while producing this message:
  -- [{ "name": "create_project", "ok": true, "summary": "ROB-107" }]
  tool_calls jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint assistant_messages_tool_calls_is_array
    check (jsonb_typeof(tool_calls) = 'array')
);

create index if not exists assistant_messages_thread_created_idx
  on public.assistant_messages (tenant_id, thread_id, created_at);

alter table public.assistant_threads enable row level security;
alter table public.assistant_messages enable row level security;

drop policy if exists assistant_threads_select on public.assistant_threads;
create policy assistant_threads_select on public.assistant_threads
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and user_id = (select auth.uid())
  );

drop policy if exists assistant_threads_insert on public.assistant_threads;
create policy assistant_threads_insert on public.assistant_threads
  for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and user_id = (select auth.uid())
  );

drop policy if exists assistant_messages_select on public.assistant_messages;
create policy assistant_messages_select on public.assistant_messages
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and exists (
      select 1
        from public.assistant_threads t
       where t.id = assistant_messages.thread_id
         and t.user_id = (select auth.uid())
    )
  );

drop policy if exists assistant_messages_insert on public.assistant_messages;
create policy assistant_messages_insert on public.assistant_messages
  for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and exists (
      select 1
        from public.assistant_threads t
       where t.id = assistant_messages.thread_id
         and t.user_id = (select auth.uid())
    )
  );

-- No update/delete policies: history is append-only for users, worker-only for
-- cleanup (service_role bypasses RLS).

drop trigger if exists assistant_threads_set_updated_at on public.assistant_threads;
create trigger assistant_threads_set_updated_at
  before update on public.assistant_threads
  for each row execute function public.set_updated_at();

comment on table public.assistant_threads is
  'Per-user assistant chat threads. RLS: authenticated users see/insert only their own rows (tenant_id = current_tenant_id() and user_id = auth.uid()).';

comment on table public.assistant_messages is
  'Append-only assistant transcript. tool_calls holds a compact trace [{name, ok, summary}] for the developer view; the worker writes with service_role and must filter tenant_id.';

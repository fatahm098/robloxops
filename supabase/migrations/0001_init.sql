-- RobloxOps — initial schema
-- Target: PostgreSQL 15 / Supabase.
-- One shared schema, tenant_id on every tenant-owned table (RLS in 0002).

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------------

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  discord_guild_id text unique,
  discord_bot_token_enc text,
  plan_id text not null default 'starter'
    check (plan_id in ('starter', 'growth', 'pro', 'enterprise')),
  stripe_customer_id text,
  stripe_subscription_id text,
  -- Tenant configuration. Known keys:
  --   ai_paused (boolean)          emergency stop; true => worker must not call
  --                                an LLM or send Discord messages for this tenant
  --   tone, business_hours, brief_template, notification_channel_id
  settings jsonb not null default '{}'::jsonb,
  ai_credits_used integer not null default 0 check (ai_credits_used >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_settings_is_object check (jsonb_typeof(settings) = 'object'),
  constraint tenants_ai_paused_is_boolean check (
    settings -> 'ai_paused' is null
    or jsonb_typeof(settings -> 'ai_paused') = 'boolean'
  )
);

comment on column public.tenants.settings is
  'Tenant config JSON. ai_paused (boolean) is the emergency stop: when true the worker must queue but not process AI/Discord actions. Read it as coalesce((settings->>''ai_paused'')::boolean, false).';

create trigger tenants_set_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tenant_counters + human reference codes (ROB-{seq})
-- ---------------------------------------------------------------------------

create table public.tenant_counters (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  last_seq bigint not null default 0 check (last_seq >= 0),
  updated_at timestamptz not null default now()
);

-- Atomically allocates the next per-tenant sequence number and returns the
-- human reference. The upsert takes a row lock on tenant_counters, so
-- concurrent callers serialize instead of reading the same value.
-- Note: numbers are gap-free per committed transaction; a rolled-back project
-- insert also rolls back its allocation.
create or replace function public.next_reference_code(p_tenant_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_seq bigint;
begin
  insert into public.tenant_counters (tenant_id, last_seq, updated_at)
  values (p_tenant_id, 1, now())
  on conflict (tenant_id) do update
    set last_seq = tenant_counters.last_seq + 1,
        updated_at = now()
  returning last_seq into v_seq;

  return 'ROB-' || v_seq::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- users (studio team members, backed by Supabase Auth)
-- ---------------------------------------------------------------------------

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  display_name text,
  role text not null check (role in ('owner', 'manager', 'designer', 'agent')),
  discord_user_id text,
  created_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create index users_tenant_idx on public.users (tenant_id);

-- ---------------------------------------------------------------------------
-- customers (end clients who commission designs)
-- ---------------------------------------------------------------------------

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  discord_user_id text not null,
  discord_username text,
  display_name text,
  email text,
  total_projects integer not null default 0 check (total_projects >= 0),
  total_spent_robux bigint not null default 0 check (total_spent_robux >= 0),
  notes text,
  created_at timestamptz not null default now(),
  unique (tenant_id, discord_user_id)
);

create index customers_tenant_idx on public.customers (tenant_id);

-- ---------------------------------------------------------------------------
-- projects (commissions)
-- ---------------------------------------------------------------------------

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  reference_code text not null,
  title text,
  status text not null default 'intake' check (status in (
    'intake', 'briefing', 'brief_review', 'in_design',
    'qa_check', 'customer_review', 'revision', 'approved',
    'delivered', 'cancelled', 'on_hold'
  )),
  project_type text check (project_type in (
    'clothing', 'accessory', 'avatar_item', 'game_asset', 'other'
  )),
  deadline timestamptz,
  price_robux bigint check (price_robux is null or price_robux >= 0),
  price_usd numeric(10, 2) check (price_usd is null or price_usd >= 0),
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'partial', 'paid', 'refunded')),
  revision_count integer not null default 0 check (revision_count >= 0),
  max_revisions integer not null default 2 check (max_revisions >= 0),
  assigned_designer_id uuid references public.users(id) on delete set null,
  discord_thread_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, reference_code)
);

comment on column public.projects.reference_code is
  'Human-facing per-tenant reference (ROB-{seq}). Auto-filled by trigger when omitted; service_role may call public.next_reference_code(tenant_id) to pre-allocate explicitly.';

create index projects_tenant_status_idx on public.projects (tenant_id, status);
create index projects_tenant_created_idx on public.projects (tenant_id, created_at desc);
create index projects_customer_idx on public.projects (customer_id);
create index projects_designer_idx on public.projects (tenant_id, assigned_designer_id);

create or replace function public.set_project_reference()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.reference_code is null or btrim(new.reference_code) = '' then
    new.reference_code := public.next_reference_code(new.tenant_id);
  end if;
  return new;
end;
$$;

create trigger projects_set_reference
  before insert on public.projects
  for each row execute function public.set_project_reference();

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- briefs (one per project)
-- ---------------------------------------------------------------------------

create table public.briefs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  raw_conversation_summary text,
  -- Shape mirrors the UI Brief type:
  -- { summary, specs:[{label,value,note}], palette:[{label,hex}],
  --   references:[{id,label,url}], directives }
  structured_data jsonb not null default '{}'::jsonb,
  completeness_score integer not null default 0
    check (completeness_score between 0 and 100),
  approved_by_designer boolean not null default false,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint briefs_structured_data_is_object
    check (jsonb_typeof(structured_data) = 'object')
);

create index briefs_tenant_idx on public.briefs (tenant_id);

create trigger briefs_set_updated_at
  before update on public.briefs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- deliverables
-- ---------------------------------------------------------------------------

create table public.deliverables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  version integer not null default 1 check (version >= 1),
  file_path text not null,
  file_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  -- Who uploaded it (the UI shows this as Deliverable.uploadedBy).
  uploaded_by uuid references public.users(id) on delete set null,
  is_final boolean not null default false,
  qa_status text not null default 'pending'
    check (qa_status in ('pending', 'passed', 'failed', 'skipped')),
  qa_report jsonb,
  sent_to_customer_at timestamptz,
  created_at timestamptz not null default now(),
  constraint deliverables_qa_report_is_object
    check (qa_report is null or jsonb_typeof(qa_report) = 'object')
);

create index deliverables_project_idx on public.deliverables (project_id);
create index deliverables_tenant_idx on public.deliverables (tenant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- conversations (Discord message log)
-- ---------------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  discord_channel_id text not null,
  discord_message_id text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  content text not null,
  author_discord_id text,
  sent_by_agent boolean not null default false,
  agent_id text,
  created_at timestamptz not null default now(),
  -- Duplicate Discord gateway deliveries are no-ops: upsert with
  -- on conflict (tenant_id, discord_message_id) do nothing.
  unique (tenant_id, discord_message_id)
);

create index conversations_tenant_project_created_idx
  on public.conversations (tenant_id, project_id, created_at);
create index conversations_tenant_created_idx
  on public.conversations (tenant_id, created_at desc);
create index conversations_customer_idx on public.conversations (customer_id);

-- ---------------------------------------------------------------------------
-- agent_audit_log (append-only; no UPDATE/DELETE policies in 0002)
-- ---------------------------------------------------------------------------

create table public.agent_audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  agent_name text not null,
  action text not null,
  entity_type text,
  entity_id uuid,
  input_summary text,
  output_summary text,
  model_used text,
  tokens_in integer check (tokens_in is null or tokens_in >= 0),
  tokens_out integer check (tokens_out is null or tokens_out >= 0),
  cost_usd numeric(10, 6) check (cost_usd is null or cost_usd >= 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  status text not null default 'success'
    check (status in ('success', 'failure', 'escalated')),
  error_message text,
  created_at timestamptz not null default now()
);

create index agent_audit_log_tenant_created_idx
  on public.agent_audit_log (tenant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- tasks (designer work items)
-- ---------------------------------------------------------------------------

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  assigned_to uuid references public.users(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'done', 'blocked')),
  due_at timestamptz,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_tenant_status_priority_idx
  on public.tasks (tenant_id, status, priority desc);
create index tasks_tenant_assignee_idx
  on public.tasks (tenant_id, assigned_to, status);
create index tasks_project_idx on public.tasks (project_id);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

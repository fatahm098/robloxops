-- 0017_social_portfolio.sql
-- Portfolio publishing: connect a social account, queue an AI-drafted post when
-- a commission is finished, and publish it after a human approves.
--
-- Publishing always goes through a review queue: the worker drafts, a designer
-- clicks Publish. Nothing is posted to a social network without that click.
--
-- service_role bypasses RLS, so every worker query must filter tenant_id.

-- ---------------------------------------------------------------------------
-- X / Twitter credentials live in Vault; extend the allowed key names.
-- ---------------------------------------------------------------------------

alter table public.tenant_secrets
  drop constraint if exists tenant_secrets_key_name_check;

alter table public.tenant_secrets
  add constraint tenant_secrets_key_name_check check (
    key_name in (
      'LLM_API_KEY',
      'LLM_BASE_URL',
      'DISCORD_BOT_TOKEN',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'RESEND_API_KEY',
      'X_API_KEY',
      'X_API_SECRET',
      'X_ACCESS_TOKEN',
      'X_ACCESS_SECRET'
    )
  );

-- ---------------------------------------------------------------------------
-- Connected accounts (metadata only; tokens stay in Vault)
-- ---------------------------------------------------------------------------

create table if not exists public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  platform text not null default 'x' check (platform in ('x')),
  handle text,
  status text not null default 'disconnected'
    check (status in ('connected', 'disconnected', 'error')),
  last_error text,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, platform)
);

alter table public.social_accounts enable row level security;

drop policy if exists social_accounts_select on public.social_accounts;
create policy social_accounts_select on public.social_accounts
  for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

drop policy if exists social_accounts_insert on public.social_accounts;
create policy social_accounts_insert on public.social_accounts
  for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id()));

drop policy if exists social_accounts_update on public.social_accounts;
create policy social_accounts_update on public.social_accounts
  for update to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

drop trigger if exists social_accounts_set_updated_at on public.social_accounts;
create trigger social_accounts_set_updated_at
  before update on public.social_accounts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Portfolio posts (the review queue)
-- ---------------------------------------------------------------------------

create table if not exists public.portfolio_posts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  platform text not null default 'x' check (platform in ('x')),
  status text not null default 'queued'
    check (status in ('queued', 'publishing', 'published', 'failed', 'rejected')),
  caption text not null default '',
  -- [{ "path": "deliverables/…", "url": "https://…" }]
  media_urls jsonb not null default '[]'::jsonb,
  external_id text,
  external_url text,
  error text,
  approved_by uuid references public.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portfolio_posts_media_is_array
    check (jsonb_typeof(media_urls) = 'array')
);

create index if not exists portfolio_posts_tenant_status_created_idx
  on public.portfolio_posts (tenant_id, status, created_at desc);
create index if not exists portfolio_posts_project_idx
  on public.portfolio_posts (project_id);

-- One live post per project per platform. A rejected draft does not block a
-- future attempt; a published or queued one does.
create unique index if not exists portfolio_posts_active_uidx
  on public.portfolio_posts (tenant_id, project_id, platform)
  where status <> 'rejected' and project_id is not null;

alter table public.portfolio_posts enable row level security;

drop policy if exists portfolio_posts_select on public.portfolio_posts;
create policy portfolio_posts_select on public.portfolio_posts
  for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

drop policy if exists portfolio_posts_update on public.portfolio_posts;
create policy portfolio_posts_update on public.portfolio_posts
  for update to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

-- Inserts come from the worker (service_role); no insert policy on purpose.

drop trigger if exists portfolio_posts_set_updated_at on public.portfolio_posts;
create trigger portfolio_posts_set_updated_at
  before update on public.portfolio_posts
  for each row execute function public.set_updated_at();

comment on table public.social_accounts is
  'Connected social accounts (metadata only: handle + status). Tokens live in Vault as X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_SECRET.';

comment on table public.portfolio_posts is
  'Review queue for portfolio posts. The worker drafts (status=queued); a designer clicks Publish, which sets published and stores external_url. RLS: authenticated users in the tenant may select and update (caption edits).';

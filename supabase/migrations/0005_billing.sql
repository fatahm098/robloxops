-- 0005_billing.sql

-- Optional renewal date for the current plan (set by the Stripe webhook).
alter table public.tenants
  add column if not exists current_period_end timestamptz;

-- Append-only log of Stripe webhook events. Idempotent on stripe_event_id so a
-- redelivered webhook is a no-op.
create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  stripe_event_id text not null unique,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists billing_events_tenant_idx
  on public.billing_events (tenant_id);

alter table public.billing_events enable row level security;

-- Tenant members read their own events; the Stripe webhook writes via the
-- service role, which bypasses RLS.
drop policy if exists billing_events_select on public.billing_events;
create policy billing_events_select on public.billing_events
  for select using (tenant_id = (select public.current_tenant_id()));

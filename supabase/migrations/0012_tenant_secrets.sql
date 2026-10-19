-- 0012_tenant_secrets.sql
-- Per-tenant integration secrets (API keys) backed by Supabase Vault.
--
-- The table stores only metadata plus the last four characters of each secret;
-- the secret value itself lives in vault.secrets and is reachable only through
-- the SECURITY DEFINER functions below. RLS exposes a SELECT policy to
-- `authenticated` (tenant-scoped) and nothing else: writes go through the
-- definer functions, which are granted to service_role only.
--
-- Degradation: on a plain Postgres instance without Supabase Vault the
-- extension cannot be installed. The migration then still creates the table
-- and creates the three functions as stubs that raise
-- 'supabase_vault is not installed'. The worker catches the error and falls
-- back to environment variables, so the app never breaks because of a missing
-- Vault install.

do $$ begin
  create extension if not exists supabase_vault cascade;
exception when others then
  raise notice 'supabase_vault not available: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- Table: metadata only, never the secret value
-- ---------------------------------------------------------------------------

create table if not exists public.tenant_secrets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key_name text not null,
  vault_secret_id uuid,
  last4 text,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint tenant_secrets_tenant_key_name_key unique (tenant_id, key_name),
  constraint tenant_secrets_key_name_check check (
    key_name in (
      'LLM_API_KEY',
      'LLM_BASE_URL',
      'DISCORD_BOT_TOKEN',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'RESEND_API_KEY'
    )
  )
);

alter table public.tenant_secrets enable row level security;

-- Read-only for tenant members; the row holds metadata + last4 only.
drop policy if exists tenant_secrets_select on public.tenant_secrets;
create policy tenant_secrets_select on public.tenant_secrets
  for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

-- No insert/update/delete policies on purpose: writes only through the
-- SECURITY DEFINER functions below (service_role / definer owner).
revoke insert, update, delete on public.tenant_secrets from anon, authenticated;
grant select on public.tenant_secrets to authenticated;

comment on table public.tenant_secrets is
  'Tenant-scoped integration secret metadata (last4 only). Values live in vault.secrets; use public.set_tenant_secret/delete_tenant_secret/get_tenant_secret. On a Postgres without supabase_vault the functions are stubs that raise, and the worker falls back to env vars.';

-- ---------------------------------------------------------------------------
-- Functions: real implementations when Vault is present, stubs otherwise
-- ---------------------------------------------------------------------------

do $migration$
begin
  if to_regclass('vault.secrets') is not null then
    -- set: update the existing vault secret in place, else create + insert
    execute $fn$
      create or replace function public.set_tenant_secret(
        p_tenant_id uuid,
        p_key_name text,
        p_value text,
        p_updated_by uuid
      ) returns void
      language plpgsql
      security definer
      set search_path = ''
      as $body$
      declare
        v_secret_id uuid;
      begin
        select ts.vault_secret_id
          into v_secret_id
          from public.tenant_secrets ts
         where ts.tenant_id = p_tenant_id
           and ts.key_name = p_key_name;

        if v_secret_id is not null then
          perform vault.update_secret(
            v_secret_id,
            p_value,
            'tenant:' || p_tenant_id || ':' || p_key_name
          );
          update public.tenant_secrets
             set last4 = right(p_value, 4),
                 updated_at = now(),
                 updated_by = p_updated_by
           where tenant_id = p_tenant_id
             and key_name = p_key_name;
        else
          v_secret_id := vault.create_secret(
            p_value,
            'tenant:' || p_tenant_id || ':' || p_key_name
          );
          insert into public.tenant_secrets (
            tenant_id, key_name, vault_secret_id, last4, updated_at, updated_by
          )
          values (
            p_tenant_id, p_key_name, v_secret_id, right(p_value, 4), now(), p_updated_by
          )
          on conflict (tenant_id, key_name) do update
            set vault_secret_id = excluded.vault_secret_id,
                last4 = excluded.last4,
                updated_at = now(),
                updated_by = excluded.updated_by;
        end if;
      end;
      $body$;
    $fn$;

    -- delete: drop the metadata row and the vault secret it points at
    execute $fn$
      create or replace function public.delete_tenant_secret(
        p_tenant_id uuid,
        p_key_name text
      ) returns void
      language plpgsql
      security definer
      set search_path = ''
      as $body$
      declare
        v_secret_id uuid;
      begin
        delete from public.tenant_secrets
         where tenant_id = p_tenant_id
           and key_name = p_key_name
        returning vault_secret_id into v_secret_id;

        if v_secret_id is not null then
          delete from vault.secrets where id = v_secret_id;
        end if;
      end;
      $body$;
    $fn$;

    -- get: decrypt on demand; never expose the ciphertext to the app
    execute $fn$
      create or replace function public.get_tenant_secret(
        p_tenant_id uuid,
        p_key_name text
      ) returns text
      language sql
      stable
      security definer
      set search_path = ''
      as $body$
        select ds.decrypted_secret
          from vault.decrypted_secrets ds
          join public.tenant_secrets ts on ts.vault_secret_id = ds.id
         where ts.tenant_id = p_tenant_id
           and ts.key_name = p_key_name
         limit 1;
      $body$;
    $fn$;
  else
    -- No Vault: keep the API shape so the app can call the functions and
    -- catch the error to fall back to environment variables.
    execute $fn$
      create or replace function public.set_tenant_secret(
        p_tenant_id uuid,
        p_key_name text,
        p_value text,
        p_updated_by uuid
      ) returns void
      language plpgsql
      security definer
      set search_path = ''
      as $body$
      begin
        raise exception 'supabase_vault is not installed';
      end;
      $body$;
    $fn$;

    execute $fn$
      create or replace function public.delete_tenant_secret(
        p_tenant_id uuid,
        p_key_name text
      ) returns void
      language plpgsql
      security definer
      set search_path = ''
      as $body$
      begin
        raise exception 'supabase_vault is not installed';
      end;
      $body$;
    $fn$;

    execute $fn$
      create or replace function public.get_tenant_secret(
        p_tenant_id uuid,
        p_key_name text
      ) returns text
      language plpgsql
      security definer
      set search_path = ''
      as $body$
      begin
        raise exception 'supabase_vault is not installed';
      end;
      $body$;
    $fn$;
  end if;
end
$migration$;

-- ---------------------------------------------------------------------------
-- Privileges: only the service role may execute the secret functions
-- ---------------------------------------------------------------------------

revoke all on function public.set_tenant_secret(uuid, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.delete_tenant_secret(uuid, text)
  from public, anon, authenticated;
revoke all on function public.get_tenant_secret(uuid, text)
  from public, anon, authenticated;

grant execute on function public.set_tenant_secret(uuid, text, text, uuid) to service_role;
grant execute on function public.delete_tenant_secret(uuid, text) to service_role;
grant execute on function public.get_tenant_secret(uuid, text) to service_role;

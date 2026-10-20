-- 0018_tenant_claim_app_metadata.sql
-- Resolve the tenant claim from `app_metadata` as well as the top level.
--
-- `provision_tenant` stamps `raw_app_meta_data.tenant_id`, and Supabase exposes
-- that object in the JWT as `app_metadata`. Hosted projects only promote a
-- claim to the top level through a custom access-token hook, which is not
-- configured by default — so without this fallback every RLS policy returned
-- zero rows for a freshly provisioned tenant.
--
-- `app_metadata` can only be written with the service role, so it is a safe
-- authorization source (unlike `user_metadata`).

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
as $$
  select case
    when (auth.jwt() ->> 'tenant_id')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (auth.jwt() ->> 'tenant_id')::uuid
    when (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    else null
  end;
$$;

comment on function public.current_tenant_id() is
  'Tenant id from the JWT: top-level tenant_id claim, falling back to app_metadata.tenant_id (written by provision_tenant). Returns NULL instead of raising on a malformed claim.';

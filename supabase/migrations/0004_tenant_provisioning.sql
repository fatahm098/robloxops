-- 0004_tenant_provisioning.sql
-- Self-serve provisioning for a freshly signed-up studio owner.
--
-- Called by the authenticated user immediately after signUp (email confirmation
-- is typically disabled in local/dev). SECURITY DEFINER lets the function:
--   * read auth.uid() / auth.email of the caller, and
--   * write the `tenant_id` custom claim into auth.users.raw_app_meta_data,
--     which is exactly what public.current_tenant_id() (RLS) reads.
-- The alternative is a Supabase Auth post-confirm hook that mirrors the same
-- users row + claim; the RPC is kept for direct/testing use.

create or replace function public.provision_tenant(
  p_studio_name text,
  p_slug text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_tenant_id uuid;
  v_slug text := lower(regexp_replace(trim(coalesce(p_slug, '')), '[^a-z0-9]+', '-', 'g'));
  v_base_slug text := v_slug;
  v_suffix int := 1;
begin
  if v_user_id is null then
    raise exception 'provision_tenant requires an authenticated caller';
  end if;

  if v_slug is null or length(v_slug) = 0 then
    v_slug := 'studio-' || substring(v_user_id::text, 1, 8);
  end if;

  -- resolve a unique slug, appending -2, -3, ... on collision
  while exists (select 1 from public.tenants where slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix::text;
  end loop;

  select email into v_email from auth.users where id = v_user_id;

  insert into public.tenants (name, slug, plan_id)
  values (trim(p_studio_name), v_slug, 'starter')
  returning id into v_tenant_id;

  insert into public.users (id, tenant_id, email, role)
  values (v_user_id, v_tenant_id, coalesce(v_email, ''), 'owner');

  -- custom claim consumed by RLS (current_tenant_id)
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                          || jsonb_build_object('tenant_id', v_tenant_id::text)
  where id = v_user_id;

  return v_tenant_id;
end;
$$;

grant execute on function public.provision_tenant(text, text) to authenticated;
comment on function public.provision_tenant(text, text) is
  'Creates a tenant + owner users row for the caller and stamps the tenant_id claim.';

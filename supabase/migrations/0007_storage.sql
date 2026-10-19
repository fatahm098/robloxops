-- RobloxOps — Supabase Storage bucket for deliverables.
--
-- Private bucket; path convention `tenants/{tenant_id}/deliverables/...`.
-- The web app mints signed upload/download URLs with the service role, but the
-- policies below let an authenticated tenant member read/write only their own
-- tenant prefix, so the storage layer matches the RLS model of every table.

insert into storage.buckets (id, name, public)
values ('deliverables', 'deliverables', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Policies (idempotent: drop then create)
-- ---------------------------------------------------------------------------

drop policy if exists "deliverables_objects_select" on storage.objects;
create policy "deliverables_objects_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'deliverables'
    and (storage.foldername(name))[1] = 'tenants'
    and (storage.foldername(name))[2] = (select public.current_tenant_id())::text
  );

drop policy if exists "deliverables_objects_insert" on storage.objects;
create policy "deliverables_objects_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'deliverables'
    and (storage.foldername(name))[1] = 'tenants'
    and (storage.foldername(name))[2] = (select public.current_tenant_id())::text
  );

drop policy if exists "deliverables_objects_update" on storage.objects;
create policy "deliverables_objects_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'deliverables'
    and (storage.foldername(name))[1] = 'tenants'
    and (storage.foldername(name))[2] = (select public.current_tenant_id())::text
  )
  with check (
    bucket_id = 'deliverables'
    and (storage.foldername(name))[1] = 'tenants'
    and (storage.foldername(name))[2] = (select public.current_tenant_id())::text
  );

drop policy if exists "deliverables_objects_delete" on storage.objects;
create policy "deliverables_objects_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'deliverables'
    and (storage.foldername(name))[1] = 'tenants'
    and (storage.foldername(name))[2] = (select public.current_tenant_id())::text
  );

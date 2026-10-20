-- 0015_realtime_publication.sql
-- Add the dashboard's live tables to Supabase Realtime so the web client can
-- subscribe to `postgres_changes` and refresh. Guarded with IF NOT EXISTS so it
-- is safe to re-run or to apply on a project where a table is already published.
-- RLS still applies to Realtime: authenticated clients only receive rows they
-- are allowed to select, and the client only uses the signal to call refresh().

do $$
declare
  realtime_pub_exists boolean;
  target_table text;
  already_published boolean;
begin
  select exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) into realtime_pub_exists;

  if realtime_pub_exists then
    foreach target_table in array array['projects', 'tasks', 'outbound_messages', 'notifications']
    loop
      select exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = target_table
      ) into already_published;

      if not already_published then
        execute format('alter publication supabase_realtime add table public.%I', target_table);
      end if;
    end loop;
  end if;
end
$$;

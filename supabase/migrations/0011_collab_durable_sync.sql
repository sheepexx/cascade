-- Durable collaboration updates.
--
-- Broadcast remains the low-latency path, but project snapshots and asset
-- changes also travel through Postgres Changes. This lets reconnecting clients
-- catch up even if a WebSocket broadcast was missed.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'projects'
  ) then
    alter publication supabase_realtime add table public.projects;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'project_assets'
  ) then
    alter publication supabase_realtime add table public.project_assets;
  end if;
end $$;

-- Full old rows make filtered DELETE events for replaced assets useful to
-- authorized subscribers.
alter table public.projects replica identity full;
alter table public.project_assets replica identity full;

-- Verify: both rows should be returned after running this migration.
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in ('projects', 'project_assets')
order by tablename;

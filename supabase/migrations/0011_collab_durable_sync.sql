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

-- The durable Postgres Changes listener uses its own private topic so a missing
-- publication cannot interrupt low-latency Broadcast/Presence. Authorize that
-- topic with the same project membership check as the main project channel.
drop policy if exists "collab read project channel" on realtime.messages;
create policy "collab read project channel" on realtime.messages
  for select to authenticated using (
    (
      realtime.topic() like 'project:%'
      and public.can_view_project(split_part(realtime.topic(), ':', 2)::uuid)
    )
    or (
      realtime.topic() like 'project-sync:%'
      and public.can_view_project(split_part(realtime.topic(), ':', 2)::uuid)
    )
  );

drop policy if exists "collab send project channel" on realtime.messages;
create policy "collab send project channel" on realtime.messages
  for insert to authenticated with check (
    (
      realtime.topic() like 'project:%'
      and public.can_view_project(split_part(realtime.topic(), ':', 2)::uuid)
    )
    or (
      realtime.topic() like 'project-sync:%'
      and public.can_view_project(split_part(realtime.topic(), ':', 2)::uuid)
    )
  );

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

-- Idempotent re-apply of the Realtime-enabling pieces of 0003, plus a
-- verification query. Run this whole file in the Supabase SQL editor.
--
-- Symptom it fixes: cloud save/load + invites work (public-table RLS is in
-- effect) but NOTHING syncs live — note ops, presence, and comment updates
-- never reach collaborators. That means Postgres-changes replication and/or the
-- realtime.messages authorization policies for the private `project:<uuid>`
-- channels never took effect.

-- ---------------------------------------------------------------------------
-- 1) Postgres Changes: the tables must belong to the supabase_realtime
--    publication. Guarded so re-running can't error with "already member".
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'comments'
  ) then
    alter publication supabase_realtime add table public.comments;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'project_collaborators'
  ) then
    alter publication supabase_realtime add table public.project_collaborators;
  end if;
end $$;

-- DELETE events over Postgres Changes only carry the row's identity columns
-- unless REPLICA IDENTITY FULL is set. We reload on any change, but FULL makes
-- RLS evaluation on deletes reliable.
alter table public.comments replica identity full;

-- ---------------------------------------------------------------------------
-- 2) Broadcast + Presence on private "project:<uuid>" channels: authorized via
--    RLS on realtime.messages. Receiving needs SELECT, sending needs INSERT.
-- ---------------------------------------------------------------------------
do $$ begin
  alter table realtime.messages enable row level security;
exception when others then
  -- Already enabled, or not owner — safe to ignore; policies are what matter.
  null;
end $$;

drop policy if exists "collab read project channel" on realtime.messages;
create policy "collab read project channel" on realtime.messages
  for select to authenticated using (
    realtime.topic() like 'project:%'
    and public.can_view_project(split_part(realtime.topic(), ':', 2)::uuid)
  );

drop policy if exists "collab send project channel" on realtime.messages;
create policy "collab send project channel" on realtime.messages
  for insert to authenticated with check (
    realtime.topic() like 'project:%'
    and public.can_view_project(split_part(realtime.topic(), ':', 2)::uuid)
  );

-- ---------------------------------------------------------------------------
-- 3) Verify — this SELECT should return FOUR rows:
--      publication | comments
--      publication | project_collaborators
--      policy      | collab read project channel
--      policy      | collab send project channel
--    If any are missing, live sync can't work.
-- ---------------------------------------------------------------------------
select 'publication' as kind, tablename as name
  from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public'
    and tablename in ('comments', 'project_collaborators')
union all
select 'policy', policyname
  from pg_policies
  where schemaname = 'realtime' and tablename = 'messages'
    and policyname like 'collab %'
order by kind, name;

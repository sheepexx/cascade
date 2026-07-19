-- Feature flags / kill switches.
--
-- Lets an admin disable a feature for every client without a redeploy (e.g.
-- shut off collab during a Supabase incident). The client fails OPEN: if this
-- table is missing, unreachable, or the app runs without Supabase env vars,
-- every feature stays enabled, so self-hosted and offline installs are never
-- affected.

create table if not exists public.feature_flags (
  key         text primary key,
  enabled     boolean not null default true,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.users(id) on delete set null
);

alter table public.feature_flags enable row level security;

-- Everyone (including anonymous visitors) may read kill-switch state; writes
-- only happen through the admin-guarded RPC below.
drop policy if exists feature_flags_select_all on public.feature_flags;
create policy feature_flags_select_all on public.feature_flags
  for select to anon, authenticated using (true);

grant select on public.feature_flags to anon, authenticated;

create or replace function public.set_feature_flag(
  p_key text,
  p_enabled boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin access required';
  end if;
  update public.feature_flags
    set enabled = p_enabled,
        updated_at = now(),
        updated_by = auth.uid()
    where key = p_key;
  if not found then
    raise exception 'unknown feature flag "%"', p_key;
  end if;
end;
$$;

grant execute on function public.set_feature_flag(text, boolean)
  to authenticated;

insert into public.feature_flags (key, enabled, description) values
  ('cloud_accounts', true, 'osu! sign-in, cloud saves and My Maps'),
  ('collab', true, 'Inviting collaborators to shared maps'),
  ('preset_publishing', true, 'Publishing patterns to the preset library'),
  ('beatmap_import', true, 'Importing beatmaps from osu! by ID or link'),
  ('sv_tools', true, 'The SV editor for scroll velocity effects'),
  ('playtest', true, 'Playtest mode (F5)')
on conflict (key) do nothing;

-- Realtime so open editors react to a kill switch within seconds.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'feature_flags'
  ) then
    alter publication supabase_realtime add table public.feature_flags;
  end if;
end $$;

alter table public.feature_flags replica identity full;

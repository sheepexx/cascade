-- ---------------------------------------------------------------------------
-- Public map pages (/m/<slug>).
--
-- Deliberately a separate table rather than a "public" flag on projects: the
-- projects table holds every user's unpublished work, and nothing about its
-- exposure changes here. Publishing copies a snapshot of the chart plus its
-- audio/background into a public bucket, so a shared page never reads from
-- private storage.
-- ---------------------------------------------------------------------------

create table if not exists public.shared_maps (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  project_id   uuid references public.projects(id) on delete set null,
  owner        uuid not null references public.users(id) on delete cascade,
  title        text not null default 'Untitled',
  artist       text not null default '',
  creator      text not null default '',
  -- Snapshot of { meta, timingPoints, difficulties } at publish time.
  data         jsonb not null,
  audio_path   text,
  bg_path      text,
  card_path    text,
  key_counts   smallint[] not null default '{}',
  star_rating  numeric(5,2),
  length_ms    integer,
  bpm          numeric(7,2),
  note_count   integer not null default 0,
  views        integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists shared_maps_owner_idx on public.shared_maps(owner);
create index if not exists shared_maps_created_idx on public.shared_maps(created_at desc);

alter table public.shared_maps enable row level security;

-- Anyone, signed in or not, may read a shared map. That is the point.
drop policy if exists shared_maps_select on public.shared_maps;
create policy shared_maps_select on public.shared_maps
  for select using (true);

-- Only the owner of the underlying project may publish it.
drop policy if exists shared_maps_insert on public.shared_maps;
create policy shared_maps_insert on public.shared_maps
  for insert with check (
    owner = auth.uid()
    and (
      project_id is null
      or exists (
        select 1 from public.projects p
        where p.id = project_id and p.owner = auth.uid()
      )
    )
  );

drop policy if exists shared_maps_update on public.shared_maps;
create policy shared_maps_update on public.shared_maps
  for update using (owner = auth.uid() or public.is_admin())
  with check (owner = auth.uid() or public.is_admin());

drop policy if exists shared_maps_delete on public.shared_maps;
create policy shared_maps_delete on public.shared_maps
  for delete using (owner = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Public 'shared' bucket. Objects are namespaced by owner id as the first
-- path segment ("<users.id>/<slug>/<file>"), matching the private 'maps'
-- bucket, so writers only ever touch their own folder. Reads are open.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('shared', 'shared', true)
on conflict (id) do nothing;

drop policy if exists shared_objects_read on storage.objects;
create policy shared_objects_read on storage.objects
  for select using (bucket_id = 'shared');

drop policy if exists shared_objects_write on storage.objects;
create policy shared_objects_write on storage.objects
  for insert with check (
    bucket_id = 'shared'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists shared_objects_modify on storage.objects;
create policy shared_objects_modify on storage.objects
  for update using (
    bucket_id = 'shared'
    and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  ) with check (
    bucket_id = 'shared'
    and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );

drop policy if exists shared_objects_delete on storage.objects;
create policy shared_objects_delete on storage.objects
  for delete using (
    bucket_id = 'shared'
    and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );

-- ---------------------------------------------------------------------------
-- View counter. Anonymous visitors must not hold UPDATE on the table, so the
-- bump goes through a SECURITY DEFINER function that can only ever increment.
-- ---------------------------------------------------------------------------

create or replace function public.bump_shared_map_view(p_slug text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.shared_maps
     set views = views + 1
   where slug = p_slug;
$$;

grant execute on function public.bump_shared_map_view(text) to anon, authenticated;

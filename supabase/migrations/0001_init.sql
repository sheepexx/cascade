-- osu-mania-editor: accounts, cloud maps, presets, admin.
--
-- Auth model: there is NO Supabase Auth user. A Cloudflare Worker handles osu!
-- OAuth and mints a Supabase-compatible JWT (HS256, signed with the project's
-- JWT secret) whose `sub` claim is a row id from `public.users`. Therefore
-- `auth.uid()` below resolves to `users.id`, and we do NOT reference
-- `auth.users`. Run this in the Supabase SQL editor (or via the CLI).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.users (
  id          uuid primary key default gen_random_uuid(),
  osu_id      bigint unique not null,
  username    text not null,
  avatar_url  text,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null references public.users(id) on delete cascade,
  title       text not null default 'Untitled',
  artist      text not null default '',
  creator     text not null default '',
  -- The editable chart: { meta, timingPoints, difficulties, activeId, view,
  -- bgScope }. Mirrors the client SavedProject minus the binary blobs (those
  -- live in Storage and are tracked in project_assets).
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists projects_owner_idx on public.projects(owner);

-- One Storage object per audio / background file referenced by a project.
-- Uploads are de-duplicated per owner by sha256 (the storage_path embeds the
-- hash), so re-saving the same audio doesn't re-upload it.
create table if not exists public.project_assets (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  kind          text not null check (kind in ('audio','bg')),
  filename      text not null,
  storage_path  text not null,
  sha256        text not null,
  bytes         bigint not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists project_assets_project_idx
  on public.project_assets(project_id);

create table if not exists public.presets (
  id           uuid primary key default gen_random_uuid(),
  author       uuid not null references public.users(id) on delete cascade,
  name         text not null,
  key_count    int not null check (key_count between 1 and 18),
  description  text not null default '',
  -- The pattern: an array of notes normalized so the earliest starts at t=0,
  -- columns absolute. Matches the editor's clipboard `Clip.notes` shape.
  pattern      jsonb not null,
  tags         text[] not null default '{}',
  is_public    boolean not null default true,
  status       text not null default 'pending'
                 check (status in ('pending','approved','rejected')),
  created_at   timestamptz not null default now()
);

create index if not exists presets_status_key_idx
  on public.presets(status, key_count);
create index if not exists presets_author_idx on public.presets(author);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Is the caller (auth.uid()) an admin? SECURITY DEFINER so it can read the
-- users table regardless of RLS, avoiding recursive policy evaluation.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select u.is_admin from public.users u where u.id = auth.uid()),
    false
  );
$$;

-- keep updated_at fresh on projects
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.users          enable row level security;
alter table public.projects       enable row level security;
alter table public.project_assets enable row level security;
alter table public.presets        enable row level security;

-- users: read self or (admin) anyone. Writes happen via the Worker's
-- service-role key (which bypasses RLS), except an admin may flip is_admin.
drop policy if exists users_select on public.users;
create policy users_select on public.users
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists users_admin_update on public.users;
create policy users_admin_update on public.users
  for update using (public.is_admin()) with check (public.is_admin());

-- projects: owner full CRUD; admin everything.
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select using (owner = auth.uid() or public.is_admin());

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects
  for insert with check (owner = auth.uid());

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects
  for update using (owner = auth.uid() or public.is_admin())
  with check (owner = auth.uid() or public.is_admin());

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects
  for delete using (owner = auth.uid() or public.is_admin());

-- project_assets: gated through ownership of the parent project.
drop policy if exists project_assets_all on public.project_assets;
create policy project_assets_all on public.project_assets
  for all using (
    public.is_admin() or exists (
      select 1 from public.projects p
      where p.id = project_assets.project_id and p.owner = auth.uid()
    )
  ) with check (
    public.is_admin() or exists (
      select 1 from public.projects p
      where p.id = project_assets.project_id and p.owner = auth.uid()
    )
  );

-- presets: everyone sees approved; authors see their own; admins see all.
drop policy if exists presets_select on public.presets;
create policy presets_select on public.presets
  for select using (
    status = 'approved' or author = auth.uid() or public.is_admin()
  );

-- New presets always land as 'pending' unless an admin creates them. Enforced
-- in the WITH CHECK: non-admins can only insert their own, pending rows.
drop policy if exists presets_insert on public.presets;
create policy presets_insert on public.presets
  for insert with check (
    author = auth.uid()
    and (public.is_admin() or status = 'pending')
  );

-- Authors may edit their own preset but may NOT self-approve: a non-admin
-- update must leave status = 'pending'. Admins may set any status.
drop policy if exists presets_update on public.presets;
create policy presets_update on public.presets
  for update using (author = auth.uid() or public.is_admin())
  with check (
    public.is_admin()
    or (author = auth.uid() and status = 'pending')
  );

drop policy if exists presets_delete on public.presets;
create policy presets_delete on public.presets
  for delete using (author = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage: private 'maps' bucket. Objects are namespaced by owner id as the
-- first path segment ("<users.id>/<sha256>.<ext>") so users only touch their
-- own folder.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('maps', 'maps', false)
on conflict (id) do nothing;

drop policy if exists maps_objects_all on storage.objects;
create policy maps_objects_all on storage.objects
  for all using (
    bucket_id = 'maps'
    and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  ) with check (
    bucket_id = 'maps'
    and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );

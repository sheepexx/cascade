-- Realtime co-op editing + timestamp comments.
--
-- Adds a collaborators list (editor/viewer roles), a comments table, the RLS
-- helpers + policies that let collaborators view/edit a project, an RPC to
-- invite by osu! username, Realtime channel authorization, and a project-scoped
-- storage policy so collaborators can read a map's audio/background.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.project_collaborators (
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     uuid not null references public.users(id)   on delete cascade,
  role        text not null check (role in ('editor','viewer')),
  invited_by  uuid references public.users(id),
  created_at  timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_collaborators_user_idx
  on public.project_collaborators(user_id);

create table if not exists public.comments (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  difficulty_id  text,                       -- which diff it's about (null = general)
  author         uuid not null references public.users(id) on delete cascade,
  author_username text,
  author_osu_id   bigint,
  time_ms        integer not null,           -- anchor timestamp in the song
  body           text not null,
  parent_id      uuid references public.comments(id) on delete cascade,  -- thread root
  resolved       boolean not null default false,
  created_at     timestamptz not null default now()
);

create index if not exists comments_project_idx on public.comments(project_id);

-- ---------------------------------------------------------------------------
-- Access helpers (security definer → no recursive RLS)
-- ---------------------------------------------------------------------------

create or replace function public.can_view_project(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    public.is_admin()
    or exists (select 1 from public.projects p where p.id = pid and p.owner = auth.uid())
    or exists (
      select 1 from public.project_collaborators c
      where c.project_id = pid and c.user_id = auth.uid()
    );
$$;

create or replace function public.can_edit_project(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    public.is_admin()
    or exists (select 1 from public.projects p where p.id = pid and p.owner = auth.uid())
    or exists (
      select 1 from public.project_collaborators c
      where c.project_id = pid and c.user_id = auth.uid() and c.role = 'editor'
    );
$$;

-- ---------------------------------------------------------------------------
-- Widen project / asset RLS to collaborators
-- ---------------------------------------------------------------------------

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select using (public.can_view_project(id));

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects
  for update using (public.can_edit_project(id))
  with check (public.can_edit_project(id));
-- (projects_insert / projects_delete from 0001 stay owner/admin-only.)

drop policy if exists project_assets_all on public.project_assets;
drop policy if exists project_assets_select on public.project_assets;
create policy project_assets_select on public.project_assets
  for select using (public.can_view_project(project_id));
drop policy if exists project_assets_write on public.project_assets;
create policy project_assets_write on public.project_assets
  for all using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id));

-- ---------------------------------------------------------------------------
-- project_collaborators RLS
-- ---------------------------------------------------------------------------

alter table public.project_collaborators enable row level security;

-- Owner/admin see all rows for their project; a user can see their own row.
drop policy if exists collaborators_select on public.project_collaborators;
create policy collaborators_select on public.project_collaborators
  for select using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.projects p
               where p.id = project_id and p.owner = auth.uid())
  );

-- Only the project owner (or admin) manages the list. Inserts also go through
-- the add_collaborator RPC, but these cover direct setRole / remove calls.
drop policy if exists collaborators_write on public.project_collaborators;
create policy collaborators_write on public.project_collaborators
  for all using (
    public.is_admin()
    or exists (select 1 from public.projects p
               where p.id = project_id and p.owner = auth.uid())
  ) with check (
    public.is_admin()
    or exists (select 1 from public.projects p
               where p.id = project_id and p.owner = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- comments RLS
-- ---------------------------------------------------------------------------

alter table public.comments enable row level security;

drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments
  for select using (public.can_view_project(project_id));

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
  for insert with check (author = auth.uid() and public.can_view_project(project_id));

-- Author edits/deletes own; editors/owner can resolve or remove any.
drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments
  for update using (author = auth.uid() or public.can_edit_project(project_id))
  with check (author = auth.uid() or public.can_edit_project(project_id));

drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments
  for delete using (author = auth.uid() or public.can_edit_project(project_id));

-- ---------------------------------------------------------------------------
-- Invite-by-username RPC
-- ---------------------------------------------------------------------------

create or replace function public.add_collaborator(
  p_project uuid, p_username text, p_role text
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_user  public.users;
begin
  if p_role not in ('editor','viewer') then
    raise exception 'invalid role';
  end if;
  select owner into v_owner from public.projects where id = p_project;
  if v_owner is null then
    raise exception 'project not found';
  end if;
  if v_owner <> auth.uid() and not public.is_admin() then
    raise exception 'only the project owner can invite collaborators';
  end if;
  select * into v_user from public.users
    where lower(username) = lower(p_username) limit 1;
  if v_user.id is null then
    raise exception 'No user "%". They must sign in to the editor at least once first.', p_username;
  end if;
  if v_user.id = v_owner then
    raise exception 'The owner is already on this map.';
  end if;
  insert into public.project_collaborators (project_id, user_id, role, invited_by)
    values (p_project, v_user.id, p_role, auth.uid())
    on conflict (project_id, user_id) do update set role = excluded.role;
  return json_build_object(
    'user_id', v_user.id, 'username', v_user.username,
    'avatar_url', v_user.avatar_url, 'role', p_role
  );
end;
$$;

grant execute on function public.add_collaborator(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: live updates for comments + collaborator changes
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.project_collaborators;

-- ---------------------------------------------------------------------------
-- Realtime channel authorization (private "project:<uuid>" channels).
-- Both receive and send are gated on viewing the project; note-edit rights are
-- enforced in the app + by projects_update RLS on the persisted snapshot, so
-- viewers may still send presence on the channel.
-- ---------------------------------------------------------------------------

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
-- Storage: let collaborators read assets stored under "<projectId>/...".
-- (Legacy "<ownerId>/..." objects stay covered by maps_objects_all from 0001.)
-- ---------------------------------------------------------------------------

drop policy if exists maps_objects_project_select on storage.objects;
create policy maps_objects_project_select on storage.objects
  for select using (
    bucket_id = 'maps'
    and public.can_view_project(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists maps_objects_project_write on storage.objects;
create policy maps_objects_project_write on storage.objects
  for all using (
    bucket_id = 'maps'
    and public.can_edit_project(((storage.foldername(name))[1])::uuid)
  ) with check (
    bucket_id = 'maps'
    and public.can_edit_project(((storage.foldername(name))[1])::uuid)
  );

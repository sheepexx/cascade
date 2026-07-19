-- Persistent user notification inbox.
--
-- Invitations used to exist only as Realtime events. A user who was offline
-- when project_collaborators was inserted therefore never saw the invite
-- notification. Store invites durably, expose only the recipient's rows, and
-- provide an admin-only app-update publisher for future release notices.

create table if not exists public.notifications (
  id               uuid primary key default gen_random_uuid(),
  recipient        uuid not null references public.users(id) on delete cascade,
  kind             text not null check (kind in ('invite', 'app_update', 'system')),
  title            text not null,
  body             text,
  project_id       uuid references public.projects(id) on delete set null,
  actor             uuid references public.users(id) on delete set null,
  actor_username   text,
  actor_avatar_url text,
  action_url       text,
  dedupe_key       text,
  read_at          timestamptz,
  dismissed_at     timestamptz,
  created_at       timestamptz not null default now(),
  unique (recipient, dedupe_key)
);

create index if not exists notifications_recipient_created_idx
  on public.notifications(recipient, created_at desc);

create index if not exists notifications_recipient_unread_idx
  on public.notifications(recipient, created_at desc)
  where read_at is null and dismissed_at is null;

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated using (recipient = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated using (recipient = auth.uid())
  with check (recipient = auth.uid());

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
  for delete to authenticated using (recipient = auth.uid());

grant select, update, delete on public.notifications to authenticated;
revoke insert on public.notifications from anon, authenticated;

-- Create or revive one durable inbox item for a project invitation. Actor
-- details and project title are snapshotted so the recipient can render the
-- notice without needing permission to read somebody else's users row.
create or replace function public.create_project_invite_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_title text;
  v_project_owner uuid;
  v_actor uuid;
  v_actor_username text;
  v_actor_avatar_url text;
begin
  select p.title, p.owner
    into v_project_title, v_project_owner
    from public.projects p
    where p.id = new.project_id;

  v_actor := coalesce(new.invited_by, v_project_owner);
  select u.username, u.avatar_url
    into v_actor_username, v_actor_avatar_url
    from public.users u
    where u.id = v_actor;

  insert into public.notifications (
    recipient,
    kind,
    title,
    body,
    project_id,
    actor,
    actor_username,
    actor_avatar_url,
    dedupe_key,
    created_at
  ) values (
    new.user_id,
    'invite',
    'Mapping invitation',
    coalesce(v_actor_username, 'Someone') || ' invited you to ' ||
      coalesce(nullif(v_project_title, ''), 'Untitled') || '.',
    new.project_id,
    v_actor,
    v_actor_username,
    v_actor_avatar_url,
    'invite:' || new.project_id::text,
    new.created_at
  )
  on conflict (recipient, dedupe_key) do update set
    kind = excluded.kind,
    title = excluded.title,
    body = excluded.body,
    project_id = excluded.project_id,
    actor = excluded.actor,
    actor_username = excluded.actor_username,
    actor_avatar_url = excluded.actor_avatar_url,
    action_url = null,
    read_at = null,
    dismissed_at = null,
    created_at = excluded.created_at;

  return new;
end;
$$;

drop trigger if exists project_invite_notification on public.project_collaborators;
create trigger project_invite_notification
  after insert or update of created_at on public.project_collaborators
  for each row execute function public.create_project_invite_notification();

-- Removing somebody's access also retires any now-stale invite action.
create or replace function public.dismiss_removed_project_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications
    set dismissed_at = coalesce(dismissed_at, now()),
        read_at = coalesce(read_at, now())
    where recipient = old.user_id
      and dedupe_key = 'invite:' || old.project_id::text;
  return old;
end;
$$;

drop trigger if exists project_invite_notification_removed
  on public.project_collaborators;
create trigger project_invite_notification_removed
  after delete on public.project_collaborators
  for each row execute function public.dismiss_removed_project_invite();

-- Re-inviting an existing or archived collaborator should create a fresh
-- unread notification. Updating created_at deliberately fires the trigger;
-- ordinary role changes do not.
create or replace function public.add_collaborator(
  p_project uuid, p_username text, p_role text
) returns json
language plpgsql
security definer
set search_path = public
as $$
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
  insert into public.project_collaborators (
    project_id, user_id, role, invited_by, archived, created_at
  ) values (
    p_project, v_user.id, p_role, auth.uid(), false, clock_timestamp()
  )
  on conflict (project_id, user_id) do update set
    role = excluded.role,
    invited_by = excluded.invited_by,
    archived = false,
    created_at = excluded.created_at;
  return json_build_object(
    'user_id', v_user.id, 'username', v_user.username,
    'avatar_url', v_user.avatar_url, 'role', p_role
  );
end;
$$;

grant execute on function public.add_collaborator(uuid, text, text)
  to authenticated;

-- Admins can publish a release/update notice to every existing account. A
-- version makes publishing idempotent; omitting it intentionally creates a new
-- announcement every time.
create or replace function public.publish_app_update(
  p_title text,
  p_body text,
  p_version text default null,
  p_action_url text default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_dedupe_key text;
begin
  if not public.is_admin() then
    raise exception 'admin access required';
  end if;
  if nullif(trim(p_title), '') is null then
    raise exception 'title is required';
  end if;
  if nullif(trim(p_action_url), '') is not null
     and trim(p_action_url) !~* '^https?://' then
    raise exception 'action URL must start with http:// or https://';
  end if;

  v_dedupe_key := 'app-update:' || coalesce(
    nullif(trim(p_version), ''),
    gen_random_uuid()::text
  );

  insert into public.notifications (
    recipient,
    kind,
    title,
    body,
    action_url,
    dedupe_key
  )
  select
    u.id,
    'app_update',
    trim(p_title),
    nullif(trim(p_body), ''),
    nullif(trim(p_action_url), ''),
    v_dedupe_key
  from public.users u
  on conflict (recipient, dedupe_key) do update set
    title = excluded.title,
    body = excluded.body,
    action_url = excluded.action_url,
    read_at = null,
    dismissed_at = null,
    created_at = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.publish_app_update(text, text, text, text)
  to authenticated;

-- Existing active collaborations become inbox items too, covering invitations
-- that were sent while the recipient was offline before this migration landed.
insert into public.notifications (
  recipient,
  kind,
  title,
  body,
  project_id,
  actor,
  actor_username,
  actor_avatar_url,
  dedupe_key,
  created_at
)
select
  c.user_id,
  'invite',
  'Mapping invitation',
  coalesce(u.username, 'Someone') || ' invited you to ' ||
    coalesce(nullif(p.title, ''), 'Untitled') || '.',
  c.project_id,
  coalesce(c.invited_by, p.owner),
  u.username,
  u.avatar_url,
  'invite:' || c.project_id::text,
  c.created_at
from public.project_collaborators c
join public.projects p on p.id = c.project_id
left join public.users u on u.id = coalesce(c.invited_by, p.owner)
where not c.archived
on conflict (recipient, dedupe_key) do nothing;

-- Realtime keeps an open inbox in sync. The table itself remains durable and
-- is fetched again on login/focus, so missed WebSocket events are harmless.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

alter table public.notifications replica identity full;

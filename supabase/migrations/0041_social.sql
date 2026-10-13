-- Profiles, friends, blocking, private messages and presence.
--
-- Every account already exists in public.users (osu! OAuth through the
-- Worker), so this adds no second identity: everything below keys on
-- users.id, which never changes, and treats the username only as a way to
-- find someone. Other people's rows in public.users stay unreadable; profiles,
-- search and friend lists come out of SECURITY DEFINER functions that apply
-- each person's privacy settings and blocks for the caller, so the rules hold
-- whatever the app shows or hides.
--
-- Privacy levels are 'everyone', 'friends' or 'nobody' (only the account
-- itself). Blocking works both ways: neither person can befriend or message
-- the other, and the blocked person sees nothing of the blocker beyond what
-- osu! itself shows publicly.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- Accounts: country from osu!, and a summary of public osu! data
-- ---------------------------------------------------------------------------

alter table public.users
  add column if not exists country_code text;

alter table public.users
  drop constraint if exists users_country_code_check;
alter table public.users
  add constraint users_country_code_check
  check (country_code is null or country_code ~ '^[A-Z]{2}$');

create index if not exists users_username_lower_idx
  on public.users (lower(username));

-- The Worker writes this when it fetches someone's osu! profile, so search
-- results and friend lists can show a country and mapping counts without
-- asking osu! again for every row. It only ever holds what osu! shows on a
-- public profile.
create table if not exists public.osu_profile_cache (
  user_id          uuid primary key references public.users(id) on delete cascade,
  osu_id           bigint not null,
  country_code     text,
  country_name     text,
  cover_url        text,
  is_supporter     boolean not null default false,
  ranked_count     integer not null default 0,
  loved_count      integer not null default 0,
  pending_count    integer not null default 0,
  graveyard_count  integer not null default 0,
  guest_count      integer not null default 0,
  nominated_count  integer not null default 0,
  fetched_at       timestamptz not null default now()
);

alter table public.osu_profile_cache enable row level security;
revoke all on table public.osu_profile_cache from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Privacy settings
-- ---------------------------------------------------------------------------

create table if not exists public.social_privacy (
  user_id          uuid primary key references public.users(id) on delete cascade,
  friend_requests  text not null default 'everyone'
    check (friend_requests in ('everyone', 'nobody')),
  messages         text not null default 'friends'
    check (messages in ('everyone', 'friends', 'nobody')),
  online_status    text not null default 'everyone'
    check (online_status in ('everyone', 'friends', 'nobody')),
  activity         text not null default 'friends'
    check (activity in ('everyone', 'friends', 'nobody')),
  mapping_stats    text not null default 'friends'
    check (mapping_stats in ('everyone', 'friends', 'nobody')),
  mapping_time     text not null default 'friends'
    check (mapping_time in ('everyone', 'friends', 'nobody')),
  project_time     text not null default 'friends'
    check (project_time in ('everyone', 'friends', 'nobody')),
  projects         text not null default 'nobody'
    check (projects in ('everyone', 'friends', 'nobody')),
  updated_at       timestamptz not null default now()
);

alter table public.social_privacy enable row level security;
revoke all on table public.social_privacy from anon, authenticated;
grant select on table public.social_privacy to authenticated;

drop policy if exists social_privacy_select_own on public.social_privacy;
create policy social_privacy_select_own on public.social_privacy
  for select to authenticated using (user_id = auth.uid());

-- Someone's settings, with the defaults above for an account that never
-- changed them. Online status defaults to everyone because the main menu has
-- always shown who is online; what they are working on defaults to friends.
create or replace function public.privacy_of(p_user uuid)
returns table (
  friend_requests text,
  messages        text,
  online_status   text,
  activity        text,
  mapping_stats   text,
  mapping_time    text,
  project_time    text,
  projects        text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(s.friend_requests, 'everyone'),
    coalesce(s.messages, 'friends'),
    coalesce(s.online_status, 'everyone'),
    coalesce(s.activity, 'friends'),
    coalesce(s.mapping_stats, 'friends'),
    coalesce(s.mapping_time, 'friends'),
    coalesce(s.project_time, 'friends'),
    coalesce(s.projects, 'nobody')
  from (select p_user as id) me
  left join public.social_privacy s on s.user_id = me.id;
$$;

revoke execute on function public.privacy_of(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Friends, requests, blocks
-- ---------------------------------------------------------------------------

-- One row per friendship, stored once with the smaller id first.
create table if not exists public.friendships (
  user_low   uuid not null references public.users(id) on delete cascade,
  user_high  uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_low, user_high),
  check (user_low < user_high)
);

create index if not exists friendships_high_idx on public.friendships(user_high);

-- A pending request, or a declined one kept for a while so the same person
-- can't ask again straight away.
create table if not exists public.friend_requests (
  id           uuid primary key default gen_random_uuid(),
  sender       uuid not null references public.users(id) on delete cascade,
  recipient    uuid not null references public.users(id) on delete cascade,
  status       text not null default 'pending'
    check (status in ('pending', 'declined')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  unique (sender, recipient),
  check (sender <> recipient)
);

create index if not exists friend_requests_recipient_idx
  on public.friend_requests(recipient, status);

create table if not exists public.user_blocks (
  blocker    uuid not null references public.users(id) on delete cascade,
  blocked    uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);

create index if not exists user_blocks_blocked_idx on public.user_blocks(blocked);

create table if not exists public.user_reports (
  id          uuid primary key default gen_random_uuid(),
  reporter    uuid references public.users(id) on delete set null,
  reported    uuid not null references public.users(id) on delete cascade,
  reason      text not null
    check (reason in ('spam', 'harassment', 'inappropriate', 'impersonation', 'other')),
  details     text check (details is null or char_length(details) <= 1000),
  status      text not null default 'open' check (status in ('open', 'resolved')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null
);

create index if not exists user_reports_status_idx
  on public.user_reports(status, created_at desc);

alter table public.friendships enable row level security;
alter table public.friend_requests enable row level security;
alter table public.user_blocks enable row level security;
alter table public.user_reports enable row level security;
revoke all on table public.friendships from anon, authenticated;
revoke all on table public.friend_requests from anon, authenticated;
revoke all on table public.user_blocks from anon, authenticated;
revoke all on table public.user_reports from anon, authenticated;

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select a is not null and b is not null and exists (
    select 1 from public.friendships f
    where f.user_low = least(a, b) and f.user_high = greatest(a, b)
  );
$$;

-- Either person blocked the other.
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select a is not null and b is not null and exists (
    select 1 from public.user_blocks k
    where (k.blocker = a and k.blocked = b) or (k.blocker = b and k.blocked = a)
  );
$$;

-- May `p_viewer` (null when signed out) see something `p_owner` shared at
-- `p_level`? The owner always sees their own, a block hides everything.
create or replace function public.can_view_level(
  p_level text, p_owner uuid, p_viewer uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_viewer is not null and p_viewer = p_owner then true
    when public.is_blocked_between(p_owner, p_viewer) then false
    when p_level = 'everyone' then true
    when p_level = 'friends' then public.are_friends(p_owner, p_viewer)
    else false
  end;
$$;

revoke execute on function public.are_friends(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.is_blocked_between(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.can_view_level(text, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Presence
-- ---------------------------------------------------------------------------

-- Written by the app's heartbeat while it is open and visible (and by the
-- mapping tracker). Never read directly: profiles and friend lists decide per
-- viewer whether to show it. credit_until belongs to the mapping tracker
-- (migration 0042).
create table if not exists public.user_presence (
  user_id      uuid primary key references public.users(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  activity     text check (activity is null or char_length(activity) <= 120),
  activity_at  timestamptz,
  credit_until timestamptz
);

alter table public.user_presence enable row level security;
revoke all on table public.user_presence from anon, authenticated;

-- Someone counts as online for three minutes after their last heartbeat
-- (the app sends one every two).
create or replace function public.presence_for(p_user uuid, p_viewer uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_priv record;
  v_presence public.user_presence;
  v_online_visible boolean;
  v_activity_visible boolean;
  v_online boolean;
begin
  select * into v_priv from public.privacy_of(p_user);
  v_online_visible := public.can_view_level(v_priv.online_status, p_user, p_viewer);
  if not v_online_visible then
    return null;
  end if;
  select * into v_presence from public.user_presence where user_id = p_user;
  v_online := v_presence.user_id is not null
    and v_presence.last_seen_at > now() - interval '3 minutes';
  v_activity_visible := v_online
    and public.can_view_level(v_priv.activity, p_user, p_viewer)
    and v_presence.activity_at > now() - interval '3 minutes';
  return json_build_object(
    'online', v_online,
    'last_seen_at', v_presence.last_seen_at,
    'activity', case when v_activity_visible then v_presence.activity end
  );
end;
$$;

revoke execute on function public.presence_for(uuid, uuid) from public, anon, authenticated;

create or replace function public.social_heartbeat(p_activity text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_activity text := nullif(left(trim(coalesce(p_activity, '')), 120), '');
begin
  if v_me is null then
    raise exception 'sign in first';
  end if;
  insert into public.user_presence (user_id, last_seen_at, activity, activity_at)
  values (v_me, now(), v_activity, case when v_activity is null then null else now() end)
  on conflict (user_id) do update set
    last_seen_at = excluded.last_seen_at,
    activity = excluded.activity,
    activity_at = excluded.activity_at;
end;
$$;

grant execute on function public.social_heartbeat(text) to authenticated;

-- Signing out or hiding your status ends presence straight away instead of
-- waiting for it to time out.
create or replace function public.social_go_offline()
returns void
language sql
security definer
set search_path = public
as $$
  update public.user_presence
    set last_seen_at = least(last_seen_at, now() - interval '3 minutes'),
        activity = null,
        activity_at = null
    where user_id = auth.uid();
$$;

grant execute on function public.social_go_offline() to authenticated;

-- ---------------------------------------------------------------------------
-- Notification kinds for friends and messages
-- ---------------------------------------------------------------------------

alter table public.notifications
  drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('invite', 'app_update', 'system', 'friend_request', 'friend_accept', 'message'));

-- ---------------------------------------------------------------------------
-- Privacy settings RPCs
-- ---------------------------------------------------------------------------

create or replace function public.get_my_privacy()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_priv record;
begin
  if v_me is null then
    raise exception 'sign in first';
  end if;
  select * into v_priv from public.privacy_of(v_me);
  return row_to_json(v_priv);
end;
$$;

grant execute on function public.get_my_privacy() to authenticated;

-- Takes any subset of the settings; the rest stay as they were.
create or replace function public.set_my_privacy(p_settings jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_current record;
  v_key text;
begin
  if v_me is null then
    raise exception 'sign in first';
  end if;
  if jsonb_typeof(p_settings) <> 'object' then
    raise exception 'settings must be an object';
  end if;
  for v_key in select jsonb_object_keys(p_settings) loop
    if v_key not in ('friend_requests', 'messages', 'online_status', 'activity',
                     'mapping_stats', 'mapping_time', 'project_time', 'projects') then
      raise exception 'unknown privacy setting "%"', v_key;
    end if;
  end loop;
  select * into v_current from public.privacy_of(v_me);
  insert into public.social_privacy (
    user_id, friend_requests, messages, online_status, activity,
    mapping_stats, mapping_time, project_time, projects, updated_at
  ) values (
    v_me,
    coalesce(p_settings ->> 'friend_requests', v_current.friend_requests),
    coalesce(p_settings ->> 'messages', v_current.messages),
    coalesce(p_settings ->> 'online_status', v_current.online_status),
    coalesce(p_settings ->> 'activity', v_current.activity),
    coalesce(p_settings ->> 'mapping_stats', v_current.mapping_stats),
    coalesce(p_settings ->> 'mapping_time', v_current.mapping_time),
    coalesce(p_settings ->> 'project_time', v_current.project_time),
    coalesce(p_settings ->> 'projects', v_current.projects),
    now()
  )
  on conflict (user_id) do update set
    friend_requests = excluded.friend_requests,
    messages = excluded.messages,
    online_status = excluded.online_status,
    activity = excluded.activity,
    mapping_stats = excluded.mapping_stats,
    mapping_time = excluded.mapping_time,
    project_time = excluded.project_time,
    projects = excluded.projects,
    updated_at = excluded.updated_at;
  return public.get_my_privacy();
end;
$$;

grant execute on function public.set_my_privacy(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Relationship between the caller and someone else
-- ---------------------------------------------------------------------------

-- 'self', 'friends', 'incoming' (they asked me), 'outgoing' (I asked them),
-- 'blocked' (I blocked them) or 'none'. Being blocked by them reads as
-- 'none', so a block is never announced to the person blocked.
create or replace function public.relationship_with(p_me uuid, p_other uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_me is null then 'none'
    when p_me = p_other then 'self'
    when exists (select 1 from public.user_blocks k
                 where k.blocker = p_me and k.blocked = p_other) then 'blocked'
    when exists (select 1 from public.user_blocks k
                 where k.blocker = p_other and k.blocked = p_me) then 'none'
    when public.are_friends(p_me, p_other) then 'friends'
    when exists (select 1 from public.friend_requests r
                 where r.sender = p_other and r.recipient = p_me
                   and r.status = 'pending') then 'incoming'
    when exists (select 1 from public.friend_requests r
                 where r.sender = p_me and r.recipient = p_other
                   and r.status = 'pending') then 'outgoing'
    else 'none'
  end;
$$;

revoke execute on function public.relationship_with(uuid, uuid) from public, anon, authenticated;

-- Could `p_sender` send `p_recipient` a message right now? Their settings
-- decide, except that a reply is always allowed once the recipient has
-- written to the sender themselves. Blocks stop both directions.
create or replace function public.can_message_user(p_sender uuid, p_recipient uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_priv record;
begin
  if p_sender is null or p_recipient is null or p_sender = p_recipient then
    return false;
  end if;
  if public.is_blocked_between(p_sender, p_recipient) then
    return false;
  end if;
  select * into v_priv from public.privacy_of(p_recipient);
  if public.can_view_level(v_priv.messages, p_recipient, p_sender) then
    return true;
  end if;
  return exists (
    select 1
    from public.conversations c
    join public.messages m on m.conversation_id = c.id
    where c.user_low = least(p_sender, p_recipient)
      and c.user_high = greatest(p_sender, p_recipient)
      and m.sender = p_recipient
  );
end;
$$;

create or replace function public.can_friend_request_user(p_sender uuid, p_recipient uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_priv record;
begin
  if p_sender is null or p_recipient is null or p_sender = p_recipient then
    return false;
  end if;
  if public.is_blocked_between(p_sender, p_recipient)
     or public.are_friends(p_sender, p_recipient) then
    return false;
  end if;
  -- Accepting their own pending request is always possible.
  if exists (select 1 from public.friend_requests r
             where r.sender = p_recipient and r.recipient = p_sender
               and r.status = 'pending') then
    return true;
  end if;
  select * into v_priv from public.privacy_of(p_recipient);
  return v_priv.friend_requests = 'everyone';
end;
$$;

-- ---------------------------------------------------------------------------
-- Messaging tables (the functions above refer to them at call time)
-- ---------------------------------------------------------------------------

-- Conversations are between two people; the pair is stored once, smaller id
-- first, so there is only ever one conversation per pair.
create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  user_low        uuid not null references public.users(id) on delete cascade,
  user_high       uuid not null references public.users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz,
  unique (user_low, user_high),
  check (user_low < user_high)
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  last_read_at    timestamptz,
  muted           boolean not null default false,
  archived        boolean not null default false,
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_members_user_idx
  on public.conversation_members(user_id);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender          uuid not null references public.users(id) on delete cascade,
  body            text not null check (char_length(body) <= 2000),
  reply_to        uuid references public.messages(id) on delete set null,
  created_at      timestamptz not null default now(),
  edited_at       timestamptz,
  deleted_at      timestamptz
);

create index if not exists messages_conversation_created_idx
  on public.messages(conversation_id, created_at desc);
create index if not exists messages_sender_created_idx
  on public.messages(sender, created_at desc);

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
revoke all on table public.conversations from anon, authenticated;
revoke all on table public.conversation_members from anon, authenticated;
revoke all on table public.messages from anon, authenticated;
-- Reading goes straight to the table (Realtime needs that too); every write
-- goes through the functions below.
grant select on table public.conversations to authenticated;
grant select on table public.conversation_members to authenticated;
grant select on table public.messages to authenticated;

create or replace function public.is_conversation_member(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members m
    where m.conversation_id = p_conversation and m.user_id = auth.uid()
  );
$$;

grant execute on function public.is_conversation_member(uuid) to authenticated;

drop policy if exists conversations_select_member on public.conversations;
create policy conversations_select_member on public.conversations
  for select to authenticated using (public.is_conversation_member(id));

drop policy if exists conversation_members_select_own on public.conversation_members;
create policy conversation_members_select_own on public.conversation_members
  for select to authenticated using (user_id = auth.uid());

drop policy if exists messages_select_member on public.messages;
create policy messages_select_member on public.messages
  for select to authenticated using (public.is_conversation_member(conversation_id));

revoke execute on function public.can_message_user(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.can_friend_request_user(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Profiles and search
-- ---------------------------------------------------------------------------

-- Finds an account by its current username (case-insensitive), or by osu!
-- id when given digits. When two rows share a name - someone renamed on osu!
-- and another person took the old name - the one seen most recently wins;
-- the app also asks osu! who holds a name now when this finds nobody.
create or replace function public.find_user_id(p_name text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select u.id from public.users u
      where lower(u.username) = lower(trim(p_name))
      order by u.last_signed_in_at desc nulls last
      limit 1),
    (select u.id from public.users u
      where trim(p_name) ~ '^[0-9]{1,12}$' and u.osu_id = trim(p_name)::bigint
      limit 1)
  );
$$;

revoke execute on function public.find_user_id(text) from public, anon, authenticated;

create or replace function public.profile_card(p_user uuid, p_viewer uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user public.users;
  v_cache public.osu_profile_cache;
  v_blocked_me boolean;
begin
  select * into v_user from public.users where id = p_user;
  if v_user.id is null then
    return null;
  end if;
  select * into v_cache from public.osu_profile_cache where user_id = p_user;
  v_blocked_me := p_viewer is not null and exists (
    select 1 from public.user_blocks k where k.blocker = p_user and k.blocked = p_viewer
  );
  return json_build_object(
    'id', v_user.id,
    'osu_id', v_user.osu_id,
    'username', v_user.username,
    'avatar_url', v_user.avatar_url,
    'country_code', coalesce(v_user.country_code, v_cache.country_code),
    'relationship', public.relationship_with(p_viewer, p_user),
    'presence', case when v_blocked_me then null else public.presence_for(p_user, p_viewer) end,
    'osu', case when v_cache.user_id is null then null else json_build_object(
      'ranked_count', v_cache.ranked_count,
      'loved_count', v_cache.loved_count,
      'pending_count', v_cache.pending_count,
      'graveyard_count', v_cache.graveyard_count,
      'guest_count', v_cache.guest_count,
      'is_supporter', v_cache.is_supporter
    ) end
  );
end;
$$;

revoke execute on function public.profile_card(uuid, uuid) from public, anon, authenticated;

-- A full profile: the card above plus what the caller may do and see.
-- Anyone may call it, signed in or not; it returns null for nobody found.
create or replace function public.get_profile(p_name text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
  v_user public.users;
  v_priv record;
  v_blocked_me boolean;
  v_card jsonb;
  v_request uuid;
  v_friends_since timestamptz;
begin
  if p_name is null or char_length(trim(p_name)) = 0 or char_length(p_name) > 64 then
    return null;
  end if;
  v_id := public.find_user_id(p_name);
  if v_id is null then
    return null;
  end if;
  select * into v_user from public.users where id = v_id;
  select * into v_priv from public.privacy_of(v_id);
  v_blocked_me := v_me is not null and exists (
    select 1 from public.user_blocks k where k.blocker = v_id and k.blocked = v_me
  );
  v_card := public.profile_card(v_id, v_me)::jsonb;
  select r.id into v_request from public.friend_requests r
    where r.sender = v_id and r.recipient = v_me and r.status = 'pending';
  select f.created_at into v_friends_since from public.friendships f
    where v_me is not null
      and f.user_low = least(v_id, v_me) and f.user_high = greatest(v_id, v_me);

  return (v_card || jsonb_build_object(
    'cascade_joined_at', v_user.created_at,
    'is_self', coalesce(v_me = v_id, false),
    'incoming_request_id', v_request,
    'friends_since', v_friends_since,
    'can_friend_request', not v_blocked_me
      and v_me is not null
      and public.relationship_with(v_me, v_id) in ('none', 'incoming')
      and public.can_friend_request_user(v_me, v_id),
    'can_message', not v_blocked_me and public.can_message_user(v_me, v_id),
    'visible', jsonb_build_object(
      'mapping_stats', not v_blocked_me and public.can_view_level(v_priv.mapping_stats, v_id, v_me),
      'mapping_time', not v_blocked_me and public.can_view_level(v_priv.mapping_time, v_id, v_me),
      'project_time', not v_blocked_me and public.can_view_level(v_priv.project_time, v_id, v_me),
      'projects', not v_blocked_me and public.can_view_level(v_priv.projects, v_id, v_me)
    )
  ))::json;
end;
$$;

grant execute on function public.get_profile(text) to anon, authenticated;

create or replace function public.escape_like(p_text text)
returns text
language sql
immutable
as $$
  select replace(replace(replace(p_text, '\', '\\'), '%', '\%'), '_', '\_');
$$;

-- Username search for signed-in users: exact match first, then names that
-- start with the query, then names that contain it. People who blocked the
-- caller are left out. Results carry only what a profile card shows.
create or replace function public.search_users(
  p_query text,
  p_limit integer default 20,
  p_offset integer default 0
) returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_query text := lower(trim(coalesce(p_query, '')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_offset integer := greatest(0, least(coalesce(p_offset, 0), 1000));
  v_rows json;
  v_total integer;
begin
  if v_me is null then
    raise exception 'sign in first';
  end if;
  if char_length(v_query) < 1 or char_length(v_query) > 32 then
    return json_build_object('users', '[]'::json, 'total', 0);
  end if;

  with matches as (
    select u.id,
      case
        when lower(u.username) = v_query then 0
        when lower(u.username) like public.escape_like(v_query) || '%' then 1
        else 2
      end as rank,
      u.username,
      u.last_signed_in_at
    from public.users u
    where lower(u.username) like '%' || public.escape_like(v_query) || '%'
      and not exists (select 1 from public.user_blocks k
                      where k.blocker = u.id and k.blocked = v_me)
  )
  select
    (select count(*) from matches),
    coalesce(json_agg(public.profile_card(m.id, v_me) order by m.rank, m.last_signed_in_at desc nulls last, m.username), '[]'::json)
  into v_total, v_rows
  from (
    select * from matches
    order by rank, last_signed_in_at desc nulls last, username
    limit v_limit offset v_offset
  ) m;

  return json_build_object('users', v_rows, 'total', v_total);
end;
$$;

grant execute on function public.search_users(text, integer, integer) to authenticated;

-- People to discover on the community page. "Recent" are accounts that signed
-- in lately (the same pool the main menu floats); "featured" are the Cascade
-- users with the most ranked beatmapsets on osu!, which is public osu! data.
-- Neither ranks anyone by time spent mapping.
create or replace function public.discover_users(p_limit integer default 12)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 12), 30));
begin
  if v_me is null then
    raise exception 'sign in first';
  end if;
  return json_build_object(
    'recent', (
      select coalesce(json_agg(public.profile_card(r.id, v_me) order by r.last_signed_in_at desc), '[]'::json)
      from (
        select u.id, u.last_signed_in_at
        from public.users u
        where u.id <> v_me
          and u.last_signed_in_at is not null
          and not public.is_blocked_between(u.id, v_me)
        order by u.last_signed_in_at desc
        limit v_limit
      ) r
    ),
    'featured', (
      select coalesce(json_agg(public.profile_card(f.user_id, v_me) order by f.ranked_count desc, f.loved_count desc), '[]'::json)
      from (
        select c.user_id, c.ranked_count, c.loved_count
        from public.osu_profile_cache c
        where c.user_id <> v_me
          and (c.ranked_count > 0 or c.loved_count > 0)
          and not public.is_blocked_between(c.user_id, v_me)
        order by c.ranked_count desc, c.loved_count desc
        limit v_limit
      ) f
    )
  );
end;
$$;

grant execute on function public.discover_users(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Friend requests
-- ---------------------------------------------------------------------------

create or replace function public.notify_social(
  p_recipient uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_actor uuid,
  p_action_url text,
  p_dedupe_key text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.users;
begin
  select * into v_actor from public.users where id = p_actor;
  insert into public.notifications (
    recipient, kind, title, body, actor, actor_username, actor_avatar_url,
    action_url, dedupe_key
  ) values (
    p_recipient, p_kind, p_title, p_body, p_actor, v_actor.username,
    v_actor.avatar_url, p_action_url, p_dedupe_key
  )
  on conflict (recipient, dedupe_key) do update set
    kind = excluded.kind,
    title = excluded.title,
    body = excluded.body,
    actor = excluded.actor,
    actor_username = excluded.actor_username,
    actor_avatar_url = excluded.actor_avatar_url,
    action_url = excluded.action_url,
    read_at = null,
    dismissed_at = null,
    created_at = now();
end;
$$;

revoke execute on function public.notify_social(uuid, text, text, text, uuid, text, text)
  from public, anon, authenticated;

create or replace function public.retire_notification(p_recipient uuid, p_dedupe_key text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.notifications
    set read_at = coalesce(read_at, now()),
        dismissed_at = coalesce(dismissed_at, now())
    where recipient = p_recipient and dedupe_key = p_dedupe_key;
$$;

revoke execute on function public.retire_notification(uuid, text) from public, anon, authenticated;

create or replace function public.make_friends(a uuid, b uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a public.users;
  v_b public.users;
begin
  insert into public.friendships (user_low, user_high)
    values (least(a, b), greatest(a, b))
    on conflict do nothing;
  delete from public.friend_requests
    where (sender = a and recipient = b) or (sender = b and recipient = a);
  perform public.retire_notification(a, 'friend-request:' || b::text);
  perform public.retire_notification(b, 'friend-request:' || a::text);
end;
$$;

revoke execute on function public.make_friends(uuid, uuid) from public, anon, authenticated;

-- Sends a request, or accepts theirs when they already asked. Returns the
-- new relationship: 'outgoing' or 'friends'.
create or replace function public.send_friend_request(p_user uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_existing public.friend_requests;
  v_sent_today integer;
  v_me_row public.users;
begin
  if v_me is null then
    raise exception 'sign in first';
  end if;
  if p_user is null or p_user = v_me then
    raise exception 'You can''t add yourself as a friend.';
  end if;
  if not exists (select 1 from public.users where id = p_user) then
    raise exception 'user not found';
  end if;
  if public.is_blocked_between(v_me, p_user) then
    raise exception 'You can''t add this user as a friend.';
  end if;
  if public.are_friends(v_me, p_user) then
    return 'friends';
  end if;

  -- They already asked: this is an accept.
  if exists (select 1 from public.friend_requests r
             where r.sender = p_user and r.recipient = v_me and r.status = 'pending') then
    perform public.make_friends(v_me, p_user);
    select * into v_me_row from public.users where id = v_me;
    perform public.notify_social(
      p_user, 'friend_accept', 'Friend request accepted',
      coalesce(v_me_row.username, 'Someone') || ' accepted your friend request.',
      v_me, '/user/' || coalesce(v_me_row.username, ''), 'friend-accept:' || v_me::text
    );
    return 'friends';
  end if;

  if not public.can_friend_request_user(v_me, p_user) then
    raise exception 'This user isn''t accepting friend requests.';
  end if;

  select * into v_existing from public.friend_requests
    where sender = v_me and recipient = p_user;
  if v_existing.id is not null and v_existing.status = 'pending' then
    return 'outgoing';
  end if;
  if v_existing.id is not null and v_existing.status = 'declined'
     and v_existing.responded_at > now() - interval '7 days' then
    raise exception 'You can''t send this user another request yet.';
  end if;

  select count(*) into v_sent_today from public.friend_requests
    where sender = v_me and created_at > now() - interval '1 day';
  if v_sent_today >= 30 then
    raise exception 'You''ve sent a lot of friend requests today. Try again tomorrow.';
  end if;

  insert into public.friend_requests (sender, recipient, status, created_at, responded_at)
    values (v_me, p_user, 'pending', now(), null)
    on conflict (sender, recipient) do update set
      status = 'pending', created_at = now(), responded_at = null;

  select * into v_me_row from public.users where id = v_me;
  perform public.notify_social(
    p_user, 'friend_request', 'Friend request',
    coalesce(v_me_row.username, 'Someone') || ' wants to be friends.',
    v_me, '/user/' || coalesce(v_me_row.username, ''), 'friend-request:' || v_me::text
  );
  return 'outgoing';
end;
$$;

grant execute on function public.send_friend_request(uuid) to authenticated;

-- Accepts or declines a request sent to the caller. A decline isn't
-- announced; it only stops the same person asking again for a week.
create or replace function public.respond_friend_request(p_user uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_me_row public.users;
begin
  if v_me is null then
    raise exception 'sign in first';
  end if;
  if not exists (select 1 from public.friend_requests r
                 where r.sender = p_user and r.recipient = v_me and r.status = 'pending') then
    raise exception 'That friend request is no longer pending.';
  end if;
  if p_accept then
    if public.is_blocked_between(v_me, p_user) then
      raise exception 'You can''t add this user as a friend.';
    end if;
    perform public.make_friends(v_me, p_user);
    select * into v_me_row from public.users where id = v_me;
    perform public.notify_social(
      p_user, 'friend_accept', 'Friend request accepted',
      coalesce(v_me_row.username, 'Someone') || ' accepted your friend request.',
      v_me, '/user/' || coalesce(v_me_row.username, ''), 'friend-accept:' || v_me::text
    );
    return 'friends';
  end if;
  update public.friend_requests
    set status = 'declined', responded_at = now()
    where sender = p_user and recipient = v_me;
  perform public.retire_notification(v_me, 'friend-request:' || p_user::text);
  return 'none';
end;
$$;

grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;

create or replace function public.cancel_friend_request(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'sign in first';
  end if;
  delete from public.friend_requests
    where sender = v_me and recipient = p_user and status = 'pending';
  perform public.retire_notification(p_user, 'friend-request:' || v_me::text);
end;
$$;

grant execute on function public.cancel_friend_request(uuid) to authenticated;

create or replace function public.remove_friend(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'sign in first';
  end if;
  delete from public.friendships
    where user_low = least(v_me, p_user) and user_high = greatest(v_me, p_user);
  perform public.retire_notification(v_me, 'friend-accept:' || p_user::text);
  perform public.retire_notification(p_user, 'friend-accept:' || v_me::text);
end;
$$;

grant execute on function public.remove_friend(uuid) to authenticated;

-- Blocking ends the friendship and any requests either way. Conversations
-- stay readable as history, but neither person can send in them any more.
-- Collaborations already in place are left to the map's owner; new
-- invitations between the two are refused (add_collaborator below).
create or replace function public.block_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'sign in first';
  end if;
  if p_user is null or p_user = v_me then
    raise exception 'You can''t block yourself.';
  end if;
  if not exists (select 1 from public.users where id = p_user) then
    raise exception 'user not found';
  end if;
  insert into public.user_blocks (blocker, blocked) values (v_me, p_user)
    on conflict do nothing;
  delete from public.friendships
    where user_low = least(v_me, p_user) and user_high = greatest(v_me, p_user);
  delete from public.friend_requests
    where (sender = v_me and recipient = p_user) or (sender = p_user and recipient = v_me);
  perform public.retire_notification(v_me, 'friend-request:' || p_user::text);
  perform public.retire_notification(p_user, 'friend-request:' || v_me::text);
  perform public.retire_notification(v_me, 'friend-accept:' || p_user::text);
  perform public.retire_notification(p_user, 'friend-accept:' || v_me::text);
  update public.notifications n
    set read_at = coalesce(n.read_at, now()), dismissed_at = coalesce(n.dismissed_at, now())
    from public.conversations c
    where n.recipient = v_me
      and c.user_low = least(v_me, p_user) and c.user_high = greatest(v_me, p_user)
      and n.dedupe_key = 'dm:' || c.id::text;
end;
$$;

grant execute on function public.block_user(uuid) to authenticated;

create or replace function public.unblock_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;
  delete from public.user_blocks where blocker = auth.uid() and blocked = p_user;
end;
$$;

grant execute on function public.unblock_user(uuid) to authenticated;

create or replace function public.report_user(
  p_user uuid, p_reason text, p_details text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'sign in first';
  end if;
  if p_user is null or p_user = v_me then
    raise exception 'You can''t report yourself.';
  end if;
  if not exists (select 1 from public.users where id = p_user) then
    raise exception 'user not found';
  end if;
  if p_reason not in ('spam', 'harassment', 'inappropriate', 'impersonation', 'other') then
    raise exception 'invalid reason';
  end if;
  if exists (select 1 from public.user_reports r
             where r.reporter = v_me and r.reported = p_user
               and r.created_at > now() - interval '1 day') then
    raise exception 'You already reported this user today.';
  end if;
  insert into public.user_reports (reporter, reported, reason, details)
    values (v_me, p_user, p_reason, nullif(left(trim(coalesce(p_details, '')), 1000), ''));
end;
$$;

grant execute on function public.report_user(uuid, text, text) to authenticated;

create or replace function public.admin_list_user_reports(p_status text default 'open')
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin access required';
  end if;
  return (
    select coalesce(json_agg(json_build_object(
      'id', r.id,
      'reason', r.reason,
      'details', r.details,
      'status', r.status,
      'created_at', r.created_at,
      'reporter', ru.username,
      'reported_id', r.reported,
      'reported', u.username,
      'reported_avatar_url', u.avatar_url
    ) order by r.created_at desc), '[]'::json)
    from (
      select * from public.user_reports
      where p_status is null or status = p_status
      order by created_at desc
      limit 200
    ) r
    join public.users u on u.id = r.reported
    left join public.users ru on ru.id = r.reporter
  );
end;
$$;

grant execute on function public.admin_list_user_reports(text) to authenticated;

create or replace function public.admin_resolve_user_report(p_report uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin access required';
  end if;
  update public.user_reports
    set status = 'resolved', resolved_at = now(), resolved_by = auth.uid()
    where id = p_report;
end;
$$;

grant execute on function public.admin_resolve_user_report(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Friend lists
-- ---------------------------------------------------------------------------

create or replace function public.list_friends()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'sign in first';
  end if;
  return json_build_object(
    'friends', (
      select coalesce(json_agg(
        (public.profile_card(f.other, v_me)::jsonb
          || jsonb_build_object('since', f.created_at))
        order by lower(f.username)), '[]'::json)
      from (
        select case when fr.user_low = v_me then fr.user_high else fr.user_low end as other,
               fr.created_at,
               u.username
        from public.friendships fr
        join public.users u
          on u.id = case when fr.user_low = v_me then fr.user_high else fr.user_low end
        where fr.user_low = v_me or fr.user_high = v_me
      ) f
    ),
    'incoming', (
      select coalesce(json_agg(
        (public.profile_card(r.sender, v_me)::jsonb
          || jsonb_build_object('requested_at', r.created_at))
        order by r.created_at desc), '[]'::json)
      from public.friend_requests r
      where r.recipient = v_me and r.status = 'pending'
    ),
    'outgoing', (
      select coalesce(json_agg(
        (public.profile_card(r.recipient, v_me)::jsonb
          || jsonb_build_object('requested_at', r.created_at))
        order by r.created_at desc), '[]'::json)
      from public.friend_requests r
      where r.sender = v_me and r.status = 'pending'
    ),
    'blocked', (
      select coalesce(json_agg(
        (public.profile_card(k.blocked, v_me)::jsonb
          || jsonb_build_object('blocked_at', k.created_at))
        order by k.created_at desc), '[]'::json)
      from public.user_blocks k
      where k.blocker = v_me
    )
  );
end;
$$;

grant execute on function public.list_friends() to authenticated;

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------

-- Returns the conversation with someone, creating it if allowed. An existing
-- conversation always opens, so its history stays readable after a block.
create or replace function public.open_conversation(p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
begin
  if v_me is null then
    raise exception 'sign in first';
  end if;
  if p_user is null or p_user = v_me then
    raise exception 'You can''t message yourself.';
  end if;
  select id into v_id from public.conversations
    where user_low = least(v_me, p_user) and user_high = greatest(v_me, p_user);
  if v_id is not null then
    return v_id;
  end if;
  if not exists (select 1 from public.users where id = p_user) then
    raise exception 'user not found';
  end if;
  if not public.can_message_user(v_me, p_user) then
    raise exception 'This user isn''t accepting messages from you.';
  end if;
  insert into public.conversations (user_low, user_high)
    values (least(v_me, p_user), greatest(v_me, p_user))
    on conflict (user_low, user_high) do update set user_low = excluded.user_low
    returning id into v_id;
  insert into public.conversation_members (conversation_id, user_id)
    values (v_id, v_me), (v_id, p_user)
    on conflict do nothing;
  return v_id;
end;
$$;

grant execute on function public.open_conversation(uuid) to authenticated;

create or replace function public.conversation_partner(p_conversation uuid, p_me uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case when c.user_low = p_me then c.user_high
              when c.user_high = p_me then c.user_low end
  from public.conversations c where c.id = p_conversation;
$$;

revoke execute on function public.conversation_partner(uuid, uuid) from public, anon, authenticated;

create or replace function public.send_message(
  p_conversation uuid,
  p_body text,
  p_reply_to uuid default null
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_other uuid;
  v_body text := trim(coalesce(p_body, ''));
  v_recent integer;
  v_message public.messages;
  v_me_row public.users;
  v_muted boolean;
begin
  if v_me is null then
    raise exception 'sign in first';
  end if;
  v_other := public.conversation_partner(p_conversation, v_me);
  if v_other is null then
    raise exception 'conversation not found';
  end if;
  if char_length(v_body) = 0 then
    raise exception 'Message is empty.';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'Messages can be at most 2000 characters.';
  end if;
  if not public.can_message_user(v_me, v_other) then
    raise exception 'You can''t send messages in this conversation.';
  end if;

  select count(*) into v_recent from public.messages
    where sender = v_me and created_at > now() - interval '10 seconds';
  if v_recent >= 8 then
    raise exception 'You''re sending messages too quickly. Wait a moment.';
  end if;
  select count(*) into v_recent from public.messages
    where sender = v_me and created_at > now() - interval '1 hour';
  if v_recent >= 300 then
    raise exception 'You''ve sent a lot of messages this hour. Try again later.';
  end if;

  if p_reply_to is not null and not exists (
    select 1 from public.messages m
    where m.id = p_reply_to and m.conversation_id = p_conversation
  ) then
    p_reply_to := null;
  end if;

  insert into public.messages (conversation_id, sender, body, reply_to)
    values (p_conversation, v_me, v_body, p_reply_to)
    returning * into v_message;

  update public.conversations set last_message_at = v_message.created_at
    where id = p_conversation;
  update public.conversation_members
    set archived = false,
        last_read_at = case when user_id = v_me then v_message.created_at else last_read_at end
    where conversation_id = p_conversation;

  select m.muted into v_muted from public.conversation_members m
    where m.conversation_id = p_conversation and m.user_id = v_other;
  if not coalesce(v_muted, false) then
    select * into v_me_row from public.users where id = v_me;
    perform public.notify_social(
      v_other, 'message', coalesce(v_me_row.username, 'New message'),
      left(v_body, 140), v_me, '/messages/' || p_conversation::text,
      'dm:' || p_conversation::text
    );
  end if;

  return row_to_json(v_message);
end;
$$;

grant execute on function public.send_message(uuid, text, uuid) to authenticated;

create or replace function public.edit_message(p_message uuid, p_body text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_body text := trim(coalesce(p_body, ''));
  v_message public.messages;
begin
  if v_me is null then
    raise exception 'sign in first';
  end if;
  if char_length(v_body) = 0 then
    raise exception 'Message is empty.';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'Messages can be at most 2000 characters.';
  end if;
  update public.messages
    set body = v_body, edited_at = now()
    where id = p_message and sender = v_me and deleted_at is null
    returning * into v_message;
  if v_message.id is null then
    raise exception 'You can only edit your own messages.';
  end if;
  return row_to_json(v_message);
end;
$$;

grant execute on function public.edit_message(uuid, text) to authenticated;

-- Deleting keeps a placeholder row so replies and the order stay intact, but
-- the text itself is gone from the database.
create or replace function public.delete_message(p_message uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'sign in first';
  end if;
  update public.messages
    set body = '', deleted_at = now(), edited_at = null
    where id = p_message and sender = v_me and deleted_at is null;
  if not found then
    raise exception 'You can only delete your own messages.';
  end if;
end;
$$;

grant execute on function public.delete_message(uuid) to authenticated;

create or replace function public.mark_conversation_read(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'sign in first';
  end if;
  update public.conversation_members set last_read_at = now()
    where conversation_id = p_conversation and user_id = v_me;
  update public.notifications set read_at = now()
    where recipient = v_me and dedupe_key = 'dm:' || p_conversation::text
      and read_at is null;
end;
$$;

grant execute on function public.mark_conversation_read(uuid) to authenticated;

create or replace function public.set_conversation_state(
  p_conversation uuid,
  p_muted boolean default null,
  p_archived boolean default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;
  update public.conversation_members
    set muted = coalesce(p_muted, muted),
        archived = coalesce(p_archived, archived)
    where conversation_id = p_conversation and user_id = auth.uid();
  if not found then
    raise exception 'conversation not found';
  end if;
end;
$$;

grant execute on function public.set_conversation_state(uuid, boolean, boolean) to authenticated;

create or replace function public.list_conversations()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'sign in first';
  end if;
  return (
    select coalesce(json_agg(r.item order by r.sort_at desc), '[]'::json)
    from (
      select json_build_object(
        'id', c.id,
        'user', public.profile_card(o.other, v_me),
        'last_message', case when lm.id is null then null else json_build_object(
          'id', lm.id,
          'sender', lm.sender,
          'body', lm.body,
          'created_at', lm.created_at,
          'deleted', lm.deleted_at is not null
        ) end,
        'unread', (
          select count(*) from public.messages m
          where m.conversation_id = c.id and m.sender <> v_me and m.deleted_at is null
            and m.created_at > coalesce(me.last_read_at, '-infinity'::timestamptz)
        ),
        'muted', me.muted,
        'archived', me.archived,
        'can_send', public.can_message_user(v_me, o.other),
        'created_at', c.created_at
      ) as item,
      coalesce(c.last_message_at, c.created_at) as sort_at
      from public.conversation_members me
      join public.conversations c on c.id = me.conversation_id
      cross join lateral (
        select case when c.user_low = v_me then c.user_high else c.user_low end as other
      ) o
      left join lateral (
        select m.* from public.messages m
        where m.conversation_id = c.id
        order by m.created_at desc
        limit 1
      ) lm on true
      where me.user_id = v_me
    ) r
  );
end;
$$;

grant execute on function public.list_conversations() to authenticated;

-- Badge counts for the header: unread messages outside muted conversations
-- and friend requests waiting for an answer.
create or replace function public.get_social_counts()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'sign in first';
  end if;
  return json_build_object(
    'unread_messages', (
      select count(*)
      from public.conversation_members me
      join public.messages m on m.conversation_id = me.conversation_id
      where me.user_id = v_me and not me.muted
        and m.sender <> v_me and m.deleted_at is null
        and m.created_at > coalesce(me.last_read_at, '-infinity'::timestamptz)
    ),
    'pending_requests', (
      select count(*) from public.friend_requests r
      where r.recipient = v_me and r.status = 'pending'
    )
  );
end;
$$;

grant execute on function public.get_social_counts() to authenticated;

-- Messages reach an open conversation over Postgres Changes, which applies
-- messages_select_member to every subscriber, so nobody receives a row from
-- a conversation they are not in.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- Typing indicators are broadcasts on a private "dm:<conversation id>"
-- channel that only the two members can join or send on.
drop policy if exists "dm read conversation channel" on realtime.messages;
create policy "dm read conversation channel" on realtime.messages
  for select to authenticated using (
    realtime.topic() like 'dm:%'
    and public.is_conversation_member(
      case when split_part(realtime.topic(), ':', 2) ~ '^[0-9a-f-]{36}$'
           then split_part(realtime.topic(), ':', 2)::uuid end
    )
  );

drop policy if exists "dm send conversation channel" on realtime.messages;
create policy "dm send conversation channel" on realtime.messages
  for insert to authenticated with check (
    realtime.topic() like 'dm:%'
    and public.is_conversation_member(
      case when split_part(realtime.topic(), ':', 2) ~ '^[0-9a-f-]{36}$'
           then split_part(realtime.topic(), ':', 2)::uuid end
    )
  );

-- ---------------------------------------------------------------------------
-- Collaboration invitations respect blocks
-- ---------------------------------------------------------------------------

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
    where lower(username) = lower(p_username)
    order by last_signed_in_at desc nulls last
    limit 1;
  if v_user.id is null then
    raise exception 'No user "%". They must sign in to the editor at least once first.', p_username;
  end if;
  if v_user.id = v_owner then
    raise exception 'The owner is already on this map.';
  end if;
  if public.is_blocked_between(auth.uid(), v_user.id)
     or public.is_blocked_between(v_owner, v_user.id) then
    raise exception 'You can''t invite this user.';
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

-- ---------------------------------------------------------------------------
-- The main menu's pool of faces, for the Worker
-- ---------------------------------------------------------------------------

-- Same pool as before, but "last seen" only for people who show their online
-- status to everyone. The Worker calls this with the service role.
create or replace function public.roster_pool(p_limit integer default 40)
returns table (
  id uuid,
  osu_id bigint,
  username text,
  avatar_url text,
  last_seen_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.osu_id, u.username, u.avatar_url,
    case when (select p.online_status from public.privacy_of(u.id) p) = 'everyone'
         then greatest(u.last_signed_in_at, pr.last_seen_at) end
  from public.users u
  left join public.user_presence pr on pr.user_id = u.id
  where u.avatar_url is not null
  order by greatest(u.last_signed_in_at, pr.last_seen_at) desc nulls last
  limit greatest(1, least(coalesce(p_limit, 40), 100));
$$;

revoke execute on function public.roster_pool(integer) from public, anon, authenticated;
grant execute on function public.roster_pool(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Feature flag
-- ---------------------------------------------------------------------------

insert into public.feature_flags (key, enabled, description) values
  ('social', false, 'Profiles, friends, messages and mapping statistics')
on conflict (key) do nothing;

notify pgrst, 'reload schema';

-- The official Cascade Discord bot (worker/src/discord) and contributions.
--
-- The bot runs inside the Worker. It reads profiles and statistics as a
-- signed-out visitor would, through the same public functions the website
-- uses, so privacy settings apply to it exactly as they do on a profile.
-- Two new settings decide what it may add on top, both off until the person
-- turns them on in Connected accounts:
--   discord_lookup  others may open your Cascade profile from your Discord
--                   account (you can always show your own)
--   leaderboard     you appear on the bot's leaderboards, for the numbers
--                   your privacy settings already show to everyone
--
-- Contributions are bug reports and suggestions sent with /bug and /suggest,
-- and anything an admin records by hand. Points come only from an admin
-- accepting a contribution, once, and never from sending one. The
-- Contributor role and the profile badge follow from the total, or from an
-- admin's override. Everything here is written by the service role only.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- What the bot may show
-- ---------------------------------------------------------------------------

alter table public.social_privacy
  add column if not exists discord_lookup text not null default 'nobody';
alter table public.social_privacy
  add column if not exists leaderboard text not null default 'nobody';

alter table public.social_privacy
  drop constraint if exists social_privacy_discord_lookup_check;
alter table public.social_privacy
  add constraint social_privacy_discord_lookup_check
  check (discord_lookup in ('everyone', 'nobody'));
alter table public.social_privacy
  drop constraint if exists social_privacy_leaderboard_check;
alter table public.social_privacy
  add constraint social_privacy_leaderboard_check
  check (leaderboard in ('everyone', 'nobody'));

create or replace function public.bot_privacy_of(p_user uuid)
returns table (discord_lookup text, leaderboard text)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(s.discord_lookup, 'nobody'), coalesce(s.leaderboard, 'nobody')
  from (select p_user as id) me
  left join public.social_privacy s on s.user_id = me.id;
$$;

revoke execute on function public.bot_privacy_of(uuid) from public, anon, authenticated;

-- 0041's settings, plus the bot's two.
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
  v_bot record;
begin
  if v_me is null then
    raise exception 'sign in first';
  end if;
  select * into v_priv from public.privacy_of(v_me);
  select * into v_bot from public.bot_privacy_of(v_me);
  return (row_to_json(v_priv)::jsonb || jsonb_build_object(
    'discord_lookup', v_bot.discord_lookup,
    'leaderboard', v_bot.leaderboard
  ))::json;
end;
$$;

grant execute on function public.get_my_privacy() to authenticated;

create or replace function public.set_my_privacy(p_settings jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_current record;
  v_bot record;
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
                     'mapping_stats', 'mapping_time', 'project_time', 'projects',
                     'discord_lookup', 'leaderboard') then
      raise exception 'unknown privacy setting "%"', v_key;
    end if;
  end loop;
  select * into v_current from public.privacy_of(v_me);
  select * into v_bot from public.bot_privacy_of(v_me);
  insert into public.social_privacy (
    user_id, friend_requests, messages, online_status, activity,
    mapping_stats, mapping_time, project_time, projects,
    discord_lookup, leaderboard, updated_at
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
    coalesce(p_settings ->> 'discord_lookup', v_bot.discord_lookup),
    coalesce(p_settings ->> 'leaderboard', v_bot.leaderboard),
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
    discord_lookup = excluded.discord_lookup,
    leaderboard = excluded.leaderboard,
    updated_at = excluded.updated_at;
  return public.get_my_privacy();
end;
$$;

grant execute on function public.set_my_privacy(jsonb) to authenticated;

-- The Cascade account a Discord account signs in to, with what the bot may
-- do with it. Null when the Discord account isn't linked.
create or replace function public.discord_account(p_discord_user_id text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user public.users;
  v_bot record;
begin
  if p_discord_user_id is null or p_discord_user_id !~ '^[1-9][0-9]{0,19}$' then
    return null;
  end if;
  select u.* into v_user from public.users u
    join public.account_identities i on i.user_id = u.id
    where i.provider = 'discord' and i.provider_user_id = p_discord_user_id;
  if v_user.id is null then
    return null;
  end if;
  select * into v_bot from public.bot_privacy_of(v_user.id);
  return json_build_object(
    'user_id', v_user.id,
    'username', v_user.username,
    'handle', case when public.find_user_id(v_user.username) = v_user.id
                   then v_user.username else v_user.id::text end,
    'is_admin', v_user.is_admin,
    'discord_lookup', v_bot.discord_lookup,
    'leaderboard', v_bot.leaderboard
  );
end;
$$;

revoke execute on function public.discord_account(text) from public, anon, authenticated;
grant execute on function public.discord_account(text) to service_role;

-- ---------------------------------------------------------------------------
-- Contributions
-- ---------------------------------------------------------------------------

create table if not exists public.contributions (
  id                   uuid primary key default gen_random_uuid(),
  -- The short reference people see in Discord, "#12".
  number               bigint generated always as identity,
  kind                 text not null,
  title                text not null,
  body                 text not null default '',
  status               text not null default 'pending',
  points               integer not null default 0,
  -- The Cascade account it counts for. Null for a Discord account that
  -- isn't linked yet; linking attaches its contributions.
  user_id              uuid references public.users(id) on delete set null,
  discord_user_id      text,
  discord_username     text,
  source               text not null default 'discord',
  review_channel_id    text,
  review_message_id    text,
  reviewed_by          uuid references public.users(id) on delete set null,
  reviewed_by_discord  text,
  reviewed_at          timestamptz,
  review_note          text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.contributions drop constraint if exists contributions_kind_check;
alter table public.contributions add constraint contributions_kind_check
  check (kind in ('bug', 'suggestion', 'other'));
alter table public.contributions drop constraint if exists contributions_status_check;
alter table public.contributions add constraint contributions_status_check
  check (status in ('pending', 'accepted', 'rejected'));
alter table public.contributions drop constraint if exists contributions_title_check;
alter table public.contributions add constraint contributions_title_check
  check (char_length(title) between 1 and 120);
alter table public.contributions drop constraint if exists contributions_body_check;
alter table public.contributions add constraint contributions_body_check
  check (char_length(body) <= 2000);
alter table public.contributions drop constraint if exists contributions_points_check;
alter table public.contributions add constraint contributions_points_check
  check (points between 0 and 1000 and (status = 'accepted' or points = 0));
alter table public.contributions drop constraint if exists contributions_source_check;
alter table public.contributions add constraint contributions_source_check
  check (source in ('discord', 'admin'));
alter table public.contributions drop constraint if exists contributions_discord_ids_check;
alter table public.contributions add constraint contributions_discord_ids_check
  check ((discord_user_id is null or discord_user_id ~ '^[1-9][0-9]{0,19}$')
     and (reviewed_by_discord is null or reviewed_by_discord ~ '^[1-9][0-9]{0,19}$'));
alter table public.contributions drop constraint if exists contributions_owner_check;
alter table public.contributions add constraint contributions_owner_check
  check (user_id is not null or discord_user_id is not null);

create unique index if not exists contributions_number_key on public.contributions (number);
create index if not exists contributions_status_created_idx
  on public.contributions (status, created_at desc);
create index if not exists contributions_user_idx on public.contributions (user_id);
create index if not exists contributions_discord_created_idx
  on public.contributions (discord_user_id, created_at desc);

-- One row of settings, changed with /cascade-admin points.
create table if not exists public.contribution_settings (
  id                 boolean primary key default true check (id),
  bug_points         integer not null default 10 check (bug_points between 0 and 1000),
  suggestion_points  integer not null default 5 check (suggestion_points between 0 and 1000),
  role_threshold     integer not null default 30 check (role_threshold between 1 and 100000),
  hourly_limit       integer not null default 3 check (hourly_limit between 1 and 50),
  daily_limit        integer not null default 10 check (daily_limit between 1 and 200),
  updated_at         timestamptz not null default now()
);

insert into public.contribution_settings (id) values (true) on conflict do nothing;

-- An admin's decision about the Contributor role, over the points.
create table if not exists public.contributor_overrides (
  discord_user_id  text primary key check (discord_user_id ~ '^[1-9][0-9]{0,19}$'),
  mode             text not null check (mode in ('grant', 'deny')),
  note             text check (note is null or char_length(note) <= 200),
  set_by_discord   text,
  created_at       timestamptz not null default now()
);

alter table public.contributions enable row level security;
alter table public.contribution_settings enable row level security;
alter table public.contributor_overrides enable row level security;
revoke all on table public.contributions from public, anon, authenticated;
revoke all on table public.contribution_settings from public, anon, authenticated;
revoke all on table public.contributor_overrides from public, anon, authenticated;

-- Cascade admins can read them, as they can read feedback.
grant select on table public.contributions to authenticated;
drop policy if exists contributions_admin_select on public.contributions;
create policy contributions_admin_select on public.contributions
  for select to authenticated using (public.is_admin());

-- A Discord account's contributions follow it to the Cascade account it is
-- linked to, but only the ones that don't belong to an account yet.
create or replace function public.attach_discord_contributions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.provider = 'discord' then
    update public.contributions set user_id = new.user_id, updated_at = now()
      where discord_user_id = new.provider_user_id and user_id is null;
  end if;
  return null;
end;
$$;

revoke execute on function public.attach_discord_contributions() from public, anon, authenticated;

drop trigger if exists account_identities_attach_contributions on public.account_identities;
create trigger account_identities_attach_contributions
  after insert on public.account_identities
  for each row execute function public.attach_discord_contributions();

create or replace function public.contribution_json(c public.contributions)
returns json
language sql
stable
as $$
  select json_build_object(
    'id', c.id,
    'number', c.number,
    'kind', c.kind,
    'title', c.title,
    'body', c.body,
    'status', c.status,
    'points', c.points,
    'discord_user_id', c.discord_user_id,
    'discord_username', c.discord_username,
    'linked', c.user_id is not null,
    'source', c.source,
    'review_channel_id', c.review_channel_id,
    'review_message_id', c.review_message_id,
    'reviewed_by_discord', c.reviewed_by_discord,
    'review_note', c.review_note,
    'created_at', c.created_at,
    'reviewed_at', c.reviewed_at
  );
$$;

revoke execute on function public.contribution_json(public.contributions) from public, anon, authenticated;

-- Points, counts and Contributor status for a Cascade account, a Discord
-- account, or both when they are linked.
create or replace function public.contributor_status(p_user uuid, p_discord_user_id text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_threshold integer;
  v_points integer;
  v_accepted integer;
  v_pending integer;
  v_override text;
  v_recent json;
begin
  select s.role_threshold into v_threshold from public.contribution_settings s where s.id;
  v_threshold := coalesce(v_threshold, 30);

  select coalesce(sum(c.points) filter (where c.status = 'accepted'), 0),
         count(*) filter (where c.status = 'accepted'),
         count(*) filter (where c.status = 'pending')
    into v_points, v_accepted, v_pending
    from public.contributions c
    where (p_user is not null and c.user_id = p_user)
       or (p_discord_user_id is not null and c.user_id is null
           and c.discord_user_id = p_discord_user_id);

  select coalesce(json_agg(json_build_object(
      'number', r.number, 'kind', r.kind, 'title', r.title,
      'points', r.points, 'reviewed_at', r.reviewed_at
    ) order by r.reviewed_at desc), '[]'::json)
    into v_recent
    from (
      select c.* from public.contributions c
      where c.status = 'accepted'
        and ((p_user is not null and c.user_id = p_user)
          or (p_discord_user_id is not null and c.user_id is null
              and c.discord_user_id = p_discord_user_id))
      order by c.reviewed_at desc nulls last
      limit 10
    ) r;

  if p_discord_user_id is not null then
    select o.mode into v_override from public.contributor_overrides o
      where o.discord_user_id = p_discord_user_id;
  end if;

  return json_build_object(
    'points', v_points,
    'accepted', v_accepted,
    'pending', v_pending,
    'threshold', v_threshold,
    'override', v_override,
    'contributor', case v_override
      when 'grant' then true
      when 'deny' then false
      else v_points >= v_threshold
    end,
    'recent', v_recent
  );
end;
$$;

revoke execute on function public.contributor_status(uuid, text) from public, anon, authenticated;
grant execute on function public.contributor_status(uuid, text) to service_role;

-- For profile cards: the account's own points and its Discord account's
-- override, without the history.
create or replace function public.is_contributor(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case (
      select o.mode from public.contributor_overrides o
      join public.account_identities i
        on i.provider = 'discord' and i.provider_user_id = o.discord_user_id
      where i.user_id = p_user
    )
    when 'grant' then true
    when 'deny' then false
    else coalesce((
        select sum(c.points) from public.contributions c
        where c.user_id = p_user and c.status = 'accepted'
      ), 0) >= coalesce((select s.role_threshold from public.contribution_settings s where s.id), 30)
  end;
$$;

revoke execute on function public.is_contributor(uuid) from public, anon, authenticated;

-- Sends a bug report or suggestion from Discord. Rate limited per Discord
-- account and across everyone, and the same title twice within 30 days is
-- refused, so the queue can't be flooded. Returns {id, number, linked} or
-- {error: 'title' | 'body' | 'rate_limited' | 'duplicate' | 'queue_full'}.
create or replace function public.submit_contribution(
  p_kind text,
  p_title text,
  p_body text,
  p_discord_user_id text,
  p_discord_username text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.contribution_settings;
  v_title text := btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g'));
  v_body text := btrim(coalesce(p_body, ''));
  v_row public.contributions;
  v_duplicate bigint;
begin
  if p_kind is null or p_kind not in ('bug', 'suggestion') then
    raise exception 'unknown contribution kind';
  end if;
  if p_discord_user_id is null or p_discord_user_id !~ '^[1-9][0-9]{0,19}$' then
    raise exception 'invalid Discord account';
  end if;
  if char_length(v_title) < 3 or char_length(v_title) > 120 then
    return json_build_object('error', 'title');
  end if;
  if char_length(v_body) > 2000 then
    return json_build_object('error', 'body');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('contribution:' || p_discord_user_id, 0));
  select * into v_settings from public.contribution_settings where id;

  if (select count(*) from public.contributions
      where discord_user_id = p_discord_user_id
        and created_at > now() - interval '1 hour') >= coalesce(v_settings.hourly_limit, 3)
     or (select count(*) from public.contributions
         where discord_user_id = p_discord_user_id
           and created_at > now() - interval '1 day') >= coalesce(v_settings.daily_limit, 10) then
    return json_build_object('error', 'rate_limited');
  end if;
  if (select count(*) from public.contributions where status = 'pending') >= 500 then
    return json_build_object('error', 'queue_full');
  end if;

  select c.number into v_duplicate from public.contributions c
    where c.discord_user_id = p_discord_user_id
      and lower(c.title) = lower(v_title)
      and c.status in ('pending', 'accepted')
      and c.created_at > now() - interval '30 days'
    limit 1;
  if v_duplicate is not null then
    return json_build_object('error', 'duplicate', 'number', v_duplicate);
  end if;

  insert into public.contributions (
    kind, title, body, user_id, discord_user_id, discord_username, source
  ) values (
    p_kind,
    v_title,
    v_body,
    public.identity_owner('discord', p_discord_user_id),
    p_discord_user_id,
    left(nullif(btrim(p_discord_username), ''), 64),
    'discord'
  )
  returning * into v_row;
  return json_build_object('id', v_row.id, 'number', v_row.number, 'linked', v_row.user_id is not null);
end;
$$;

revoke execute on function public.submit_contribution(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_contribution(text, text, text, text, text) to service_role;

-- Where the review message for a contribution was posted, so it can be
-- updated when someone reviews it.
create or replace function public.set_contribution_review_message(
  p_id uuid, p_channel_id text, p_message_id text
) returns void
language sql
security definer
set search_path = public
as $$
  update public.contributions set
    review_channel_id = p_channel_id,
    review_message_id = p_message_id,
    updated_at = now()
  where id = p_id
    and p_channel_id ~ '^[1-9][0-9]{0,19}$'
    and p_message_id ~ '^[1-9][0-9]{0,19}$';
$$;

revoke execute on function public.set_contribution_review_message(uuid, text, text) from public, anon, authenticated;
grant execute on function public.set_contribution_review_message(uuid, text, text) to service_role;

-- Accepts or rejects a pending contribution, once: the row is locked and only
-- a pending one changes, so two admins clicking at once award points once.
-- Nobody reviews their own. Points default to the kind's current value and
-- are kept with the contribution, so later setting changes don't rewrite
-- history. Returns {result: 'reviewed' | 'already_reviewed' | 'not_found' |
-- 'own_submission', contribution, status}.
create or replace function public.review_contribution(
  p_number bigint,
  p_accept boolean,
  p_reviewer_discord_id text,
  p_points integer default null,
  p_note text default null
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.contributions;
  v_settings public.contribution_settings;
  v_points integer;
begin
  if p_reviewer_discord_id is null or p_reviewer_discord_id !~ '^[1-9][0-9]{0,19}$' then
    raise exception 'invalid reviewer';
  end if;
  if p_points is not null and (p_points < 0 or p_points > 1000) then
    raise exception 'points must be between 0 and 1000';
  end if;
  select * into v_row from public.contributions where number = p_number for update;
  if v_row.id is null then
    return json_build_object('result', 'not_found');
  end if;
  if v_row.status <> 'pending' then
    return json_build_object('result', 'already_reviewed', 'contribution', public.contribution_json(v_row));
  end if;
  if v_row.discord_user_id = p_reviewer_discord_id then
    return json_build_object('result', 'own_submission', 'contribution', public.contribution_json(v_row));
  end if;

  select * into v_settings from public.contribution_settings where id;
  v_points := case when p_accept then coalesce(p_points, case v_row.kind
      when 'bug' then coalesce(v_settings.bug_points, 10)
      when 'suggestion' then coalesce(v_settings.suggestion_points, 5)
      else 0 end)
    else 0 end;

  update public.contributions set
    status = case when p_accept then 'accepted' else 'rejected' end,
    points = v_points,
    reviewed_by_discord = p_reviewer_discord_id,
    reviewed_by = public.identity_owner('discord', p_reviewer_discord_id),
    reviewed_at = now(),
    review_note = left(nullif(btrim(p_note), ''), 300),
    updated_at = now()
  where id = v_row.id
  returning * into v_row;

  return json_build_object(
    'result', 'reviewed',
    'contribution', public.contribution_json(v_row),
    'status', public.contributor_status(v_row.user_id, v_row.discord_user_id)
  );
end;
$$;

revoke execute on function public.review_contribution(bigint, boolean, text, integer, text) from public, anon, authenticated;
grant execute on function public.review_contribution(bigint, boolean, text, integer, text) to service_role;

-- Records a contribution an admin accepted outside the bot (a translation, a
-- fix, a map pack). Nobody awards themselves.
create or replace function public.award_contribution(
  p_discord_user_id text,
  p_title text,
  p_points integer,
  p_reviewer_discord_id text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g'));
  v_row public.contributions;
begin
  if p_discord_user_id is null or p_discord_user_id !~ '^[1-9][0-9]{0,19}$'
     or p_reviewer_discord_id is null or p_reviewer_discord_id !~ '^[1-9][0-9]{0,19}$' then
    raise exception 'invalid Discord account';
  end if;
  if p_discord_user_id = p_reviewer_discord_id then
    return json_build_object('result', 'own_submission');
  end if;
  if p_points is null or p_points < 1 or p_points > 1000 then
    raise exception 'points must be between 1 and 1000';
  end if;
  if char_length(v_title) < 3 or char_length(v_title) > 120 then
    raise exception 'the reason must be 3 to 120 characters';
  end if;
  insert into public.contributions (
    kind, title, status, points, user_id, discord_user_id, source,
    reviewed_by, reviewed_by_discord, reviewed_at
  ) values (
    'other', v_title, 'accepted', p_points,
    public.identity_owner('discord', p_discord_user_id), p_discord_user_id, 'admin',
    public.identity_owner('discord', p_reviewer_discord_id), p_reviewer_discord_id, now()
  )
  returning * into v_row;
  return json_build_object(
    'result', 'awarded',
    'contribution', public.contribution_json(v_row),
    'status', public.contributor_status(v_row.user_id, v_row.discord_user_id)
  );
end;
$$;

revoke execute on function public.award_contribution(text, text, integer, text) from public, anon, authenticated;
grant execute on function public.award_contribution(text, text, integer, text) to service_role;

-- 'grant' or 'deny' the Contributor role whatever the points say, or 'auto'
-- to go back to the points.
create or replace function public.set_contributor_override(
  p_discord_user_id text,
  p_mode text,
  p_note text,
  p_set_by_discord text
) returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_discord_user_id is null or p_discord_user_id !~ '^[1-9][0-9]{0,19}$' then
    raise exception 'invalid Discord account';
  end if;
  if p_mode = 'auto' then
    delete from public.contributor_overrides where discord_user_id = p_discord_user_id;
  elsif p_mode in ('grant', 'deny') then
    insert into public.contributor_overrides (discord_user_id, mode, note, set_by_discord)
      values (p_discord_user_id, p_mode, left(nullif(btrim(p_note), ''), 200), p_set_by_discord)
      on conflict (discord_user_id) do update set
        mode = excluded.mode,
        note = excluded.note,
        set_by_discord = excluded.set_by_discord,
        created_at = now();
  else
    raise exception 'mode must be grant, deny or auto';
  end if;
  return public.contributor_status(public.identity_owner('discord', p_discord_user_id), p_discord_user_id);
end;
$$;

revoke execute on function public.set_contributor_override(text, text, text, text) from public, anon, authenticated;
grant execute on function public.set_contributor_override(text, text, text, text) to service_role;

create or replace function public.get_contribution_settings()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'bug_points', s.bug_points,
    'suggestion_points', s.suggestion_points,
    'role_threshold', s.role_threshold,
    'hourly_limit', s.hourly_limit,
    'daily_limit', s.daily_limit
  )
  from public.contribution_settings s where s.id;
$$;

revoke execute on function public.get_contribution_settings() from public, anon, authenticated;
grant execute on function public.get_contribution_settings() to service_role;

-- Changes any of the settings; null leaves one as it is.
create or replace function public.set_contribution_settings(
  p_bug_points integer default null,
  p_suggestion_points integer default null,
  p_role_threshold integer default null
) returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.contribution_settings (id) values (true) on conflict do nothing;
  update public.contribution_settings set
    bug_points = coalesce(p_bug_points, bug_points),
    suggestion_points = coalesce(p_suggestion_points, suggestion_points),
    role_threshold = coalesce(p_role_threshold, role_threshold),
    updated_at = now()
  where id;
  return public.get_contribution_settings();
end;
$$;

revoke execute on function public.set_contribution_settings(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.set_contribution_settings(integer, integer, integer) to service_role;

create or replace function public.pending_contributions(p_limit integer default 5)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(public.contribution_json(c) order by c.created_at), '[]'::json)
  from public.contributions c
  where c.id in (
    select p.id from public.contributions p
    where p.status = 'pending'
    order by p.created_at
    limit greatest(1, least(coalesce(p_limit, 5), 10))
  );
$$;

revoke execute on function public.pending_contributions(integer) from public, anon, authenticated;
grant execute on function public.pending_contributions(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Leaderboards
-- ---------------------------------------------------------------------------

-- Only people who turned the leaderboard on, and for mapping numbers only
-- those their privacy settings already show to everyone. Names only: never
-- the Discord account.
create or replace function public.bot_leaderboard(p_metric text, p_limit integer default 10)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 25));
  v_rows json;
begin
  if p_metric is null or p_metric not in ('mapping_time', 'notes_placed', 'maps_edited', 'contribution_points') then
    raise exception 'unknown leaderboard';
  end if;
  with opted as (
    select u.id, u.username,
           case when public.find_user_id(u.username) = u.id then u.username else u.id::text end as handle,
           s.mapping_stats, s.mapping_time
    from public.users u
    join public.social_privacy s on s.user_id = u.id
    where s.leaderboard = 'everyone'
  ),
  scored as (
    select o.username, o.handle,
      case p_metric
        when 'mapping_time' then case when o.mapping_time = 'everyone' then (
          select sum(d.edit_seconds + d.playtest_seconds + d.review_seconds)
          from public.mapping_days d where d.user_id = o.id) end
        when 'notes_placed' then case when o.mapping_stats = 'everyone' then (
          select sum(d.notes_placed) from public.mapping_days d where d.user_id = o.id) end
        when 'maps_edited' then case when o.mapping_stats = 'everyone' then (
          select count(*) from public.mapping_projects p
          where p.user_id = o.id and p.edit_seconds > 0) end
        when 'contribution_points' then (
          select sum(c.points) from public.contributions c
          where c.user_id = o.id and c.status = 'accepted')
      end::bigint as value
    from opted o
  )
  select coalesce(json_agg(json_build_object(
      'username', r.username, 'handle', r.handle, 'value', r.value
    ) order by r.value desc, r.username), '[]'::json)
    into v_rows
  from (
    select * from scored where value > 0
    order by value desc, username
    limit v_limit
  ) r;
  return v_rows;
end;
$$;

revoke execute on function public.bot_leaderboard(text, integer) from public, anon, authenticated;
grant execute on function public.bot_leaderboard(text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Changelog and roadmap
-- ---------------------------------------------------------------------------

create index if not exists notifications_app_update_idx
  on public.notifications (dedupe_key, created_at desc)
  where kind = 'app_update';

-- The update notes admins have published (publish_app_update), once each.
create or replace function public.recent_app_updates(p_limit integer default 5)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(json_build_object(
      'title', r.title,
      'body', r.body,
      'action_url', r.action_url,
      'version', r.version,
      'created_at', r.created_at
    ) order by r.created_at desc), '[]'::json)
  from (
    select * from (
      select distinct on (n.dedupe_key)
        n.title, n.body, n.action_url, n.created_at,
        case when n.dedupe_key ~* '^app-update:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             then null else substring(n.dedupe_key from 12) end as version
      from public.notifications n
      where n.kind = 'app_update' and n.dedupe_key like 'app-update:%'
      order by n.dedupe_key, n.created_at desc
    ) d
    order by d.created_at desc
    limit greatest(1, least(coalesce(p_limit, 5), 10))
  ) r;
$$;

revoke execute on function public.recent_app_updates(integer) from public, anon, authenticated;
grant execute on function public.recent_app_updates(integer) to service_role;

create table if not exists public.roadmap_items (
  id          bigint generated always as identity primary key,
  title       text not null check (char_length(title) between 1 and 100),
  details     text not null default '' check (char_length(details) <= 300),
  status      text not null default 'planned' check (status in ('planned', 'in_progress', 'done')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- The roadmap is public, like the changelog.
alter table public.roadmap_items enable row level security;
revoke all on table public.roadmap_items from public, anon, authenticated;
grant select on table public.roadmap_items to anon, authenticated;
drop policy if exists roadmap_items_select on public.roadmap_items;
create policy roadmap_items_select on public.roadmap_items
  for select to anon, authenticated using (true);

create or replace function public.roadmap_list()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(json_build_object(
      'id', r.id, 'title', r.title, 'details', r.details,
      'status', r.status, 'updated_at', r.updated_at
    ) order by case r.status when 'in_progress' then 0 when 'planned' then 1 else 2 end,
               r.updated_at desc), '[]'::json)
  from (
    select * from public.roadmap_items
    where status <> 'done' or updated_at > now() - interval '60 days'
    order by updated_at desc
    limit 25
  ) r;
$$;

grant execute on function public.roadmap_list() to anon, authenticated, service_role;

create or replace function public.roadmap_save(
  p_id bigint,
  p_title text,
  p_details text,
  p_status text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.roadmap_items;
begin
  if p_id is null then
    insert into public.roadmap_items (title, details, status)
      values (btrim(p_title), coalesce(btrim(p_details), ''), coalesce(p_status, 'planned'))
      returning * into v_row;
  else
    update public.roadmap_items set
      title = coalesce(nullif(btrim(p_title), ''), title),
      details = coalesce(btrim(p_details), details),
      status = coalesce(p_status, status),
      updated_at = now()
    where id = p_id
    returning * into v_row;
  end if;
  if v_row.id is null then
    return null;
  end if;
  return json_build_object('id', v_row.id, 'title', v_row.title, 'details', v_row.details, 'status', v_row.status);
end;
$$;

revoke execute on function public.roadmap_save(bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.roadmap_save(bigint, text, text, text) to service_role;

create or replace function public.roadmap_remove(p_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.roadmap_items where id = p_id;
  return found;
end;
$$;

revoke execute on function public.roadmap_remove(bigint) from public, anon, authenticated;
grant execute on function public.roadmap_remove(bigint) to service_role;

-- ---------------------------------------------------------------------------
-- The Contributor badge
-- ---------------------------------------------------------------------------

-- 0047's card, plus whether the account is a Cascade contributor.
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
    'handle', case when public.find_user_id(v_user.username) = v_user.id
                   then v_user.username else v_user.id::text end,
    'avatar_url', v_user.avatar_url,
    'is_admin', v_user.is_admin,
    'is_contributor', public.is_contributor(v_user.id),
    'country_code', coalesce(v_user.country_code, v_cache.country_code),
    'relationship', public.relationship_with(p_viewer, p_user),
    'presence', case when v_blocked_me then null else public.presence_for(p_user, p_viewer) end,
    'osu', case when v_cache.user_id is null or v_user.osu_id is null then null else json_build_object(
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

notify pgrst, 'reload schema';

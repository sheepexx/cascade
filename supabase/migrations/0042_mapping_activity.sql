-- Time spent mapping in Cascade, and what was done in it.
--
-- The app decides second by second whether someone is actively editing,
-- playtesting or reviewing (playing the song in the editor), and reports
-- what it counted about once a minute through record_mapping_activity, along
-- with the span of time those seconds fell in. The database does not take
-- the numbers on trust: it keeps a credit horizon per account
-- (user_presence.credit_until), credits only the part of a report's span that
-- lies after the horizon, and then moves the horizon to the end of the span.
-- Two windows reporting the same minute therefore count it once, credited
-- time can never add up to more than the time that actually passed, and
-- nothing older than two days is accepted, so no time is claimed
-- retroactively. (Switching rapidly between two windows within one minute
-- can undercount a little; it never overcounts.)
--
-- Days are the mapper's own calendar days (the app sends its local date), so
-- the activity calendar matches what the mapper lived through.
--
-- Only aggregates are stored: one row per day, per project and per
-- difficulty, plus one per editing session for the longest-session figure.
-- Who may see any of it is decided by the privacy settings in 0041.
--
-- Safe to run more than once.

create table if not exists public.mapping_days (
  user_id              uuid not null references public.users(id) on delete cascade,
  day                  date not null,
  edit_seconds         integer not null default 0,
  playtest_seconds     integer not null default 0,
  review_seconds       integer not null default 0,
  notes_placed         integer not null default 0,
  notes_deleted        integer not null default 0,
  timing_changes       integer not null default 0,
  sv_changes           integer not null default 0,
  playtests            integer not null default 0,
  exports              integer not null default 0,
  maps_created         integer not null default 0,
  difficulties_created integer not null default 0,
  primary key (user_id, day)
);

-- project_key is "cloud:<project id>" for maps saved to the account and
-- "local:<id>" for maps that only live on a device. Title and artist are the
-- last ones seen, so the list still reads well after a local map is gone.
create table if not exists public.mapping_projects (
  user_id            uuid not null references public.users(id) on delete cascade,
  project_key        text not null check (project_key ~ '^(cloud|local):[A-Za-z0-9_-]{1,64}$'),
  project_id         uuid references public.projects(id) on delete set null,
  title              text not null default '' check (char_length(title) <= 200),
  artist             text not null default '' check (char_length(artist) <= 200),
  beatmapset_id      bigint check (beatmapset_id is null or beatmapset_id > 0),
  created_in_cascade boolean not null default false,
  first_active_at    timestamptz not null default now(),
  last_active_at     timestamptz not null default now(),
  edit_seconds       integer not null default 0,
  playtest_seconds   integer not null default 0,
  review_seconds     integer not null default 0,
  notes_placed       integer not null default 0,
  notes_deleted      integer not null default 0,
  exports            integer not null default 0,
  primary key (user_id, project_key)
);

create index if not exists mapping_projects_recent_idx
  on public.mapping_projects(user_id, last_active_at desc);

create table if not exists public.mapping_difficulties (
  user_id          uuid not null,
  project_key      text not null,
  difficulty_key   text not null check (char_length(difficulty_key) between 1 and 64),
  name             text not null default '' check (char_length(name) <= 120),
  edit_seconds     integer not null default 0,
  playtest_seconds integer not null default 0,
  review_seconds   integer not null default 0,
  last_active_at   timestamptz not null default now(),
  primary key (user_id, project_key, difficulty_key),
  foreign key (user_id, project_key)
    references public.mapping_projects(user_id, project_key) on delete cascade
);

-- One row per stretch of editing in one window. The app starts a new
-- session after ten idle minutes.
create table if not exists public.mapping_sessions (
  id             uuid primary key,
  user_id        uuid not null references public.users(id) on delete cascade,
  started_at     timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  active_seconds integer not null default 0
);

create index if not exists mapping_sessions_user_idx
  on public.mapping_sessions(user_id, active_seconds desc);

alter table public.mapping_days enable row level security;
alter table public.mapping_projects enable row level security;
alter table public.mapping_difficulties enable row level security;
alter table public.mapping_sessions enable row level security;
revoke all on table public.mapping_days from anon, authenticated;
revoke all on table public.mapping_projects from anon, authenticated;
revoke all on table public.mapping_difficulties from anon, authenticated;
revoke all on table public.mapping_sessions from anon, authenticated;

create or replace function public.clamp_int(p_value jsonb, p_max integer)
returns integer
language sql
immutable
as $$
  select case
    when p_value is null or jsonb_typeof(p_value) <> 'number' then 0
    else greatest(0, least(p_max, floor((p_value #>> '{}')::numeric)::bigint))::integer
  end;
$$;

-- A report's day, or null when it isn't a date within the last two days
-- (or tomorrow, for mappers ahead of the server's time zone).
create or replace function public.mapping_day(p_text text)
returns date
language plpgsql
stable
as $$
declare
  v_day date;
begin
  if p_text is null or p_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return null;
  end if;
  v_day := p_text::date;
  if v_day < current_date - 2 or v_day > current_date + 1 then
    return null;
  end if;
  return v_day;
exception when others then
  return null;
end;
$$;

-- p_entries: up to 32 objects, each
--   { day, project_key, project_title?, project_artist?, beatmapset_id?,
--     difficulty_key?, difficulty_name?, edit, playtest, review,
--     notes_placed, notes_deleted, timing_changes, sv_changes, playtests,
--     exports, maps_created, difficulties_created }
-- p_from and p_to bound the first and last active second in the report.
-- Returns the seconds actually credited.
drop function if exists public.record_mapping_activity(uuid, jsonb);
create or replace function public.record_mapping_activity(
  p_session uuid,
  p_entries jsonb,
  p_from timestamptz,
  p_to timestamptz
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_now timestamptz := now();
  v_until timestamptz;
  v_start timestamptz;
  v_end timestamptz;
  v_allowed numeric;
  v_total numeric := 0;
  v_credit numeric;
  v_factor numeric;
  v_entry jsonb;
  v_day date;
  v_key text;
  v_project uuid;
  v_edit integer;
  v_playtest integer;
  v_review integer;
  v_credited integer := 0;
  v_diff text;
begin
  if v_me is null then
    raise exception 'sign in first';
  end if;
  if p_session is null then
    raise exception 'session required';
  end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) > 32 then
    raise exception 'entries must be an array of at most 32 items';
  end if;

  insert into public.user_presence (user_id, last_seen_at)
    values (v_me, v_now)
    on conflict (user_id) do update set last_seen_at = excluded.last_seen_at;
  select credit_until into v_until from public.user_presence
    where user_id = v_me for update;

  -- The span may end up to ten seconds ahead of the server clock, to absorb
  -- clock skew, and may not start more than two days back.
  v_start := greatest(
    coalesce(p_from, v_now),
    coalesce(v_until, '-infinity'::timestamptz),
    v_now - interval '2 days'
  );
  v_end := least(coalesce(p_to, v_now), v_now + interval '10 seconds');
  v_allowed := greatest(0, extract(epoch from (v_end - v_start)));

  for v_entry in select * from jsonb_array_elements(p_entries) loop
    v_day := public.mapping_day(v_entry ->> 'day');
    if v_day is not null then
      v_total := v_total
        + public.clamp_int(v_entry -> 'edit', 600)
        + public.clamp_int(v_entry -> 'playtest', 600)
        + public.clamp_int(v_entry -> 'review', 600);
    end if;
  end loop;
  v_credit := least(v_total, v_allowed, 3600);
  v_factor := case when v_total > 0 then v_credit / v_total else 0 end;

  for v_entry in select * from jsonb_array_elements(p_entries) loop
    v_day := public.mapping_day(v_entry ->> 'day');
    if v_day is null then
      continue;
    end if;

    v_edit := floor(public.clamp_int(v_entry -> 'edit', 600) * v_factor);
    v_playtest := floor(public.clamp_int(v_entry -> 'playtest', 600) * v_factor);
    v_review := floor(public.clamp_int(v_entry -> 'review', 600) * v_factor);
    v_credited := v_credited + v_edit + v_playtest + v_review;
    if v_edit + v_playtest + v_review = 0
       and public.clamp_int(v_entry -> 'notes_placed', 1) = 0
       and public.clamp_int(v_entry -> 'notes_deleted', 1) = 0
       and public.clamp_int(v_entry -> 'timing_changes', 1) = 0
       and public.clamp_int(v_entry -> 'sv_changes', 1) = 0
       and public.clamp_int(v_entry -> 'playtests', 1) = 0
       and public.clamp_int(v_entry -> 'exports', 1) = 0
       and public.clamp_int(v_entry -> 'maps_created', 1) = 0
       and public.clamp_int(v_entry -> 'difficulties_created', 1) = 0 then
      continue;
    end if;

    insert into public.mapping_days as d (
      user_id, day, edit_seconds, playtest_seconds, review_seconds,
      notes_placed, notes_deleted, timing_changes, sv_changes, playtests,
      exports, maps_created, difficulties_created
    ) values (
      v_me, v_day, v_edit, v_playtest, v_review,
      public.clamp_int(v_entry -> 'notes_placed', 20000),
      public.clamp_int(v_entry -> 'notes_deleted', 20000),
      public.clamp_int(v_entry -> 'timing_changes', 5000),
      public.clamp_int(v_entry -> 'sv_changes', 5000),
      public.clamp_int(v_entry -> 'playtests', 100),
      public.clamp_int(v_entry -> 'exports', 100),
      public.clamp_int(v_entry -> 'maps_created', 20),
      public.clamp_int(v_entry -> 'difficulties_created', 100)
    )
    on conflict (user_id, day) do update set
      edit_seconds = d.edit_seconds + excluded.edit_seconds,
      playtest_seconds = d.playtest_seconds + excluded.playtest_seconds,
      review_seconds = d.review_seconds + excluded.review_seconds,
      notes_placed = d.notes_placed + excluded.notes_placed,
      notes_deleted = d.notes_deleted + excluded.notes_deleted,
      timing_changes = d.timing_changes + excluded.timing_changes,
      sv_changes = d.sv_changes + excluded.sv_changes,
      playtests = d.playtests + excluded.playtests,
      exports = d.exports + excluded.exports,
      maps_created = d.maps_created + excluded.maps_created,
      difficulties_created = d.difficulties_created + excluded.difficulties_created;

    v_key := v_entry ->> 'project_key';
    if v_key is null or v_key !~ '^(cloud|local):[A-Za-z0-9_-]{1,64}$' then
      continue;
    end if;
    v_project := null;
    if v_key ~ '^cloud:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_project := substr(v_key, 7)::uuid;
      if not public.can_view_project(v_project) then
        v_project := null;
      end if;
    end if;

    insert into public.mapping_projects as p (
      user_id, project_key, project_id, title, artist, beatmapset_id,
      created_in_cascade, first_active_at, last_active_at,
      edit_seconds, playtest_seconds, review_seconds,
      notes_placed, notes_deleted, exports
    ) values (
      v_me, v_key, v_project,
      left(coalesce(v_entry ->> 'project_title', ''), 200),
      left(coalesce(v_entry ->> 'project_artist', ''), 200),
      case when (v_entry ->> 'beatmapset_id') ~ '^[1-9][0-9]{0,11}$'
           then (v_entry ->> 'beatmapset_id')::bigint end,
      public.clamp_int(v_entry -> 'maps_created', 20) > 0,
      v_now, v_now,
      v_edit, v_playtest, v_review,
      public.clamp_int(v_entry -> 'notes_placed', 20000),
      public.clamp_int(v_entry -> 'notes_deleted', 20000),
      public.clamp_int(v_entry -> 'exports', 100)
    )
    on conflict (user_id, project_key) do update set
      project_id = coalesce(excluded.project_id, p.project_id),
      title = case when excluded.title <> '' then excluded.title else p.title end,
      artist = case when excluded.title <> '' then excluded.artist else p.artist end,
      beatmapset_id = coalesce(excluded.beatmapset_id, p.beatmapset_id),
      created_in_cascade = p.created_in_cascade or excluded.created_in_cascade,
      last_active_at = excluded.last_active_at,
      edit_seconds = p.edit_seconds + excluded.edit_seconds,
      playtest_seconds = p.playtest_seconds + excluded.playtest_seconds,
      review_seconds = p.review_seconds + excluded.review_seconds,
      notes_placed = p.notes_placed + excluded.notes_placed,
      notes_deleted = p.notes_deleted + excluded.notes_deleted,
      exports = p.exports + excluded.exports;

    v_diff := v_entry ->> 'difficulty_key';
    if v_diff is not null and char_length(v_diff) between 1 and 64 then
      insert into public.mapping_difficulties as md (
        user_id, project_key, difficulty_key, name,
        edit_seconds, playtest_seconds, review_seconds, last_active_at
      ) values (
        v_me, v_key, v_diff, left(coalesce(v_entry ->> 'difficulty_name', ''), 120),
        v_edit, v_playtest, v_review, v_now
      )
      on conflict (user_id, project_key, difficulty_key) do update set
        name = case when excluded.name <> '' then excluded.name else md.name end,
        edit_seconds = md.edit_seconds + excluded.edit_seconds,
        playtest_seconds = md.playtest_seconds + excluded.playtest_seconds,
        review_seconds = md.review_seconds + excluded.review_seconds,
        last_active_at = excluded.last_active_at;
    end if;
  end loop;

  if v_credited > 0 then
    update public.user_presence
      set credit_until = greatest(coalesce(credit_until, v_end), v_end)
      where user_id = v_me;
  end if;

  if v_credited > 0 then
    insert into public.mapping_sessions as s (id, user_id, started_at, last_active_at, active_seconds)
      values (p_session, v_me, v_now - make_interval(secs => v_credited), v_now, v_credited)
      on conflict (id) do update set
        last_active_at = excluded.last_active_at,
        active_seconds = s.active_seconds + excluded.active_seconds
      where s.user_id = v_me;
  end if;

  return v_credited;
end;
$$;

grant execute on function public.record_mapping_activity(uuid, jsonb, timestamptz, timestamptz) to authenticated;

-- Someone's mapping statistics, as far as the caller may see them. Anyone may
-- ask, signed in or not. Sections the owner keeps private come back null,
-- and the calendar carries only relative levels (0-4) when mapping time is
-- private but activity is not.
create or replace function public.get_mapping_stats(p_user uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_priv record;
  v_stats boolean;
  v_time boolean;
  v_project_time boolean;
  v_projects boolean;
  v_max integer;
  v_counters json;
  v_totals json;
  v_calendar json;
  v_project_list json;
  v_map_times json;
begin
  if not exists (select 1 from public.users where id = p_user) then
    return null;
  end if;
  select * into v_priv from public.privacy_of(p_user);
  v_stats := public.can_view_level(v_priv.mapping_stats, p_user, v_me);
  v_time := public.can_view_level(v_priv.mapping_time, p_user, v_me);
  v_project_time := public.can_view_level(v_priv.project_time, p_user, v_me);
  v_projects := public.can_view_level(v_priv.projects, p_user, v_me);

  if v_stats then
    select json_build_object(
      'notes_placed', coalesce(sum(d.notes_placed), 0),
      'notes_deleted', coalesce(sum(d.notes_deleted), 0),
      'timing_changes', coalesce(sum(d.timing_changes), 0),
      'sv_changes', coalesce(sum(d.sv_changes), 0),
      'playtests', coalesce(sum(d.playtests), 0),
      'exports', coalesce(sum(d.exports), 0),
      'maps_created', coalesce(sum(d.maps_created), 0),
      'difficulties_created', coalesce(sum(d.difficulties_created), 0),
      'active_days', count(*) filter (where d.edit_seconds + d.playtest_seconds + d.review_seconds > 0),
      'maps_edited', (select count(*) from public.mapping_projects p
                      where p.user_id = p_user and p.edit_seconds > 0),
      'first_day', min(d.day)
    ) into v_counters
    from public.mapping_days d where d.user_id = p_user;

    select max(d.edit_seconds + d.playtest_seconds + d.review_seconds) into v_max
      from public.mapping_days d
      where d.user_id = p_user and d.day >= current_date - 371;

    select coalesce(json_agg(json_build_object(
      'day', d.day,
      'level', case
        when d.edit_seconds + d.playtest_seconds + d.review_seconds = 0 then 0
        else greatest(1, least(4, ceil(4.0 * (d.edit_seconds + d.playtest_seconds + d.review_seconds) / nullif(v_max, 0))))::int
      end,
      'edit', case when v_time then d.edit_seconds end,
      'playtest', case when v_time then d.playtest_seconds end,
      'review', case when v_time then d.review_seconds end
    ) order by d.day), '[]'::json) into v_calendar
    from public.mapping_days d
    where d.user_id = p_user and d.day >= current_date - 371;
  end if;

  if v_time then
    select json_build_object(
      'edit', coalesce(sum(d.edit_seconds), 0),
      'playtest', coalesce(sum(d.playtest_seconds), 0),
      'review', coalesce(sum(d.review_seconds), 0),
      'longest_session', (select coalesce(max(s.active_seconds), 0)
                          from public.mapping_sessions s where s.user_id = p_user)
    ) into v_totals
    from public.mapping_days d where d.user_id = p_user;
  end if;

  if v_projects then
    select coalesce(json_agg(json_build_object(
      'project_key', p.project_key,
      'project_id', case when v_me = p_user then p.project_id end,
      'title', p.title,
      'artist', p.artist,
      'beatmapset_id', p.beatmapset_id,
      'created_in_cascade', p.created_in_cascade,
      'first_active_at', p.first_active_at,
      'last_active_at', p.last_active_at,
      'shared_slug', (select s.slug from public.shared_maps s
                      where p.project_id is not null and s.project_id = p.project_id
                      limit 1),
      'edit', case when v_project_time then p.edit_seconds end,
      'playtest', case when v_project_time then p.playtest_seconds end,
      'review', case when v_project_time then p.review_seconds end,
      'notes_placed', p.notes_placed,
      'difficulties', case when v_project_time then (
        select coalesce(json_agg(json_build_object(
          'key', md.difficulty_key,
          'name', md.name,
          'edit', md.edit_seconds,
          'playtest', md.playtest_seconds,
          'review', md.review_seconds
        ) order by md.edit_seconds desc), '[]'::json)
        from public.mapping_difficulties md
        where md.user_id = p.user_id and md.project_key = p.project_key
      ) end
    ) order by p.last_active_at desc), '[]'::json) into v_project_list
    from (
      select * from public.mapping_projects
      where user_id = p_user
      order by last_active_at desc
      limit 100
    ) p;
  end if;

  -- Per-map time for the osu! beatmaps on the profile, which are public
  -- anyway, even when the Cascade project list itself is private.
  if v_project_time then
    select coalesce(json_agg(json_build_object(
      'beatmapset_id', p.beatmapset_id,
      'edit', sum_edit,
      'playtest', sum_playtest,
      'review', sum_review,
      'last_active_at', last_active
    )), '[]'::json) into v_map_times
    from (
      select beatmapset_id,
             sum(edit_seconds) as sum_edit,
             sum(playtest_seconds) as sum_playtest,
             sum(review_seconds) as sum_review,
             max(last_active_at) as last_active
      from public.mapping_projects
      where user_id = p_user and beatmapset_id is not null
      group by beatmapset_id
    ) p;
  end if;

  return json_build_object(
    'visible', json_build_object(
      'mapping_stats', v_stats,
      'mapping_time', v_time,
      'project_time', v_project_time,
      'projects', v_projects
    ),
    'counters', v_counters,
    'totals', v_totals,
    'calendar', v_calendar,
    'projects', v_project_list,
    'map_times', v_map_times
  );
end;
$$;

grant execute on function public.get_mapping_stats(uuid) to anon, authenticated;

-- Forget the mapping time recorded for one of the caller's projects (or all
-- of it), for someone who wants their statistics gone.
create or replace function public.clear_mapping_activity(p_project_key text default null)
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
  if p_project_key is null then
    delete from public.mapping_days where user_id = v_me;
    delete from public.mapping_projects where user_id = v_me;
    delete from public.mapping_sessions where user_id = v_me;
  else
    delete from public.mapping_projects where user_id = v_me and project_key = p_project_key;
  end if;
end;
$$;

grant execute on function public.clear_mapping_activity(text) to authenticated;

notify pgrst, 'reload schema';

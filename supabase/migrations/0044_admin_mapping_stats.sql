-- Admins see every mapping statistic.
--
-- Mapping activity, mapping time, per-map time and the Cascade project list
-- follow each person's privacy settings (0041, 0042). Admins now see all of
-- them, on profiles and in the admin panel, whatever the settings and blocks
-- say; get_mapping_stats says when that is the case (admin_override), so the
-- profile can show that the view is an admin's. Presence, what someone is
-- working on and private messages stay private to admins too.
--
-- Also adds admin_mapping_totals for the admin panel's user list.
--
-- Safe to run more than once.

-- Like can_view_level, but admins always may. A block hides statistics from
-- the blocked person unless they are an admin.
create or replace function public.can_view_stats(
  p_level text, p_owner uuid, p_viewer uuid, p_blocked_viewer boolean
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or (not p_blocked_viewer and public.can_view_level(p_level, p_owner, p_viewer));
$$;

revoke execute on function public.can_view_stats(text, uuid, uuid, boolean) from public, anon, authenticated;

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
      'mapping_stats', public.can_view_stats(v_priv.mapping_stats, v_id, v_me, v_blocked_me),
      'mapping_time', public.can_view_stats(v_priv.mapping_time, v_id, v_me, v_blocked_me),
      'project_time', public.can_view_stats(v_priv.project_time, v_id, v_me, v_blocked_me),
      'projects', public.can_view_stats(v_priv.projects, v_id, v_me, v_blocked_me)
    )
  ))::json;
end;
$$;

grant execute on function public.get_profile(text) to anon, authenticated;

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
  v_admin_override boolean;
begin
  if not exists (select 1 from public.users where id = p_user) then
    return null;
  end if;
  select * into v_priv from public.privacy_of(p_user);
  v_stats := public.can_view_stats(v_priv.mapping_stats, p_user, v_me, false);
  v_time := public.can_view_stats(v_priv.mapping_time, p_user, v_me, false);
  v_project_time := public.can_view_stats(v_priv.project_time, p_user, v_me, false);
  v_projects := public.can_view_stats(v_priv.projects, p_user, v_me, false);
  -- True when the caller sees something only because they are an admin.
  v_admin_override := public.is_admin() and v_me is distinct from p_user and not (
    public.can_view_level(v_priv.mapping_stats, p_user, v_me)
    and public.can_view_level(v_priv.mapping_time, p_user, v_me)
    and public.can_view_level(v_priv.project_time, p_user, v_me)
    and public.can_view_level(v_priv.projects, p_user, v_me)
  );

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
      'project_id', case when v_me = p_user or public.is_admin() then p.project_id end,
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
    'admin_override', v_admin_override,
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

-- Mapping totals for every account that has any, for the admin panel's user
-- list.
create or replace function public.admin_mapping_totals()
returns table (
  user_id          uuid,
  edit_seconds     bigint,
  playtest_seconds bigint,
  review_seconds   bigint,
  active_days      bigint,
  last_day         date
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin access required';
  end if;
  return query
    select d.user_id,
           sum(d.edit_seconds)::bigint,
           sum(d.playtest_seconds)::bigint,
           sum(d.review_seconds)::bigint,
           count(*) filter (where d.edit_seconds + d.playtest_seconds + d.review_seconds > 0)::bigint,
           max(d.day)
    from public.mapping_days d
    group by d.user_id;
end;
$$;

grant execute on function public.admin_mapping_totals() to authenticated;

notify pgrst, 'reload schema';

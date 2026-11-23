-- Bug reports and suggestions from the Discord bot become posts in the
-- server's forum, as people already post there by hand. This keeps which
-- post a contribution became, so a review can answer in it.
--
-- Contribution points also become public: everyone with accepted
-- contributions is on that leaderboard, by their Discord account, as their
-- forum posts and the Contributor role already are. The mapping leaderboards
-- stay opt-in, since those numbers follow people's privacy settings.
--
-- Safe to run more than once. The bot works without it; reviews just don't
-- reply in the post, and the points leaderboard stays opt-in, until it is
-- applied.

alter table public.contributions
  add column if not exists forum_thread_id text;

alter table public.contributions
  drop constraint if exists contributions_forum_thread_id_check;
alter table public.contributions
  add constraint contributions_forum_thread_id_check
  check (forum_thread_id is null or forum_thread_id ~ '^[1-9][0-9]{0,19}$');

-- 0048's shape, plus the forum post.
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
    'forum_thread_id', c.forum_thread_id,
    'reviewed_by_discord', c.reviewed_by_discord,
    'review_note', c.review_note,
    'created_at', c.created_at,
    'reviewed_at', c.reviewed_at
  );
$$;

revoke execute on function public.contribution_json(public.contributions) from public, anon, authenticated;

create or replace function public.set_contribution_forum_thread(p_id uuid, p_thread_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.contributions set
    forum_thread_id = p_thread_id,
    updated_at = now()
  where id = p_id
    and p_thread_id ~ '^[1-9][0-9]{0,19}$';
$$;

revoke execute on function public.set_contribution_forum_thread(uuid, text) from public, anon, authenticated;
grant execute on function public.set_contribution_forum_thread(uuid, text) to service_role;

-- 0048's leaderboards, with contribution points open to everyone. Those rows
-- carry the Discord account instead of a Cascade name, so a board never says
-- which Cascade account someone's Discord account belongs to.
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

  if p_metric = 'contribution_points' then
    select coalesce(json_agg(json_build_object(
        'discord_user_id', r.discord_user_id, 'username', null, 'handle', null, 'value', r.value
      ) order by r.value desc, r.discord_user_id), '[]'::json)
      into v_rows
    from (
      select c.discord_user_id, sum(c.points)::bigint as value
      from public.contributions c
      where c.status = 'accepted' and c.discord_user_id is not null
      group by c.discord_user_id
      having sum(c.points) > 0
      order by value desc, c.discord_user_id
      limit v_limit
    ) r;
    return v_rows;
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

-- How every account signs in, for the admin panel's user list. Admins only;
-- identities stay unreadable to everyone else.
create or replace function public.admin_account_identities()
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
      'user_id', i.user_id,
      'provider', i.provider,
      'provider_user_id', i.provider_user_id,
      'display_name', i.display_name,
      'created_at', i.created_at,
      'last_used_at', i.last_used_at
    ) order by i.user_id, i.provider), '[]'::json)
    from public.account_identities i
  );
end;
$$;

revoke execute on function public.admin_account_identities() from public, anon;
grant execute on function public.admin_account_identities() to authenticated;

notify pgrst, 'reload schema';

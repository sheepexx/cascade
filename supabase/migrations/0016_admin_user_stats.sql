-- Per-user analytics for the admin Users tab.
--
-- 0014 aggregates events by type across everyone; this aggregates them by
-- account so the users list can be sorted by activity and each user can be
-- opened for a breakdown. Same SECURITY DEFINER + is_admin() gate as
-- admin_event_stats: the aggregates span rows RLS would otherwise hide.

create index if not exists analytics_events_user_idx
  on public.analytics_events(user_id, created_at desc);

create or replace function public.admin_user_summaries()
returns table (
  id                 uuid,
  osu_id             bigint,
  username           text,
  avatar_url         text,
  is_admin           boolean,
  created_at         timestamptz,
  last_signed_in_at  timestamptz,
  event_count        bigint,
  events_7d          bigint,
  events_30d         bigint,
  last_event_at      timestamptz,
  export_count       bigint,
  project_count      bigint,
  storage_bytes      bigint,
  preset_count       bigint,
  comment_count      bigint,
  collab_count       bigint,
  feedback_count     bigint,
  last_browser       text,
  last_os            text
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
  with ev as (
    select
      e.user_id,
      count(*) as event_count,
      count(*) filter (
        where e.created_at > now() - interval '7 days'
      ) as events_7d,
      count(*) filter (
        where e.created_at > now() - interval '30 days'
      ) as events_30d,
      count(*) filter (where e.event_type like '%export%') as export_count,
      max(e.created_at) as last_event_at
    from public.analytics_events e
    where e.user_id is not null
    group by e.user_id
  ),
  plat as (
    select distinct on (e.user_id) e.user_id, e.browser, e.os
    from public.analytics_events e
    where e.user_id is not null
    order by e.user_id, e.created_at desc
  ),
  proj as (
    select
      p.owner as user_id,
      count(distinct p.id) as project_count,
      coalesce(sum(a.bytes), 0)::bigint as storage_bytes
    from public.projects p
    left join public.project_assets a on a.project_id = p.id
    group by p.owner
  ),
  pres as (
    select pr.author as user_id, count(*) as preset_count
    from public.presets pr
    group by pr.author
  ),
  cmt as (
    select c.author as user_id, count(*) as comment_count
    from public.comments c
    group by c.author
  ),
  collab as (
    select pc.user_id, count(*) as collab_count
    from public.project_collaborators pc
    group by pc.user_id
  ),
  fb as (
    select f.user_id, count(*) as feedback_count
    from public.feedback f
    group by f.user_id
  )
  select
    u.id,
    u.osu_id,
    u.username,
    u.avatar_url,
    u.is_admin,
    u.created_at,
    u.last_signed_in_at,
    coalesce(ev.event_count, 0)::bigint,
    coalesce(ev.events_7d, 0)::bigint,
    coalesce(ev.events_30d, 0)::bigint,
    ev.last_event_at,
    coalesce(ev.export_count, 0)::bigint,
    coalesce(proj.project_count, 0)::bigint,
    coalesce(proj.storage_bytes, 0)::bigint,
    coalesce(pres.preset_count, 0)::bigint,
    coalesce(cmt.comment_count, 0)::bigint,
    coalesce(collab.collab_count, 0)::bigint,
    coalesce(fb.feedback_count, 0)::bigint,
    plat.browser,
    plat.os
  from public.users u
  left join ev on ev.user_id = u.id
  left join plat on plat.user_id = u.id
  left join proj on proj.user_id = u.id
  left join pres on pres.user_id = u.id
  left join cmt on cmt.user_id = u.id
  left join collab on collab.user_id = u.id
  left join fb on fb.user_id = u.id;
end;
$$;

grant execute on function public.admin_user_summaries() to authenticated;

create or replace function public.admin_user_events(p_user uuid)
returns table (
  event_type  text,
  last_7d     bigint,
  last_30d    bigint,
  total       bigint,
  last_at     timestamptz
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
  select
    e.event_type,
    count(*) filter (where e.created_at > now() - interval '7 days'),
    count(*) filter (where e.created_at > now() - interval '30 days'),
    count(*),
    max(e.created_at)
  from public.analytics_events e
  where e.user_id = p_user
  group by e.event_type
  order by count(*) desc;
end;
$$;

grant execute on function public.admin_user_events(uuid) to authenticated;

-- Maps the user owns plus maps they were invited to, so a user page shows
-- everything they touch, not just what they created.
create or replace function public.admin_user_projects(p_user uuid)
returns table (
  id           uuid,
  title        text,
  artist       text,
  created_at   timestamptz,
  updated_at   timestamptz,
  asset_count  bigint,
  asset_bytes  bigint,
  role         text
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
  select
    p.id,
    p.title,
    p.artist,
    p.created_at,
    p.updated_at,
    coalesce((
      select count(*) from public.project_assets a where a.project_id = p.id
    ), 0)::bigint,
    coalesce((
      select sum(a.bytes) from public.project_assets a where a.project_id = p.id
    ), 0)::bigint,
    'owner'::text
  from public.projects p
  where p.owner = p_user
  union all
  select
    p.id,
    p.title,
    p.artist,
    p.created_at,
    p.updated_at,
    coalesce((
      select count(*) from public.project_assets a where a.project_id = p.id
    ), 0)::bigint,
    coalesce((
      select sum(a.bytes) from public.project_assets a where a.project_id = p.id
    ), 0)::bigint,
    pc.role
  from public.project_collaborators pc
  join public.projects p on p.id = pc.project_id
  where pc.user_id = p_user
  order by 5 desc;
end;
$$;

grant execute on function public.admin_user_projects(uuid) to authenticated;

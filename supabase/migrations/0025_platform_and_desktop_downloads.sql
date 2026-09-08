alter table public.analytics_events
  add column if not exists platform text not null default 'web'
    check (platform in ('web', 'desktop'));

alter table public.analytics_events
  add column if not exists app_version text
    check (app_version is null or char_length(app_version) between 1 and 32);

create index if not exists analytics_events_platform_idx
  on public.analytics_events(platform, created_at desc);
create index if not exists analytics_events_app_version_idx
  on public.analytics_events(app_version);

create table if not exists public.desktop_downloads (
  id          uuid primary key default gen_random_uuid(),
  version     text not null check (char_length(version) between 1 and 32),
  asset       text not null check (asset in ('setup', 'msi', 'portable', 'other')),
  os          text check (os is null or char_length(os) between 1 and 32),
  created_at  timestamptz not null default now()
);

create index if not exists desktop_downloads_created_idx
  on public.desktop_downloads(created_at desc);
create index if not exists desktop_downloads_version_idx
  on public.desktop_downloads(version, asset);

alter table public.desktop_downloads enable row level security;

drop policy if exists desktop_downloads_admin_select on public.desktop_downloads;
create policy desktop_downloads_admin_select on public.desktop_downloads
  for select to authenticated using (public.is_admin());

create or replace function public.admin_platform_stats()
returns table (
  platform    text,
  users       bigint,
  users_30d   bigint,
  events      bigint,
  events_7d   bigint,
  events_30d  bigint,
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
    e.platform,
    count(distinct e.user_id),
    count(distinct e.user_id) filter (
      where e.created_at > now() - interval '30 days'
    ),
    count(*),
    count(*) filter (where e.created_at > now() - interval '7 days'),
    count(*) filter (where e.created_at > now() - interval '30 days'),
    max(e.created_at)
  from public.analytics_events e
  group by e.platform
  order by count(*) desc;
end;
$$;

grant execute on function public.admin_platform_stats() to authenticated;

create or replace function public.admin_app_version_stats()
returns table (
  platform     text,
  app_version  text,
  users        bigint,
  events       bigint,
  events_30d   bigint,
  last_at      timestamptz
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
    e.platform,
    e.app_version,
    count(distinct e.user_id),
    count(*),
    count(*) filter (where e.created_at > now() - interval '30 days'),
    max(e.created_at)
  from public.analytics_events e
  where e.app_version is not null
  group by e.platform, e.app_version
  order by e.platform, max(e.created_at) desc;
end;
$$;

grant execute on function public.admin_app_version_stats() to authenticated;

create or replace function public.admin_desktop_download_stats()
returns table (
  version   text,
  asset     text,
  last_7d   bigint,
  last_30d  bigint,
  total     bigint,
  last_at   timestamptz
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
    d.version,
    d.asset,
    count(*) filter (where d.created_at > now() - interval '7 days'),
    count(*) filter (where d.created_at > now() - interval '30 days'),
    count(*),
    max(d.created_at)
  from public.desktop_downloads d
  group by d.version, d.asset
  order by max(d.created_at) desc, d.asset;
end;
$$;

grant execute on function public.admin_desktop_download_stats() to authenticated;

drop function if exists public.admin_user_summaries();

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
  last_os            text,
  desktop_events     bigint,
  web_events         bigint,
  last_platform      text,
  last_app_version   text,
  desktop_version    text,
  last_desktop_at    timestamptz
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
      count(*) filter (where e.platform = 'desktop') as desktop_events,
      count(*) filter (where e.platform <> 'desktop') as web_events,
      max(e.created_at) as last_event_at
    from public.analytics_events e
    where e.user_id is not null
    group by e.user_id
  ),
  plat as (
    select distinct on (e.user_id)
      e.user_id, e.browser, e.os, e.platform, e.app_version
    from public.analytics_events e
    where e.user_id is not null
    order by e.user_id, e.created_at desc
  ),
  desk as (
    select distinct on (e.user_id)
      e.user_id, e.app_version, e.created_at
    from public.analytics_events e
    where e.user_id is not null and e.platform = 'desktop'
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
    plat.os,
    coalesce(ev.desktop_events, 0)::bigint,
    coalesce(ev.web_events, 0)::bigint,
    plat.platform,
    plat.app_version,
    desk.app_version,
    desk.created_at
  from public.users u
  left join ev on ev.user_id = u.id
  left join plat on plat.user_id = u.id
  left join desk on desk.user_id = u.id
  left join proj on proj.user_id = u.id
  left join pres on pres.user_id = u.id
  left join cmt on cmt.user_id = u.id
  left join collab on collab.user_id = u.id
  left join fb on fb.user_id = u.id;
end;
$$;

grant execute on function public.admin_user_summaries() to authenticated;

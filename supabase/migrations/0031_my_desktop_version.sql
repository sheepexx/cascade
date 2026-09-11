-- The web app's desktop hint needs to know whether this account already runs
-- the desktop app, and on which version, so it can stop offering the download
-- or turn into an update notice. analytics_events stays closed to normal
-- users; this hands the caller only their own newest desktop version.

create index if not exists analytics_events_user_desktop_idx
  on public.analytics_events(user_id, created_at desc)
  where platform = 'desktop';

create or replace function public.my_desktop_version()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select e.app_version
  from public.analytics_events e
  where e.user_id = auth.uid()
    and e.platform = 'desktop'
    and e.app_version is not null
  order by e.created_at desc
  limit 1;
$$;

grant execute on function public.my_desktop_version() to authenticated;

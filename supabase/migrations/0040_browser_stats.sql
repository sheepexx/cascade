-- Usage events per browser, counted in the database.
--
-- The admin panel used to download the browser column and count it itself,
-- but a request returns at most 1000 rows, so it counted the same first 1000
-- events forever. Events from the desktop app get a row of their own: its web
-- view reports itself as Edge on Windows and as nothing recognisable on macOS
-- and Linux. Safe to run more than once.

create or replace function public.admin_browser_stats()
returns table (
  browser text,
  events  bigint
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
      case
        when e.platform = 'desktop' then 'Desktop app'
        else coalesce(nullif(e.browser, ''), 'Unknown')
      end,
      count(*)
    from public.analytics_events e
    group by 1
    order by 2 desc, 1;
end;
$$;

grant execute on function public.admin_browser_stats() to authenticated;

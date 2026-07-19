-- Per-feature analytics.
--
-- 0010's CHECK listed three event types, which silently dropped every
-- 'export_sm' insert the client has been sending (the fire-and-forget call
-- swallowed the constraint violation). Replace the whitelist with a length
-- bound so new events never need a migration, while anon-writable text stays
-- capped.

alter table public.analytics_events
  drop constraint if exists analytics_events_event_type_check;
alter table public.analytics_events
  add constraint analytics_events_event_type_check
  check (char_length(event_type) between 1 and 64);

-- One-query per-feature counts for the admin Stats tab. SECURITY DEFINER
-- bypasses RLS, so the admin gate lives in the function body (same pattern as
-- admin_project_summaries in 0010).
create or replace function public.admin_event_stats()
returns table (
  event_type text,
  last_7d    bigint,
  last_30d   bigint,
  total      bigint
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
      count(*)
    from public.analytics_events e
    group by e.event_type
    order by count(*) desc;
end;
$$;

grant execute on function public.admin_event_stats() to authenticated;

-- Retention, funnel and weekly-mapper numbers without tracking anyone.
--
-- The client keeps its own milestones and reports each one once: first open,
-- came back on day 1 / 7 / 30, first map created / edited / exported, and at
-- most once per ISO week "someone mapped here". A milestone carries only the
-- day that browser first opened Cascade (cohort_day), never an ID, and never
-- an account (user_id stays null), so reports can be grouped into cohorts but
-- not linked to each other or to a person.
--
-- Discord link clicks carry where the link was (source).

alter table public.analytics_events
  add column if not exists cohort_day date,
  add column if not exists source text;

alter table public.analytics_events
  drop constraint if exists analytics_events_source_check;
alter table public.analytics_events
  add constraint analytics_events_source_check
  check (source is null or char_length(source) between 1 and 40);

-- No cohort predates Cascade. (No upper bound: a CHECK must not depend on now().)
alter table public.analytics_events
  drop constraint if exists analytics_events_cohort_day_check;
alter table public.analytics_events
  add constraint analytics_events_cohort_day_check
  check (cohort_day is null or cohort_day >= date '2024-01-01');

create index if not exists analytics_events_cohort_idx
  on public.analytics_events(event_type, cohort_day)
  where cohort_day is not null;

-- Retention by weekly cohort: of the browsers that first opened Cascade in a
-- week, how many came back exactly 1, 7 and 30 days later. Recent cohorts
-- have not reached day 30 yet; `mature_*` says how many of the cohort's days
-- are old enough for each mark, so the UI can grey out incomplete numbers.
create or replace function public.admin_retention_stats(p_weeks int default 12)
returns table (
  cohort_week date,
  installs    bigint,
  d1          bigint,
  d7          bigint,
  d30         bigint,
  mature_d1   boolean,
  mature_d7   boolean,
  mature_d30  boolean
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
      date_trunc('week', e.cohort_day)::date as cohort_week,
      count(*) filter (where e.event_type = 'first_open'),
      count(*) filter (where e.event_type = 'retained_d1'),
      count(*) filter (where e.event_type = 'retained_d7'),
      count(*) filter (where e.event_type = 'retained_d30'),
      date_trunc('week', e.cohort_day)::date + 6 + 1 <= current_date,
      date_trunc('week', e.cohort_day)::date + 6 + 7 <= current_date,
      date_trunc('week', e.cohort_day)::date + 6 + 30 <= current_date
    from public.analytics_events e
    where e.cohort_day is not null
      and e.cohort_day >= (current_date - (greatest(1, least(p_weeks, 104)) * 7))
    group by 1
    order by 1 desc;
end;
$$;

-- Funnel for browsers that first opened Cascade in the last p_days days:
-- opened, then created, edited and exported a map (each counted once).
create or replace function public.admin_funnel_stats(p_days int default 30)
returns table (
  opened   bigint,
  created  bigint,
  edited   bigint,
  exported bigint
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
      count(*) filter (where e.event_type = 'first_open'),
      count(*) filter (where e.event_type = 'funnel_created'),
      count(*) filter (where e.event_type = 'funnel_edited'),
      count(*) filter (where e.event_type = 'funnel_exported')
    from public.analytics_events e
    where e.cohort_day is not null
      and e.cohort_day >= current_date - greatest(1, least(p_days, 365));
end;
$$;

-- Weekly active mappers: browsers where someone edited a map, per ISO week.
create or replace function public.admin_weekly_mappers(p_weeks int default 12)
returns table (
  week_start date,
  mappers    bigint
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
    select date_trunc('week', e.created_at)::date, count(*)
    from public.analytics_events e
    where e.event_type = 'mapper_active_week'
      and e.created_at >= date_trunc('week', now()) - make_interval(weeks => greatest(1, least(p_weeks, 104)) - 1)
    group by 1
    order by 1 desc;
end;
$$;

-- Discord link clicks by where the link was.
create or replace function public.admin_discord_clicks(p_days int default 30)
returns table (
  source text,
  clicks bigint
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
    select coalesce(e.source, 'unknown'), count(*)
    from public.analytics_events e
    where e.event_type = 'discord_click'
      and e.created_at >= now() - make_interval(days => greatest(1, least(p_days, 365)))
    group by 1
    order by 2 desc;
end;
$$;

grant execute on function public.admin_retention_stats(int) to authenticated;
grant execute on function public.admin_funnel_stats(int) to authenticated;
grant execute on function public.admin_weekly_mappers(int) to authenticated;
grant execute on function public.admin_discord_clicks(int) to authenticated;

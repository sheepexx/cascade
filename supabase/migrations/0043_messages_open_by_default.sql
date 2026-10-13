-- Anyone can message anyone unless they turn messages off.
--
-- 0041 started private messages as friends-only. Messages now default to
-- everyone, for new accounts and for the ones that still had the old
-- default. People can still choose friends only, or nobody, in Social &
-- privacy settings; blocks stop messages either way.
--
-- Safe to run more than once.

alter table public.social_privacy
  alter column messages set default 'everyone';

update public.social_privacy
  set messages = 'everyone', updated_at = now()
  where messages = 'friends';

create or replace function public.privacy_of(p_user uuid)
returns table (
  friend_requests text,
  messages        text,
  online_status   text,
  activity        text,
  mapping_stats   text,
  mapping_time    text,
  project_time    text,
  projects        text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(s.friend_requests, 'everyone'),
    coalesce(s.messages, 'everyone'),
    coalesce(s.online_status, 'everyone'),
    coalesce(s.activity, 'friends'),
    coalesce(s.mapping_stats, 'friends'),
    coalesce(s.mapping_time, 'friends'),
    coalesce(s.project_time, 'friends'),
    coalesce(s.projects, 'nobody')
  from (select p_user as id) me
  left join public.social_privacy s on s.user_id = me.id;
$$;

revoke execute on function public.privacy_of(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';

-- Bug reports and suggestions from the Discord bot become posts in the
-- server's forum, as people already post there by hand. This keeps which
-- post a contribution became, so a review can answer in it.
--
-- Safe to run more than once. The bot works without it; reviews just don't
-- reply in the post until it is applied.

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

notify pgrst, 'reload schema';

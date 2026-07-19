-- Attribute admin announcements to the admin who sent them.
--
-- The notifications table already snapshots actor details for invites (so the
-- recipient can render a name and avatar without permission to read somebody
-- else's users row), but publish_app_update left them null, leaving broadcasts
-- anonymous. Same snapshot approach here.

create or replace function public.publish_app_update(
  p_title text,
  p_body text,
  p_version text default null,
  p_action_url text default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_dedupe_key text;
  v_actor uuid;
  v_actor_username text;
  v_actor_avatar_url text;
begin
  if not public.is_admin() then
    raise exception 'admin access required';
  end if;
  if nullif(trim(p_title), '') is null then
    raise exception 'title is required';
  end if;
  if nullif(trim(p_action_url), '') is not null
     and trim(p_action_url) !~* '^https?://' then
    raise exception 'action URL must start with http:// or https://';
  end if;

  v_actor := auth.uid();
  select u.username, u.avatar_url
    into v_actor_username, v_actor_avatar_url
    from public.users u
    where u.id = v_actor;

  v_dedupe_key := 'app-update:' || coalesce(
    nullif(trim(p_version), ''),
    gen_random_uuid()::text
  );

  insert into public.notifications (
    recipient,
    kind,
    title,
    body,
    action_url,
    actor,
    actor_username,
    actor_avatar_url,
    dedupe_key
  )
  select
    u.id,
    'app_update',
    trim(p_title),
    nullif(trim(p_body), ''),
    nullif(trim(p_action_url), ''),
    v_actor,
    v_actor_username,
    v_actor_avatar_url,
    v_dedupe_key
  from public.users u
  on conflict (recipient, dedupe_key) do update set
    title = excluded.title,
    body = excluded.body,
    action_url = excluded.action_url,
    actor = excluded.actor,
    actor_username = excluded.actor_username,
    actor_avatar_url = excluded.actor_avatar_url,
    read_at = null,
    dismissed_at = null,
    created_at = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.publish_app_update(text, text, text, text)
  to authenticated;

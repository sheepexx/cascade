-- ---------------------------------------------------------------------------
-- "Request edit access" from a public map page (/m/<slug>).
--
-- Visitors must not hold INSERT on notifications, so the request goes through
-- a SECURITY DEFINER function. It only ever writes one inbox row addressed to
-- the map's owner, and the dedupe key means repeated clicks cannot spam them.
-- ---------------------------------------------------------------------------

create or replace function public.request_shared_map_access(p_slug text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_project uuid;
  v_title text;
  v_requester uuid := auth.uid();
  v_username text;
  v_avatar text;
begin
  if v_requester is null then
    raise exception 'sign in to request access';
  end if;

  select s.owner, s.project_id, s.title
    into v_owner, v_project, v_title
    from public.shared_maps s
    where s.slug = p_slug;

  if v_owner is null then
    raise exception 'map not found';
  end if;

  if v_owner = v_requester then
    return;
  end if;

  select u.username, u.avatar_url
    into v_username, v_avatar
    from public.users u
    where u.id = v_requester;

  insert into public.notifications (
    recipient,
    kind,
    title,
    body,
    project_id,
    actor,
    actor_username,
    actor_avatar_url,
    action_url,
    dedupe_key
  ) values (
    v_owner,
    'system',
    'Edit access requested',
    coalesce(v_username, 'Someone') || ' asked to edit ' ||
      coalesce(nullif(v_title, ''), 'Untitled') || '.',
    v_project,
    v_requester,
    v_username,
    v_avatar,
    '/m/' || p_slug,
    'access:' || p_slug || ':' || v_requester::text
  )
  on conflict (recipient, dedupe_key) do update
    set created_at = now(),
        read_at = null,
        dismissed_at = null;
end;
$$;

revoke execute on function public.request_shared_map_access(text) from anon;
grant execute on function public.request_shared_map_access(text) to authenticated;

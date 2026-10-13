-- Admins are marked on their profile cards.
--
-- profile_card (0041) gains is_admin, so profiles, search results, friend
-- lists and conversations can show who runs Cascade. Being an admin is
-- public, like an osu! staff title.
--
-- Safe to run more than once.

create or replace function public.profile_card(p_user uuid, p_viewer uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user public.users;
  v_cache public.osu_profile_cache;
  v_blocked_me boolean;
begin
  select * into v_user from public.users where id = p_user;
  if v_user.id is null then
    return null;
  end if;
  select * into v_cache from public.osu_profile_cache where user_id = p_user;
  v_blocked_me := p_viewer is not null and exists (
    select 1 from public.user_blocks k where k.blocker = p_user and k.blocked = p_viewer
  );
  return json_build_object(
    'id', v_user.id,
    'osu_id', v_user.osu_id,
    'username', v_user.username,
    'avatar_url', v_user.avatar_url,
    'is_admin', v_user.is_admin,
    'country_code', coalesce(v_user.country_code, v_cache.country_code),
    'relationship', public.relationship_with(p_viewer, p_user),
    'presence', case when v_blocked_me then null else public.presence_for(p_user, p_viewer) end,
    'osu', case when v_cache.user_id is null then null else json_build_object(
      'ranked_count', v_cache.ranked_count,
      'loved_count', v_cache.loved_count,
      'pending_count', v_cache.pending_count,
      'graveyard_count', v_cache.graveyard_count,
      'guest_count', v_cache.guest_count,
      'is_supporter', v_cache.is_supporter
    ) end
  );
end;
$$;

revoke execute on function public.profile_card(uuid, uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';

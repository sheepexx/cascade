create or replace function public.admin_shared_map_summaries(p_user uuid default null)
returns table (
  id              uuid,
  slug            text,
  project_id      uuid,
  owner           uuid,
  owner_username  text,
  owner_osu_id    bigint,
  title           text,
  artist          text,
  creator         text,
  key_counts      smallint[],
  star_rating     numeric,
  length_ms       integer,
  bpm             numeric,
  note_count      integer,
  views           integer,
  created_at      timestamptz,
  updated_at      timestamptz
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
    s.id,
    s.slug,
    s.project_id,
    s.owner,
    u.username as owner_username,
    u.osu_id as owner_osu_id,
    s.title,
    s.artist,
    s.creator,
    s.key_counts,
    s.star_rating,
    s.length_ms,
    s.bpm,
    s.note_count,
    s.views,
    s.created_at,
    s.updated_at
  from public.shared_maps s
  left join public.users u on u.id = s.owner
  where p_user is null or s.owner = p_user
  order by s.created_at desc;
end;
$$;

revoke all on function public.admin_shared_map_summaries(uuid) from public;
grant execute on function public.admin_shared_map_summaries(uuid) to authenticated;

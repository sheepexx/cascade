alter table public.shared_maps
  add column if not exists last_viewed_at timestamptz;

create or replace function public.bump_shared_map_view(p_slug text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.shared_maps
     set views = views + 1,
         last_viewed_at = now()
   where slug = p_slug;
$$;

grant execute on function public.bump_shared_map_view(text) to anon, authenticated;

drop function if exists public.admin_shared_map_summaries(uuid);

create function public.admin_shared_map_summaries(p_user uuid default null)
returns table (
  id              uuid,
  slug            text,
  project_id      uuid,
  owner           uuid,
  owner_username  text,
  owner_osu_id    bigint,
  title           text,
  artist          text,
  views           integer,
  last_viewed_at  timestamptz,
  asset_count     bigint,
  asset_bytes     bigint,
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
    s.views,
    s.last_viewed_at,
    count(o.id)::bigint as asset_count,
    coalesce(sum(
      case
        when coalesce(o.metadata->>'size', '') ~ '^[0-9]+$'
          then (o.metadata->>'size')::bigint
        else 0
      end
    ), 0)::bigint as asset_bytes,
    s.created_at,
    s.updated_at
  from public.shared_maps s
  left join public.users u on u.id = s.owner
  left join storage.objects o
    on o.bucket_id = 'shared'
   and o.name like s.owner::text || '/' || s.slug || '/%'
  where p_user is null or s.owner = p_user
  group by s.id, u.username, u.osu_id
  order by s.created_at desc;
end;
$$;

revoke all on function public.admin_shared_map_summaries(uuid) from public;
grant execute on function public.admin_shared_map_summaries(uuid) to authenticated;

create or replace function public.replace_project_assets(
  p_project uuid,
  p_assets jsonb
)
returns table (obsolete_path text)
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.can_edit_project(p_project) then
    raise exception 'project edit access required';
  end if;

  if p_assets is null
     or jsonb_typeof(p_assets) <> 'array'
     or jsonb_array_length(p_assets) > 100 then
    raise exception 'invalid project assets';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_assets) asset
    where coalesce(asset->>'kind', '') not in ('audio', 'bg')
       or coalesce(asset->>'filename', '') = ''
       or coalesce(asset->>'storage_path', '') !~
          ('^' || p_project::text || '/[0-9a-f]{64}\.[a-z0-9]{1,8}$')
       or coalesce(asset->>'sha256', '') !~ '^[0-9a-f]{64}$'
       or asset->>'storage_path' not like
          (p_project::text || '/' || asset->>'sha256' || '.%')
       or coalesce(asset->>'bytes', '') !~ '^[0-9]+$'
  ) then
    raise exception 'invalid project asset row';
  end if;

  if coalesce((
    select sum((asset->>'bytes')::bigint)
    from jsonb_array_elements(p_assets) asset
  ), 0) > 62914560 then
    raise exception 'project assets exceed size limit';
  end if;

  return query
  select distinct pa.storage_path
  from public.project_assets pa
  where pa.project_id = p_project
    and not exists (
      select 1
      from jsonb_array_elements(p_assets) asset
      where asset->>'storage_path' = pa.storage_path
    );

  delete from public.project_assets where project_id = p_project;

  insert into public.project_assets (
    project_id,
    kind,
    filename,
    storage_path,
    sha256,
    bytes
  )
  select
    p_project,
    asset->>'kind',
    asset->>'filename',
    asset->>'storage_path',
    asset->>'sha256',
    (asset->>'bytes')::bigint
  from jsonb_array_elements(p_assets) asset;
end;
$$;

revoke all on function public.replace_project_assets(uuid, jsonb) from public;
grant execute on function public.replace_project_assets(uuid, jsonb) to authenticated;

create or replace function public.replace_project_asset(
  p_project uuid,
  p_kind text,
  p_filename text,
  p_storage_path text,
  p_sha256 text,
  p_bytes bigint
)
returns table (obsolete_path text)
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.can_edit_project(p_project) then
    raise exception 'project edit access required';
  end if;

  if coalesce(p_kind, '') not in ('audio', 'bg')
     or coalesce(p_filename, '') = ''
     or coalesce(p_storage_path, '') !~
        ('^' || p_project::text || '/[0-9a-f]{64}\.[a-z0-9]{1,8}$')
     or coalesce(p_sha256, '') !~ '^[0-9a-f]{64}$'
     or p_storage_path not like (p_project::text || '/' || p_sha256 || '.%')
     or p_bytes is null
     or p_bytes < 0
     or p_bytes > 62914560 then
    raise exception 'invalid project asset row';
  end if;

  return query
  select distinct pa.storage_path
  from public.project_assets pa
  where pa.project_id = p_project
    and pa.kind = p_kind
    and pa.filename = p_filename
    and pa.storage_path <> p_storage_path;

  delete from public.project_assets
  where project_id = p_project
    and kind = p_kind
    and filename = p_filename;

  insert into public.project_assets (
    project_id,
    kind,
    filename,
    storage_path,
    sha256,
    bytes
  ) values (
    p_project,
    p_kind,
    p_filename,
    p_storage_path,
    p_sha256,
    p_bytes
  );
end;
$$;

revoke all on function public.replace_project_asset(uuid, text, text, text, text, bigint) from public;
grant execute on function public.replace_project_asset(uuid, text, text, text, text, bigint) to authenticated;

alter table public.shared_maps
  add column if not exists asset_count integer not null default 0,
  add column if not exists asset_bytes bigint not null default 0;

update public.shared_maps s
set
  asset_count = legacy.asset_count,
  asset_bytes = legacy.asset_bytes
from (
  select
    m.id,
    count(o.id)::integer as asset_count,
    coalesce(sum(
      case
        when coalesce(o.metadata->>'size', '') ~ '^[0-9]+$'
          then (o.metadata->>'size')::bigint
        else 0
      end
    ), 0)::bigint as asset_bytes
  from public.shared_maps m
  left join storage.objects o
    on o.bucket_id = 'shared'
   and o.name like m.owner::text || '/' || m.slug || '/%'
  group by m.id
) legacy
where legacy.id = s.id;

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
    s.asset_count::bigint,
    s.asset_bytes,
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

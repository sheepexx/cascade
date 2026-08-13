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
          (p_project::text || '/' || (asset->>'sha256') || '.%')
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

notify pgrst, 'reload schema';

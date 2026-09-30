-- Projects can now carry the mapset's own hitsound samples, stored as
-- project assets of kind 'sample' beside the song ('audio') and backgrounds
-- ('bg'). A set may hold a couple of hundred small samples, so a full save may
-- list up to 320 assets; the 60 MB total per project is unchanged.

-- The original check was declared inline, so drop whichever check constraint
-- covers kind rather than trusting its generated name.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.project_assets'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.project_assets drop constraint %I', c.conname);
  end loop;
end
$$;
alter table public.project_assets
  add constraint project_assets_kind_check check (kind in ('audio', 'bg', 'sample'));

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
     or jsonb_array_length(p_assets) > 320 then
    raise exception 'invalid project assets';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_assets) asset
    where coalesce(asset->>'kind', '') not in ('audio', 'bg', 'sample')
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

  if coalesce(p_kind, '') not in ('audio', 'bg', 'sample')
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

notify pgrst, 'reload schema';

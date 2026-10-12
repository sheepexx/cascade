-- Chart saves check the revision the client edited.
--
-- save_project_snapshot (0033) replaced the whole chart and bumped the
-- revision whatever revision the caller had started from, so a client that
-- had not yet seen a collaborator's save wrote its older copy over it and the
-- collaborator's work was gone. The save functions now take the revision the
-- caller's copy is based on and refuse with PT409 (HTTP 409) when the project
-- has moved on. The client then fetches the newer snapshot, merges its own
-- unsaved changes into it and saves again against the new revision.
--
-- Unconditional chart writes are refused from now on, since any of them can
-- undo the check:
--   - the 0033 signatures without a revision raise PT426 with a message
--     asking the user to reload or update Cascade;
--   - a direct UPDATE of projects.data by a signed-in user is refused by the
--     trigger below. Builds before 0033 saved that way.
-- Requests without a user (the SQL editor, the service role) are unaffected.
--
-- Deploy order: ship the client first. It saves through these functions when
-- they exist and, until this migration runs, through an UPDATE guarded by
-- the same revision check, so it is safe on either side of the migration.
-- Older clients keep saving until this migration is applied and are then
-- told to reload; their unsaved work stays in their local recovery copy.
--
-- No data is changed. Safe to run more than once.

create or replace function public.save_project_snapshot(
  p_project uuid,
  p_data jsonb,
  p_mutation_id uuid,
  p_expected_revision bigint
)
returns table (revision bigint, last_mutation_id uuid, updated_by uuid, updated_at timestamptz)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current bigint;
  v_saved bigint;
begin
  if not public.can_edit_project(p_project) then
    raise exception 'project edit access required';
  end if;
  if p_expected_revision is null then
    raise exception 'expected revision required' using errcode = '22023';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'invalid project data';
  end if;
  if pg_column_size(p_data) > 16777216 then
    raise exception 'project data exceeds size limit';
  end if;

  -- Lets this update past protect_project_identity's guard on direct writes.
  perform set_config('cascade.snapshot_save', 'on', true);

  return query
  update public.projects p
  set
    title = left(coalesce(p_data #>> '{meta,title}', 'Untitled'), 512),
    artist = left(coalesce(p_data #>> '{meta,artist}', ''), 512),
    creator = left(coalesce(p_data #>> '{meta,creator}', ''), 512),
    data = p_data,
    revision = p.revision + 1,
    last_mutation_id = p_mutation_id,
    updated_by = auth.uid(),
    updated_at = now()
  where p.id = p_project
    and p.revision = p_expected_revision
  returning p.revision, p.last_mutation_id, p.updated_by, p.updated_at;
  get diagnostics v_saved = row_count;

  perform set_config('cascade.snapshot_save', '', true);

  if v_saved = 0 then
    select p.revision into v_current from public.projects p where p.id = p_project;
    if not found then
      raise exception 'project not found';
    end if;
    raise exception 'project revision conflict'
      using errcode = 'PT409',
            detail = json_build_object('revision', v_current)::text,
            hint = 'Load the newer snapshot, merge and save again.';
  end if;
end;
$$;

revoke all on function public.save_project_snapshot(uuid, jsonb, uuid, bigint) from public;
grant execute on function public.save_project_snapshot(uuid, jsonb, uuid, bigint) to authenticated;

-- The asset manifest and the chart switch together, as in 0033, and only if
-- the chart is still at the revision the caller edited. The row is locked
-- before the manifest changes so the check and the save see the same row.
create or replace function public.save_project_with_assets(
  p_project uuid,
  p_assets jsonb,
  p_data jsonb,
  p_mutation_id uuid,
  p_expected_revision bigint
)
returns table (
  obsolete_path text,
  revision bigint,
  last_mutation_id uuid,
  updated_by uuid,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current bigint;
  v_obsolete text[];
  v_revision bigint;
  v_mutation uuid;
  v_updated_by uuid;
  v_updated_at timestamptz;
begin
  if not public.can_edit_project(p_project) then
    raise exception 'project edit access required';
  end if;
  if p_expected_revision is null then
    raise exception 'expected revision required' using errcode = '22023';
  end if;

  select p.revision into v_current
    from public.projects p
    where p.id = p_project
    for update;
  if not found then
    raise exception 'project not found';
  end if;
  if v_current <> p_expected_revision then
    raise exception 'project revision conflict'
      using errcode = 'PT409',
            detail = json_build_object('revision', v_current)::text,
            hint = 'Load the newer snapshot, merge and save again.';
  end if;

  select array_agg(asset.obsolete_path)
    into v_obsolete
    from public.replace_project_assets(p_project, p_assets) asset;

  select saved.revision, saved.last_mutation_id, saved.updated_by, saved.updated_at
    into v_revision, v_mutation, v_updated_by, v_updated_at
    from public.save_project_snapshot(p_project, p_data, p_mutation_id, p_expected_revision) saved;

  if coalesce(array_length(v_obsolete, 1), 0) = 0 then
    return query select null::text, v_revision, v_mutation, v_updated_by, v_updated_at;
  else
    return query
      select obsolete.path, v_revision, v_mutation, v_updated_by, v_updated_at
      from unnest(v_obsolete) as obsolete(path);
  end if;
end;
$$;

revoke all on function public.save_project_with_assets(uuid, jsonb, jsonb, uuid, bigint) from public;
grant execute on function public.save_project_with_assets(uuid, jsonb, jsonb, uuid, bigint) to authenticated;

-- The 0033 signatures stay, so an older client gets a reason instead of
-- falling back to a direct update, but they no longer write.
create or replace function public.save_project_snapshot(
  p_project uuid,
  p_data jsonb,
  p_mutation_id uuid
)
returns table (revision bigint, last_mutation_id uuid, updated_by uuid, updated_at timestamptz)
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'This version of Cascade can no longer save maps. Reload the page or update the app to keep saving; your changes are still on this device.'
    using errcode = 'PT426';
end;
$$;

create or replace function public.save_project_with_assets(
  p_project uuid,
  p_assets jsonb,
  p_data jsonb,
  p_mutation_id uuid
)
returns table (
  obsolete_path text,
  revision bigint,
  last_mutation_id uuid,
  updated_by uuid,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'This version of Cascade can no longer save maps. Reload the page or update the app to keep saving; your changes are still on this device.'
    using errcode = 'PT426';
end;
$$;

-- As in 0033, plus: a signed-in user can't change the chart except through
-- the revision-checked functions above.
create or replace function public.protect_project_identity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.id <> old.id then
    raise exception 'project id cannot be changed';
  end if;
  if new.owner <> old.owner and not public.is_admin() then
    raise exception 'project owner cannot be changed directly';
  end if;
  if new.data is distinct from old.data
     and auth.uid() is not null
     and coalesce(current_setting('cascade.snapshot_save', true), '') <> 'on' then
    raise exception 'This version of Cascade can no longer save maps. Reload the page or update the app to keep saving; your changes are still on this device.'
      using errcode = 'PT426';
  end if;
  new.revision := old.revision + 1;
  new.updated_by := auth.uid();
  new.updated_at := now();
  if new.last_mutation_id is not distinct from old.last_mutation_id then
    new.last_mutation_id := null;
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';

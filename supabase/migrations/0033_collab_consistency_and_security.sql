-- Collaboration consistency and privilege hardening.
--
-- This migration is deliberately additive: existing projects, collaborators and
-- comments are preserved.  The new columns let clients distinguish their own
-- durable acknowledgements from genuinely remote updates.

alter table public.projects
  add column if not exists revision bigint not null default 0,
  add column if not exists last_mutation_id uuid,
  add column if not exists updated_by uuid references public.users(id) on delete set null;

-- Editors may change a project's content, but project identity and ownership are
-- not editable fields. Ownership transfer should be a separate owner-only RPC if
-- it is added in the future.
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
  -- Direct updates from an older client participate in the same revision stream.
  -- The RPC already supplies old + 1, so assigning it again is idempotent.
  new.revision := old.revision + 1;
  new.updated_by := auth.uid();
  new.updated_at := now();
  if new.last_mutation_id is not distinct from old.last_mutation_id then
    new.last_mutation_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_project_identity on public.projects;
create trigger protect_project_identity
  before update on public.projects
  for each row execute function public.protect_project_identity();

-- A comment author may edit the comment body, while its author and containing
-- project remain immutable. This closes the corresponding row-move RLS hole.
create or replace function public.protect_comment_identity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if (new.author <> old.author or new.project_id <> old.project_id)
     and not public.is_admin() then
    raise exception 'comment author and project cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_comment_identity on public.comments;
create trigger protect_comment_identity
  before update on public.comments
  for each row execute function public.protect_comment_identity();

-- Publish one complete chart snapshot and assign it a server-ordered revision.
-- Existing clients can continue using direct UPDATE during a rolling deploy;
-- the trigger above still prevents them from changing owner/id.
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
  if not public.can_edit_project(p_project) then
    raise exception 'project edit access required';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'invalid project data';
  end if;
  if pg_column_size(p_data) > 16777216 then
    raise exception 'project data exceeds size limit';
  end if;

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
  returning p.revision, p.last_mutation_id, p.updated_by, p.updated_at;

  if not found then
    raise exception 'project not found';
  end if;
end;
$$;

revoke all on function public.save_project_snapshot(uuid, jsonb, uuid) from public;
grant execute on function public.save_project_snapshot(uuid, jsonb, uuid) to authenticated;

-- Atomically switch an existing project's asset manifest and chart snapshot.
-- Object uploads happen first because R2 is external to Postgres; orphaned
-- uploads are safe to collect, whereas committed chart references to a missing
-- manifest are not.
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
declare
  v_obsolete text[];
  v_revision bigint;
  v_mutation uuid;
  v_updated_by uuid;
  v_updated_at timestamptz;
begin
  select array_agg(asset.obsolete_path)
    into v_obsolete
    from public.replace_project_assets(p_project, p_assets) asset;

  select saved.revision, saved.last_mutation_id, saved.updated_by, saved.updated_at
    into v_revision, v_mutation, v_updated_by, v_updated_at
    from public.save_project_snapshot(p_project, p_data, p_mutation_id) saved;

  if coalesce(array_length(v_obsolete, 1), 0) = 0 then
    return query select null::text, v_revision, v_mutation, v_updated_by, v_updated_at;
  else
    return query
      select obsolete.path, v_revision, v_mutation, v_updated_by, v_updated_at
      from unnest(v_obsolete) as obsolete(path);
  end if;
end;
$$;

revoke all on function public.save_project_with_assets(uuid, jsonb, jsonb, uuid) from public;
grant execute on function public.save_project_with_assets(uuid, jsonb, jsonb, uuid) to authenticated;

-- Re-apply the complete Realtime setup so this one migration also repairs an
-- older deployment where the manual Realtime migrations drifted.
alter table public.projects replica identity full;
alter table public.project_assets replica identity full;
alter table public.comments replica identity full;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'projects',
    'project_assets',
    'comments',
    'project_collaborators'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;

do $$ begin
  alter table realtime.messages enable row level security;
exception when others then
  null;
end $$;

drop policy if exists "collab read project channel" on realtime.messages;
create policy "collab read project channel" on realtime.messages
  for select to authenticated using (
    (
      realtime.topic() like 'project:%'
      and realtime.messages.extension in ('broadcast', 'presence')
      and public.can_view_project(split_part(realtime.topic(), ':', 2)::uuid)
    )
    or (
      realtime.topic() like 'project-sync:%'
      and public.can_view_project(split_part(realtime.topic(), ':', 2)::uuid)
    )
  );

drop policy if exists "collab send project channel" on realtime.messages;
create policy "collab send project channel" on realtime.messages
  for insert to authenticated with check (
    realtime.topic() like 'project:%'
    and (
      (
        realtime.messages.extension = 'presence'
        and public.can_view_project(split_part(realtime.topic(), ':', 2)::uuid)
      )
      or (
        realtime.messages.extension = 'broadcast'
        and public.can_edit_project(split_part(realtime.topic(), ':', 2)::uuid)
      )
    )
  );

notify pgrst, 'reload schema';

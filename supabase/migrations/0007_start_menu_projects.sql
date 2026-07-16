-- Start-menu project listing.
--
-- Returns, in one round trip, every project the caller can view (owned, shared,
-- or admin) plus a background thumbnail path and the participants' avatars
-- (owner + collaborators). SECURITY DEFINER so it can read avatars from
-- public.users, which RLS otherwise restricts to self/admin - exactly the data
-- the upgraded start menu needs to render thumbnails and collaborator faces.

create or replace function public.list_my_projects()
returns table (
  id          uuid,
  owner       uuid,
  title       text,
  artist      text,
  creator     text,
  updated_at  timestamptz,
  bg_path     text,
  participants json
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.owner,
    p.title,
    p.artist,
    p.creator,
    p.updated_at,
    -- Most recently uploaded background, used as the card thumbnail.
    (
      select pa.storage_path
      from public.project_assets pa
      where pa.project_id = p.id and pa.kind = 'bg'
      order by pa.created_at desc
      limit 1
    ) as bg_path,
    -- Owner first, then collaborators. The owner can never also be a
    -- collaborator (add_collaborator rejects that), so no de-duplication needed.
    (
      select coalesce(
        json_agg(
          json_build_object(
            'user_id',    t.user_id,
            'username',   t.username,
            'avatar_url', t.avatar_url,
            'role',       t.role
          )
          order by t.ord
        ),
        '[]'::json
      )
      from (
        select u.id as user_id, u.username, u.avatar_url,
               'owner'::text as role, 0 as ord
          from public.users u
          where u.id = p.owner
        union all
        select u.id, u.username, u.avatar_url, c.role, 1 as ord
          from public.project_collaborators c
          join public.users u on u.id = c.user_id
          where c.project_id = p.id
      ) t
    ) as participants
  from public.projects p
  where public.can_view_project(p.id)
  order by p.updated_at desc;
$$;

grant execute on function public.list_my_projects() to authenticated, anon;

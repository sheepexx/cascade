-- Lets the client warn before a first cloud save creates a second copy of a
-- map the caller already owns. A project matches on the same title (trimmed,
-- case-insensitive) or on a shared osu! ID: the mapset's BeatmapSetID or any
-- difficulty's BeatmapID. IDs of 0 or below mean "not submitted", so the
-- client never sends them and they never match here either.
create or replace function public.find_duplicate_projects(
  p_title text,
  p_set_id bigint,
  p_beatmap_ids bigint[]
)
returns table (
  id          uuid,
  title       text,
  artist      text,
  creator     text,
  updated_at  timestamptz,
  title_match boolean,
  id_match    boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select * from (
    select
      p.id,
      p.title,
      p.artist,
      p.creator,
      p.updated_at,
      (
        nullif(btrim(p_title), '') is not null
        and lower(btrim(p.title)) = lower(btrim(p_title))
      ) as title_match,
      (
        (
          coalesce(p_set_id, 0) > 0
          and p.data #>> '{meta,beatmapSetId}' ~ '^[0-9]+$'
          and (p.data #>> '{meta,beatmapSetId}')::bigint = p_set_id
        )
        or exists (
          select 1
          from jsonb_array_elements(
            case
              when jsonb_typeof(p.data -> 'difficulties') = 'array'
                then p.data -> 'difficulties'
              else '[]'::jsonb
            end
          ) d
          where d ->> 'beatmapId' ~ '^[0-9]+$'
            and (d ->> 'beatmapId')::bigint > 0
            and (d ->> 'beatmapId')::bigint = any (coalesce(p_beatmap_ids, '{}'))
        )
      ) as id_match
    from public.projects p
    where p.owner = auth.uid()
  ) matches
  where matches.title_match or matches.id_match
  order by matches.id_match desc, matches.updated_at desc
  limit 10;
$$;

revoke all on function public.find_duplicate_projects(text, bigint, bigint[]) from public;
grant execute on function public.find_duplicate_projects(text, bigint, bigint[]) to authenticated;

-- Preset authoring upgrades:
--  * denormalised author display (username + osu_id) so the browser can show
--    "who submitted" + link to the osu! profile without reading the users table
--    (RLS blocks reading other users' rows).
--  * pattern_hash for global de-duplication: the same pattern can't be submitted
--    twice (across all users), unless the existing copy was rejected.

alter table public.presets
  add column if not exists author_username text,
  add column if not exists author_osu_id  bigint,
  add column if not exists pattern_hash    text;

-- Backfill author display for existing rows.
update public.presets p
set author_username = u.username,
    author_osu_id   = u.osu_id
from public.users u
where u.id = p.author and p.author_username is null;

-- One live (non-rejected) preset per pattern. Rejected rows don't block a
-- future resubmission. Existing rows with a null hash are exempt.
create unique index if not exists presets_pattern_hash_uniq
  on public.presets (pattern_hash)
  where status <> 'rejected' and pattern_hash is not null;

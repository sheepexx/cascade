-- Admin stats, user feedback, richer project summaries, and account-only presets.

-- ---------------------------------------------------------------------------
-- Analytics events for admin stats
-- ---------------------------------------------------------------------------

create table if not exists public.analytics_events (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references public.users(id) on delete set null,
  event_type       text not null check (
    event_type in ('export_osu', 'export_osz', 'local_project_created')
  ),
  browser          text not null default 'Unknown',
  browser_version  text,
  os               text,
  created_at       timestamptz not null default now()
);

create index if not exists analytics_events_type_idx
  on public.analytics_events(event_type, created_at desc);
create index if not exists analytics_events_browser_idx
  on public.analytics_events(browser);

alter table public.analytics_events enable row level security;

drop policy if exists analytics_events_insert on public.analytics_events;
create policy analytics_events_insert on public.analytics_events
  for insert to anon, authenticated with check (
    user_id is null or user_id = auth.uid()
  );

drop policy if exists analytics_events_admin_select on public.analytics_events;
create policy analytics_events_admin_select on public.analytics_events
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- User feedback
-- ---------------------------------------------------------------------------

create table if not exists public.feedback (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(id) on delete cascade,
  author_username  text,
  author_osu_id    bigint,
  body             text not null check (char_length(body) between 1 and 4000),
  status           text not null default 'open'
                    check (status in ('open', 'reviewed', 'closed')),
  created_at       timestamptz not null default now()
);

create index if not exists feedback_status_created_idx
  on public.feedback(status, created_at desc);
create index if not exists feedback_user_idx on public.feedback(user_id);

alter table public.feedback enable row level security;

drop policy if exists feedback_select on public.feedback;
create policy feedback_select on public.feedback
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists feedback_insert on public.feedback;
create policy feedback_insert on public.feedback
  for insert with check (user_id = auth.uid());

drop policy if exists feedback_admin_update on public.feedback;
create policy feedback_admin_update on public.feedback
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists feedback_admin_delete on public.feedback;
create policy feedback_admin_delete on public.feedback
  for delete using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Private presets
-- ---------------------------------------------------------------------------

drop index if exists presets_pattern_hash_uniq;

-- Keep public submissions globally de-duplicated. Private account presets may
-- duplicate public presets or another user's private preset.
create unique index if not exists presets_public_pattern_hash_uniq
  on public.presets (pattern_hash)
  where is_public = true and status <> 'rejected' and pattern_hash is not null;

drop policy if exists presets_insert on public.presets;
create policy presets_insert on public.presets
  for insert with check (
    author = auth.uid()
    and (
      public.is_admin()
      or (is_public = true and status = 'pending')
      or (is_public = false and status = 'approved')
    )
  );

drop policy if exists presets_update on public.presets;
create policy presets_update on public.presets
  for update using (author = auth.uid() or public.is_admin())
  with check (
    public.is_admin()
    or (
      author = auth.uid()
      and (
        (is_public = true and status = 'pending')
        or (is_public = false and status = 'approved')
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Enriched project summaries for admin
-- ---------------------------------------------------------------------------

create or replace function public.admin_project_summaries()
returns table (
  id                 uuid,
  owner              uuid,
  owner_username     text,
  owner_osu_id       bigint,
  title              text,
  artist             text,
  creator            text,
  created_at         timestamptz,
  updated_at         timestamptz,
  last_activity_at   timestamptz,
  participant_count  bigint,
  asset_count        bigint,
  asset_bytes        bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  return query
  select
    p.id,
    p.owner,
    u.username as owner_username,
    u.osu_id as owner_osu_id,
    p.title,
    p.artist,
    p.creator,
    p.created_at,
    p.updated_at,
    greatest(
      p.updated_at,
      coalesce((select max(a.created_at) from public.project_assets a where a.project_id = p.id), p.updated_at),
      coalesce((select max(c.created_at) from public.comments c where c.project_id = p.id), p.updated_at),
      coalesce((select max(pc.created_at) from public.project_collaborators pc where pc.project_id = p.id), p.updated_at)
    ) as last_activity_at,
    (1 + (select count(*) from public.project_collaborators pc where pc.project_id = p.id))::bigint as participant_count,
    coalesce((select count(*) from public.project_assets a where a.project_id = p.id), 0)::bigint as asset_count,
    coalesce((select sum(a.bytes) from public.project_assets a where a.project_id = p.id), 0)::bigint as asset_bytes
  from public.projects p
  left join public.users u on u.id = p.owner;
end;
$$;

grant execute on function public.admin_project_summaries() to authenticated;

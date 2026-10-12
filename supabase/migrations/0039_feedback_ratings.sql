-- Short 1-10 ratings, each answering one of a few standing questions.
--
-- The app asks one question at a time, rarely, and never the same one twice.
-- Anyone can answer: a rating from someone signed in is tied to their account
-- (and asked only once per account, on any device); one from someone signed
-- out carries no account and nothing that identifies them.
--
-- Ratings are written only through submit_feedback_rating, which fills in
-- the account itself, so nobody can file one under someone else. Admins read
-- them all; a signed-in user reads only their own, which is how the app
-- knows what it already asked. Safe to run more than once.

create table if not exists public.feedback_ratings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.users(id) on delete cascade,
  author_username text,
  author_osu_id   bigint,
  question        text not null
    check (question in ('recommend', 'reliability', 'workflow', 'missing')),
  score           smallint not null check (score between 1 and 10),
  comment         text check (comment is null or char_length(comment) <= 2000),
  app_version     text check (app_version is null or char_length(app_version) <= 32),
  platform        text check (platform is null or platform in ('web', 'desktop')),
  created_at      timestamptz not null default now()
);

create unique index if not exists feedback_ratings_user_question
  on public.feedback_ratings (user_id, question)
  where user_id is not null;
create index if not exists feedback_ratings_created
  on public.feedback_ratings (created_at desc);

alter table public.feedback_ratings enable row level security;

revoke all on table public.feedback_ratings from anon, authenticated;
grant select on table public.feedback_ratings to authenticated;

drop policy if exists feedback_ratings_select on public.feedback_ratings;
create policy feedback_ratings_select on public.feedback_ratings
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create or replace function public.submit_feedback_rating(
  p_question text,
  p_score integer,
  p_comment text default null,
  p_app_version text default null,
  p_platform text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_recent integer;
begin
  -- Signed-out ratings can't be tied to anyone, so a flood of them is capped
  -- as a whole instead.
  if v_user is null then
    select count(*) into v_recent
      from public.feedback_ratings
      where user_id is null and created_at > now() - interval '10 minutes';
    if v_recent >= 50 then
      raise exception 'Too many ratings right now. Please try again later.'
        using errcode = 'PT429';
    end if;
  end if;

  insert into public.feedback_ratings (
    user_id, author_username, author_osu_id,
    question, score, comment, app_version, platform
  )
  select
    v_user, u.username, u.osu_id,
    p_question,
    p_score,
    nullif(btrim(p_comment), ''),
    left(p_app_version, 32),
    p_platform
  from (select 1) as one
  left join public.users u on u.id = v_user
  -- A second answer to the same question from one account keeps the first.
  on conflict (user_id, question) where user_id is not null do nothing;
end;
$$;

revoke all on function public.submit_feedback_rating(text, integer, text, text, text) from public;
grant execute on function public.submit_feedback_rating(text, integer, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

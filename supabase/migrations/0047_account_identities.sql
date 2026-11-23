-- Sign-in identities: one Cascade account, reached through osu!, Discord or
-- both.
--
-- public.users.id stays the account and nothing here changes it. Each way of
-- signing in is a row in account_identities, keyed by the provider's own
-- stable id (never a username). An account has at most one identity per
-- provider, and a provider account belongs to one Cascade account at a time.
-- Linking never moves an identity: one that is already claimed is refused.
--
-- users.osu_id stays as a mirror of the osu! identity, so everything that
-- reads it keeps working, and becomes nullable for accounts made with
-- Discord. No placeholder osu! ids are invented.
--
-- Only the Worker (service role) reads or changes identities, through the
-- functions below. Each takes an advisory lock per provider account, so two
-- callbacks for the same person can't race into two accounts, and the unique
-- indexes refuse a duplicate even if something bypassed the functions.
--
-- A Worker that predates this migration keeps working: it still upserts
-- users on osu_id, and the trigger below gives each new row its identity.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- Identities
-- ---------------------------------------------------------------------------

create table if not exists public.account_identities (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  provider          text not null,
  provider_user_id  text not null,
  -- What the provider called the account the last time it signed in, for
  -- Connected accounts. Never used to find anyone.
  display_name      text,
  avatar_url        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  last_used_at      timestamptz
);

alter table public.account_identities
  drop constraint if exists account_identities_provider_check;
alter table public.account_identities
  add constraint account_identities_provider_check
  check (provider in ('discord', 'osu'));

-- Both providers use positive numeric ids. Discord's are 64-bit snowflakes,
-- past what a JavaScript number holds exactly, so they are kept as text.
alter table public.account_identities
  drop constraint if exists account_identities_provider_user_id_check;
alter table public.account_identities
  add constraint account_identities_provider_user_id_check
  check (provider_user_id ~ '^[1-9][0-9]{0,19}$');

alter table public.account_identities
  drop constraint if exists account_identities_display_name_check;
alter table public.account_identities
  add constraint account_identities_display_name_check
  check (display_name is null or char_length(display_name) <= 64);

alter table public.account_identities
  drop constraint if exists account_identities_avatar_url_check;
alter table public.account_identities
  add constraint account_identities_avatar_url_check
  check (avatar_url is null or (avatar_url ~* '^https://' and char_length(avatar_url) <= 512));

create unique index if not exists account_identities_provider_user_key
  on public.account_identities (provider, provider_user_id);
create unique index if not exists account_identities_user_provider_key
  on public.account_identities (user_id, provider);

alter table public.account_identities enable row level security;
revoke all on table public.account_identities from public, anon, authenticated;
grant select, insert, update, delete on table public.account_identities to service_role;

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------

alter table public.users alter column osu_id drop not null;

-- Whose name and avatar the profile mirrors on sign-in: the provider the
-- account was made with. Linking a second provider never changes it, so a
-- new link can't overwrite someone's name.
alter table public.users
  add column if not exists profile_provider text not null default 'osu';
alter table public.users
  drop constraint if exists users_profile_provider_check;
alter table public.users
  add constraint users_profile_provider_check
  check (profile_provider in ('osu', 'discord'));

-- Every existing account signed in with osu!.
insert into public.account_identities (
  user_id, provider, provider_user_id, display_name, avatar_url, created_at, last_used_at
)
select
  u.id,
  'osu',
  u.osu_id::text,
  left(u.username, 64),
  case when u.avatar_url ~* '^https://' and char_length(u.avatar_url) <= 512 then u.avatar_url end,
  u.created_at,
  u.last_signed_in_at
from public.users u
where u.osu_id is not null and u.osu_id > 0
on conflict do nothing;

-- An account an older Worker creates gets its osu! identity too.
create or replace function public.users_add_osu_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.osu_id is not null and new.osu_id > 0 then
    insert into public.account_identities (
      user_id, provider, provider_user_id, display_name, avatar_url, last_used_at
    ) values (
      new.id,
      'osu',
      new.osu_id::text,
      left(new.username, 64),
      case when new.avatar_url ~* '^https://' and char_length(new.avatar_url) <= 512 then new.avatar_url end,
      new.last_signed_in_at
    )
    on conflict do nothing;
  end if;
  return null;
end;
$$;

revoke execute on function public.users_add_osu_identity() from public, anon, authenticated;

drop trigger if exists users_add_osu_identity on public.users;
create trigger users_add_osu_identity
  after insert on public.users
  for each row execute function public.users_add_osu_identity();

-- An account's id never changes, and requests (an admin's included) can't
-- edit the osu! mirror or the profile source: only the sign-in functions,
-- which run as their owner, and the Worker's service role can.
create or replace function public.users_guard_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'a Cascade account id never changes';
  end if;
  if (new.osu_id is distinct from old.osu_id
      or new.profile_provider is distinct from old.profile_provider)
     and current_user in ('anon', 'authenticated') then
    raise exception 'sign-in identities change only through signing in';
  end if;
  return new;
end;
$$;

revoke execute on function public.users_guard_identity() from public, anon, authenticated;

drop trigger if exists users_guard_identity on public.users;
create trigger users_guard_identity
  before update on public.users
  for each row execute function public.users_guard_identity();

-- ---------------------------------------------------------------------------
-- One-time tokens
-- ---------------------------------------------------------------------------

-- The Worker's link tickets and link results are signed and short-lived;
-- this makes each usable once, so a copied URL can't be replayed.
create table if not exists public.auth_used_tokens (
  jti         uuid primary key,
  purpose     text not null check (purpose in ('oauth-ticket', 'link')),
  expires_at  timestamptz not null,
  used_at     timestamptz not null default now()
);

create index if not exists auth_used_tokens_expires_idx
  on public.auth_used_tokens (expires_at);

alter table public.auth_used_tokens enable row level security;
revoke all on table public.auth_used_tokens from public, anon, authenticated;

-- True the first time a token is presented, false every time after.
create or replace function public.auth_consume_token(
  p_jti uuid, p_purpose text, p_expires_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from public.auth_used_tokens where expires_at < now() - interval '1 day';
  insert into public.auth_used_tokens (jti, purpose, expires_at)
    values (p_jti, p_purpose, p_expires_at)
    on conflict (jti) do nothing;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke execute on function public.auth_consume_token(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.auth_consume_token(uuid, text, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.assert_identity(p_provider text, p_provider_user_id text)
returns void
language plpgsql
immutable
as $$
begin
  if p_provider is null or p_provider not in ('discord', 'osu') then
    raise exception 'unknown sign-in provider';
  end if;
  if p_provider_user_id is null or p_provider_user_id !~ '^[1-9][0-9]{0,19}$' then
    raise exception 'invalid provider account id';
  end if;
end;
$$;

revoke execute on function public.assert_identity(text, text) from public, anon, authenticated;

-- One lock per provider account, held to the end of the transaction.
create or replace function public.identity_lock_key(p_provider text, p_provider_user_id text)
returns bigint
language sql
immutable
as $$
  select hashtextextended('account_identity:' || p_provider || ':' || p_provider_user_id, 0);
$$;

revoke execute on function public.identity_lock_key(text, text) from public, anon, authenticated;

create or replace function public.clean_avatar_url(p_url text)
returns text
language sql
immutable
as $$
  select case when p_url ~* '^https://' and char_length(p_url) <= 512 then p_url end;
$$;

revoke execute on function public.clean_avatar_url(text) from public, anon, authenticated;

-- A username for an account whose name Cascade chooses (one made with
-- Discord): the provider's name, tidied, with "#2", "#3"... added when
-- another account already has it. osu! names stay exactly as osu! has them.
create or replace function public.free_username(p_name text, p_user uuid default null)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_base text;
  v_try text;
  v_n integer := 1;
begin
  -- Whitespace (tabs too) becomes single spaces, then control and invisible
  -- formatting characters go, and the characters a profile link can't hold
  -- or that read as markup (/ \ < >).
  v_base := regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g');
  v_base := regexp_replace(v_base, '[[:cntrl:]/\\<>]', '', 'g');
  v_base := regexp_replace(v_base, '[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]', '', 'g');
  v_base := btrim(regexp_replace(v_base, ' {2,}', ' ', 'g'));
  if char_length(v_base) = 0 then
    v_base := 'mapper';
  end if;
  v_base := left(v_base, 32);
  v_try := v_base;
  loop
    exit when not exists (
      select 1 from public.users u
      where lower(u.username) = lower(v_try)
        and (p_user is null or u.id <> p_user)
    );
    v_n := v_n + 1;
    if v_n > 50 then
      return left(v_base, 23) || '#' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    end if;
    v_try := left(v_base, 32 - char_length('#' || v_n)) || '#' || v_n;
  end loop;
  return v_try;
end;
$$;

revoke execute on function public.free_username(text, uuid) from public, anon, authenticated;

-- What the Worker needs about an account for a session.
create or replace function public.auth_session_user(p_user uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'id', u.id,
    'osu_id', u.osu_id,
    'username', u.username,
    'handle', case when public.find_user_id(u.username) = u.id then u.username else u.id::text end,
    'avatar_url', u.avatar_url,
    'is_admin', u.is_admin,
    'last_signed_in_at', u.last_signed_in_at,
    'profile_provider', u.profile_provider,
    'providers', coalesce(
      (select json_agg(i.provider order by i.provider)
       from public.account_identities i where i.user_id = u.id),
      '[]'::json
    )
  )
  from public.users u
  where u.id = p_user;
$$;

revoke execute on function public.auth_session_user(uuid) from public, anon, authenticated;
grant execute on function public.auth_session_user(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Signing in
-- ---------------------------------------------------------------------------

-- Signs in with a provider account the Worker has just verified with the
-- provider. A known identity reaches its account; an unknown one gets a new
-- account. Never attaches an identity to an existing account: that is
-- link_account_identity's job, and only on an explicit request.
--
-- The account's name and avatar follow the provider it was made with:
-- osu! names are taken as they are, as before; a Discord name is tidied and
-- kept unique, and only changes when the Discord name does.
create or replace function public.auth_sign_in(
  p_provider text,
  p_provider_user_id text,
  p_username text,
  p_avatar_url text default null,
  p_country_code text default null
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_identity public.account_identities;
  v_user public.users;
  v_created boolean := false;
  v_previous_name text;
  v_name text := left(btrim(coalesce(p_username, '')), 64);
  v_avatar text := public.clean_avatar_url(p_avatar_url);
  v_country text := case when p_country_code ~ '^[A-Z]{2}$' then p_country_code end;
begin
  perform public.assert_identity(p_provider, p_provider_user_id);
  perform pg_advisory_xact_lock(public.identity_lock_key(p_provider, p_provider_user_id));

  select * into v_identity from public.account_identities
    where provider = p_provider and provider_user_id = p_provider_user_id;

  -- An osu! account from before identities, or one whose identity row is
  -- somehow missing: the account that has the osu! id is still the owner.
  if v_identity.id is null and p_provider = 'osu' then
    select * into v_user from public.users where osu_id = p_provider_user_id::bigint;
    if v_user.id is not null then
      insert into public.account_identities (user_id, provider, provider_user_id)
        values (v_user.id, 'osu', p_provider_user_id)
        on conflict do nothing;
      select * into v_identity from public.account_identities
        where provider = 'osu' and provider_user_id = p_provider_user_id;
      if v_identity.id is null then
        raise exception 'this osu! account''s Cascade account has a different osu! sign-in';
      end if;
    end if;
  end if;

  if v_identity.id is null then
    insert into public.users (
      osu_id, username, avatar_url, country_code, profile_provider, last_signed_in_at
    ) values (
      case when p_provider = 'osu' then p_provider_user_id::bigint end,
      case when p_provider = 'osu' then coalesce(nullif(v_name, ''), 'mapper')
           else public.free_username(v_name) end,
      v_avatar,
      v_country,
      p_provider,
      now()
    )
    returning * into v_user;
    -- The osu! trigger above has already added an osu! identity.
    insert into public.account_identities (user_id, provider, provider_user_id)
      values (v_user.id, p_provider, p_provider_user_id)
      on conflict do nothing;
    select * into v_identity from public.account_identities
      where provider = p_provider and provider_user_id = p_provider_user_id;
    v_created := true;
  end if;

  v_previous_name := v_identity.display_name;
  update public.account_identities set
    display_name = coalesce(nullif(v_name, ''), display_name),
    avatar_url = coalesce(v_avatar, avatar_url),
    last_used_at = now(),
    updated_at = now()
  where id = v_identity.id;

  if not v_created then
    update public.users u set
      last_signed_in_at = now(),
      username = case
        when u.profile_provider <> p_provider or v_name = '' then u.username
        when p_provider = 'osu' then v_name
        when v_previous_name is distinct from v_name then public.free_username(v_name, u.id)
        else u.username
      end,
      avatar_url = case
        when u.profile_provider = p_provider and v_avatar is not null then v_avatar
        else u.avatar_url
      end,
      country_code = case
        when p_provider = 'osu' then coalesce(v_country, u.country_code)
        else u.country_code
      end
    where u.id = v_identity.user_id;
  end if;

  return (public.auth_session_user(v_identity.user_id)::jsonb
    || jsonb_build_object('created', v_created))::json;
end;
$$;

revoke execute on function public.auth_sign_in(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.auth_sign_in(text, text, text, text, text) to service_role;

-- The account a provider account signs in to, if any. For confirming it's
-- you before a sensitive change.
create or replace function public.identity_owner(p_provider text, p_provider_user_id text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select i.user_id from public.account_identities i
  where i.provider = p_provider and i.provider_user_id = p_provider_user_id;
$$;

revoke execute on function public.identity_owner(text, text) from public, anon, authenticated;
grant execute on function public.identity_owner(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Linking and unlinking
-- ---------------------------------------------------------------------------

-- Attaches a provider account the caller has just proven they own to their
-- Cascade account. Returns:
--   'linked'          attached now
--   'already_linked'  it was already this account's (nothing changes)
--   'claimed'         another Cascade account has it (nothing changes)
--   'provider_taken'  this account already has a different account of that
--                     provider (nothing changes)
-- An identity is never moved between accounts and accounts are never merged.
create or replace function public.link_account_identity(
  p_user uuid,
  p_provider text,
  p_provider_user_id text,
  p_display_name text default null,
  p_avatar_url text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_identity public.account_identities;
begin
  perform public.assert_identity(p_provider, p_provider_user_id);
  perform pg_advisory_xact_lock(public.identity_lock_key(p_provider, p_provider_user_id));
  perform 1 from public.users where id = p_user for update;
  if not found then
    raise exception 'no such account';
  end if;

  select * into v_identity from public.account_identities
    where provider = p_provider and provider_user_id = p_provider_user_id;
  if v_identity.id is not null then
    if v_identity.user_id <> p_user then
      return 'claimed';
    end if;
    update public.account_identities set
      display_name = coalesce(left(nullif(btrim(p_display_name), ''), 64), display_name),
      avatar_url = coalesce(public.clean_avatar_url(p_avatar_url), avatar_url),
      updated_at = now()
    where id = v_identity.id;
    return 'already_linked';
  end if;

  if p_provider = 'osu' and exists (
    select 1 from public.users where osu_id = p_provider_user_id::bigint and id <> p_user
  ) then
    return 'claimed';
  end if;
  if exists (
    select 1 from public.account_identities where user_id = p_user and provider = p_provider
  ) then
    return 'provider_taken';
  end if;

  insert into public.account_identities (
    user_id, provider, provider_user_id, display_name, avatar_url
  ) values (
    p_user,
    p_provider,
    p_provider_user_id,
    left(nullif(btrim(p_display_name), ''), 64),
    public.clean_avatar_url(p_avatar_url)
  );
  if p_provider = 'osu' then
    update public.users set osu_id = p_provider_user_id::bigint where id = p_user;
  end if;
  return 'linked';
end;
$$;

revoke execute on function public.link_account_identity(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.link_account_identity(uuid, text, text, text, text) to service_role;

-- Removes one way of signing in. Returns 'unlinked', 'not_linked', or
-- 'last_identity' when it is the only one left, which is always refused: an
-- account must keep a way in. The account, its maps and everything else
-- stay; only the identity (and osu!'s cached public numbers) go.
create or replace function public.unlink_account_identity(p_user uuid, p_provider text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_identity public.account_identities;
  v_remaining text;
begin
  if p_provider is null or p_provider not in ('discord', 'osu') then
    raise exception 'unknown sign-in provider';
  end if;
  select * into v_identity from public.account_identities
    where user_id = p_user and provider = p_provider;
  if v_identity.id is null then
    return 'not_linked';
  end if;
  -- Same lock order as signing in and linking: the identity, then the account.
  perform pg_advisory_xact_lock(public.identity_lock_key(p_provider, v_identity.provider_user_id));
  perform 1 from public.users where id = p_user for update;
  select * into v_identity from public.account_identities
    where user_id = p_user and provider = p_provider;
  if v_identity.id is null then
    return 'not_linked';
  end if;

  select i.provider into v_remaining from public.account_identities i
    where i.user_id = p_user and i.provider <> p_provider
    order by i.created_at
    limit 1;
  if v_remaining is null then
    return 'last_identity';
  end if;

  delete from public.account_identities where id = v_identity.id;
  update public.users set
    osu_id = case when p_provider = 'osu' then null else osu_id end,
    profile_provider = case when profile_provider = p_provider then v_remaining else profile_provider end
  where id = p_user;
  if p_provider = 'osu' then
    delete from public.osu_profile_cache where user_id = p_user;
  end if;
  return 'unlinked';
end;
$$;

revoke execute on function public.unlink_account_identity(uuid, text) from public, anon, authenticated;
grant execute on function public.unlink_account_identity(uuid, text) to service_role;

-- An account's ways of signing in, for its Connected accounts.
create or replace function public.account_identities_of(p_user uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(json_build_object(
    'provider', i.provider,
    'provider_user_id', i.provider_user_id,
    'display_name', i.display_name,
    'avatar_url', i.avatar_url,
    'created_at', i.created_at,
    'last_used_at', i.last_used_at
  ) order by i.provider), '[]'::json)
  from public.account_identities i
  where i.user_id = p_user;
$$;

revoke execute on function public.account_identities_of(uuid) from public, anon, authenticated;
grant execute on function public.account_identities_of(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Names are not identities
-- ---------------------------------------------------------------------------

-- Finds an account by its id, its current username (case-insensitive) or its
-- osu! id. When two accounts share a name, the one whose name osu! verified
-- wins, then the one seen most recently; profile cards carry a `handle` that
-- always reaches the right account.
create or replace function public.find_user_id(p_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_id uuid;
begin
  if v_name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select u.id into v_id from public.users u where u.id = v_name::uuid;
    if v_id is not null then
      return v_id;
    end if;
  end if;
  select u.id into v_id from public.users u
    where lower(u.username) = lower(v_name)
    order by (u.profile_provider = 'osu') desc, u.last_signed_in_at desc nulls last
    limit 1;
  if v_id is not null then
    return v_id;
  end if;
  if v_name ~ '^[0-9]{1,12}$' then
    select u.id into v_id from public.users u where u.osu_id = v_name::bigint limit 1;
  end if;
  return v_id;
end;
$$;

revoke execute on function public.find_user_id(text) from public, anon, authenticated;

-- 0046's card, plus `handle`: the username when it leads to this account,
-- otherwise the account id, so a link to someone sharing a name with another
-- account still opens theirs.
create or replace function public.profile_card(p_user uuid, p_viewer uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user public.users;
  v_cache public.osu_profile_cache;
  v_blocked_me boolean;
begin
  select * into v_user from public.users where id = p_user;
  if v_user.id is null then
    return null;
  end if;
  select * into v_cache from public.osu_profile_cache where user_id = p_user;
  v_blocked_me := p_viewer is not null and exists (
    select 1 from public.user_blocks k where k.blocker = p_user and k.blocked = p_viewer
  );
  return json_build_object(
    'id', v_user.id,
    'osu_id', v_user.osu_id,
    'username', v_user.username,
    'handle', case when public.find_user_id(v_user.username) = v_user.id
                   then v_user.username else v_user.id::text end,
    'avatar_url', v_user.avatar_url,
    'is_admin', v_user.is_admin,
    'country_code', coalesce(v_user.country_code, v_cache.country_code),
    'relationship', public.relationship_with(p_viewer, p_user),
    'presence', case when v_blocked_me then null else public.presence_for(p_user, p_viewer) end,
    'osu', case when v_cache.user_id is null or v_user.osu_id is null then null else json_build_object(
      'ranked_count', v_cache.ranked_count,
      'loved_count', v_cache.loved_count,
      'pending_count', v_cache.pending_count,
      'graveyard_count', v_cache.graveyard_count,
      'guest_count', v_cache.guest_count,
      'is_supporter', v_cache.is_supporter
    ) end
  );
end;
$$;

revoke execute on function public.profile_card(uuid, uuid) from public, anon, authenticated;

-- 0041's invitation, finding the invitee the same way profiles do, so a name
-- two accounts share invites the one its profile link opens.
create or replace function public.add_collaborator(
  p_project uuid, p_username text, p_role text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_user  public.users;
begin
  if p_role not in ('editor','viewer') then
    raise exception 'invalid role';
  end if;
  select owner into v_owner from public.projects where id = p_project;
  if v_owner is null then
    raise exception 'project not found';
  end if;
  if v_owner <> auth.uid() and not public.is_admin() then
    raise exception 'only the project owner can invite collaborators';
  end if;
  if p_username is null or char_length(trim(p_username)) = 0 or char_length(p_username) > 64 then
    raise exception 'No user "%". They must sign in to the editor at least once first.', coalesce(p_username, '');
  end if;
  select * into v_user from public.users where id = public.find_user_id(p_username);
  if v_user.id is null then
    raise exception 'No user "%". They must sign in to the editor at least once first.', p_username;
  end if;
  if v_user.id = v_owner then
    raise exception 'The owner is already on this map.';
  end if;
  if public.is_blocked_between(auth.uid(), v_user.id)
     or public.is_blocked_between(v_owner, v_user.id) then
    raise exception 'You can''t invite this user.';
  end if;
  insert into public.project_collaborators (
    project_id, user_id, role, invited_by, archived, created_at
  ) values (
    p_project, v_user.id, p_role, auth.uid(), false, clock_timestamp()
  )
  on conflict (project_id, user_id) do update set
    role = excluded.role,
    invited_by = excluded.invited_by,
    archived = false,
    created_at = excluded.created_at;
  return json_build_object(
    'user_id', v_user.id, 'username', v_user.username,
    'avatar_url', v_user.avatar_url, 'role', p_role
  );
end;
$$;

grant execute on function public.add_collaborator(uuid, text, text)
  to authenticated;

notify pgrst, 'reload schema';

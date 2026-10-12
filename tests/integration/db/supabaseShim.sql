-- The parts of Supabase's own schema that the migrations rely on, reduced to
-- what a test needs: the request roles, the caller's id from its JWT claims,
-- and the realtime and storage tables policies are written against. The real
-- platform owns these; tests only need them to exist and behave the same way.
do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin bypassrls;
exception when duplicate_object then null; end $$;

create schema if not exists auth;
create schema if not exists extensions;
create schema if not exists storage;
create schema if not exists realtime;

create table if not exists auth.users (
  id uuid primary key,
  raw_user_meta_data jsonb default '{}'::jsonb
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select jsonb_build_object('sub', auth.uid(), 'role', auth.role())
$$;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  metadata jsonb
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

create table if not exists realtime.messages (
  id bigserial primary key,
  topic text,
  extension text,
  payload jsonb,
  event text,
  private boolean
);

create or replace function realtime.topic() returns text
language sql stable as $$
  select current_setting('realtime.topic', true)
$$;

do $$ begin
  create publication supabase_realtime;
exception when duplicate_object then null; end $$;

grant usage on schema public, auth, storage, realtime, extensions to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- Realtime checks a client's right to join or send on a private channel by
-- running its row-level security over realtime.messages as that client.
grant select, insert on realtime.messages to anon, authenticated;
grant usage, select on all sequences in schema realtime to anon, authenticated;

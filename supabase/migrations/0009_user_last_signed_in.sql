alter table public.users
  add column if not exists last_signed_in_at timestamptz;

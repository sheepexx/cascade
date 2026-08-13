create table if not exists public.user_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint user_settings_object check (jsonb_typeof(settings) = 'object'),
  constraint user_settings_size check (pg_column_size(settings) <= 262144)
);

create table if not exists public.user_skins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  slot smallint not null check (slot between 1 and 2),
  filename text not null check (char_length(filename) between 1 and 255),
  storage_path text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  bytes bigint not null check (bytes between 1 and 62914560),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slot),
  constraint user_skins_storage_path check (
    storage_path = 'users/' || user_id::text || '/skins/' || slot::text || '/' || sha256 || '.osk'
  )
);

create index if not exists user_skins_user_idx on public.user_skins(user_id);

drop trigger if exists user_settings_touch_updated_at on public.user_settings;
create trigger user_settings_touch_updated_at
  before update on public.user_settings
  for each row execute function public.touch_updated_at();

drop trigger if exists user_skins_touch_updated_at on public.user_skins;
create trigger user_skins_touch_updated_at
  before update on public.user_skins
  for each row execute function public.touch_updated_at();

alter table public.user_settings enable row level security;
alter table public.user_skins enable row level security;

drop policy if exists user_settings_select on public.user_settings;
create policy user_settings_select on public.user_settings
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists user_settings_insert on public.user_settings;
create policy user_settings_insert on public.user_settings
  for insert with check (user_id = auth.uid());

drop policy if exists user_settings_update on public.user_settings;
create policy user_settings_update on public.user_settings
  for update using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists user_settings_delete on public.user_settings;
create policy user_settings_delete on public.user_settings
  for delete using (user_id = auth.uid() or public.is_admin());

drop policy if exists user_skins_select on public.user_skins;
create policy user_skins_select on public.user_skins
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists user_skins_insert on public.user_skins;
drop policy if exists user_skins_update on public.user_skins;
drop policy if exists user_skins_delete on public.user_skins;

revoke all on public.user_settings from anon;
revoke all on public.user_skins from anon;
grant select, insert, update, delete on public.user_settings to authenticated;
revoke insert, update, delete on public.user_skins from authenticated;
grant select on public.user_skins to authenticated;

notify pgrst, 'reload schema';

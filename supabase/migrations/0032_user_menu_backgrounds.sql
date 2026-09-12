-- One main-menu background per account. The picture itself lives in R2 under
-- users/<id>/menu-background/<sha256>.jpg; this table is the metadata the SPA
-- reads to know whether a slot is filled and how big the stored image is.
create table if not exists public.user_menu_backgrounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  filename text not null check (char_length(filename) between 1 and 255),
  storage_path text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  -- Uploads are re-encoded to JPEG client-side, so 8 MB is generous headroom
  -- for a 4K picture rather than a limit anyone should meet.
  bytes bigint not null check (bytes between 1 and 8388608),
  width integer not null check (width between 1280 and 3840),
  height integer not null check (height between 720 and 2160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_menu_backgrounds_storage_path check (
    storage_path = 'users/' || user_id::text || '/menu-background/' || sha256 || '.jpg'
  )
);

drop trigger if exists user_menu_backgrounds_touch_updated_at on public.user_menu_backgrounds;
create trigger user_menu_backgrounds_touch_updated_at
  before update on public.user_menu_backgrounds
  for each row execute function public.touch_updated_at();

alter table public.user_menu_backgrounds enable row level security;

-- Readable by its owner (and admins) so the SPA can show the filled slot.
-- Writes go through the Worker's service role, which also owns the R2 object,
-- so the two can never drift apart.
drop policy if exists user_menu_backgrounds_select on public.user_menu_backgrounds;
create policy user_menu_backgrounds_select on public.user_menu_backgrounds
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists user_menu_backgrounds_insert on public.user_menu_backgrounds;
drop policy if exists user_menu_backgrounds_update on public.user_menu_backgrounds;
drop policy if exists user_menu_backgrounds_delete on public.user_menu_backgrounds;

revoke all on public.user_menu_backgrounds from anon;
revoke insert, update, delete on public.user_menu_backgrounds from authenticated;
grant select on public.user_menu_backgrounds to authenticated;

notify pgrst, 'reload schema';

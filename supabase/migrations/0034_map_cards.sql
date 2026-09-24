create table if not exists public.map_card_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  config jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint map_card_presets_name_unique unique (user_id, name),
  constraint map_card_presets_config_object check (jsonb_typeof(config) = 'object'),
  constraint map_card_presets_config_size check (pg_column_size(config) <= 8192)
);

create index if not exists map_card_presets_user_updated_idx
  on public.map_card_presets(user_id, updated_at desc);

drop trigger if exists map_card_presets_touch_updated_at on public.map_card_presets;
create trigger map_card_presets_touch_updated_at
  before update on public.map_card_presets
  for each row execute function public.touch_updated_at();

create or replace function public.enforce_map_card_preset_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.map_card_presets p
    where p.user_id = new.user_id and p.name = new.name
  ) then
    return new;
  end if;
  if (
    select count(*) from public.map_card_presets p where p.user_id = new.user_id
  ) >= 50 then
    raise exception 'map card preset limit reached'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists map_card_presets_limit on public.map_card_presets;
create trigger map_card_presets_limit
  before insert on public.map_card_presets
  for each row execute function public.enforce_map_card_preset_limit();

alter table public.map_card_presets enable row level security;

drop policy if exists map_card_presets_select on public.map_card_presets;
create policy map_card_presets_select on public.map_card_presets
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists map_card_presets_insert on public.map_card_presets;
create policy map_card_presets_insert on public.map_card_presets
  for insert with check (user_id = auth.uid());

drop policy if exists map_card_presets_update on public.map_card_presets;
create policy map_card_presets_update on public.map_card_presets
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists map_card_presets_delete on public.map_card_presets;
create policy map_card_presets_delete on public.map_card_presets
  for delete using (user_id = auth.uid() or public.is_admin());

revoke all on public.map_card_presets from anon;
grant select, insert, update, delete on public.map_card_presets to authenticated;

create table if not exists public.map_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]{10}$'),
  map_key text not null check (map_key ~ '^[A-Za-z0-9_.:-]{1,200}$'),
  storage_path text not null,
  bytes bigint not null check (bytes between 1 and 8388608),
  width integer not null check (width between 1 and 4096),
  height integer not null check (height between 1 and 4096),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint map_cards_map_key_unique unique (user_id, map_key),
  constraint map_cards_storage_path check (storage_path = 'cards/' || slug || '.png')
);

create index if not exists map_cards_user_updated_idx
  on public.map_cards(user_id, updated_at desc);

drop trigger if exists map_cards_touch_updated_at on public.map_cards;
create trigger map_cards_touch_updated_at
  before update on public.map_cards
  for each row execute function public.touch_updated_at();

alter table public.map_cards enable row level security;

drop policy if exists map_cards_select on public.map_cards;
create policy map_cards_select on public.map_cards
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists map_cards_insert on public.map_cards;
drop policy if exists map_cards_update on public.map_cards;
drop policy if exists map_cards_delete on public.map_cards;

revoke all on public.map_cards from anon;
revoke insert, update, delete on public.map_cards from authenticated;
grant select on public.map_cards to authenticated;

notify pgrst, 'reload schema';

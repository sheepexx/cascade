alter table public.shared_maps
  add column if not exists audio_paths jsonb not null default '{}'::jsonb;

alter table public.desktop_downloads
  drop constraint if exists desktop_downloads_asset_check;

alter table public.desktop_downloads
  add constraint desktop_downloads_asset_check
  check (asset in (
    'setup',
    'msi',
    'portable',
    'appimage',
    'deb',
    'rpm',
    'dmg',
    'other'
  ));

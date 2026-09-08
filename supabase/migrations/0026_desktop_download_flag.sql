insert into public.feature_flags (key, enabled, description)
values (
  'desktop_download',
  false,
  'Offer the Windows desktop app: the download page manifest and the in-app download link.'
)
on conflict (key) do nothing;

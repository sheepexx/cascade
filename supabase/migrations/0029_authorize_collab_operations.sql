-- Viewers may receive collaboration traffic and publish presence, but only
-- owners/editors may send broadcast operations or document refresh notices.

drop policy if exists "collab read project channel" on realtime.messages;
create policy "collab read project channel" on realtime.messages
  for select to authenticated using (
    (
      realtime.topic() like 'project:%'
      and realtime.messages.extension in ('broadcast', 'presence')
      and public.can_view_project(split_part(realtime.topic(), ':', 2)::uuid)
    )
    or (
      realtime.topic() like 'project-sync:%'
      and public.can_view_project(split_part(realtime.topic(), ':', 2)::uuid)
    )
  );

drop policy if exists "collab send project channel" on realtime.messages;
create policy "collab send project channel" on realtime.messages
  for insert to authenticated with check (
    realtime.topic() like 'project:%'
    and (
      (
        realtime.messages.extension = 'presence'
        and public.can_view_project(split_part(realtime.topic(), ':', 2)::uuid)
      )
      or (
        realtime.messages.extension = 'broadcast'
        and public.can_edit_project(split_part(realtime.topic(), ':', 2)::uuid)
      )
    )
  );

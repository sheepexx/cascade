-- Publishing public assets now requires a cloud project owned by the caller.
-- Existing shared maps with a null project_id remain readable and deletable.

drop policy if exists shared_maps_insert on public.shared_maps;
create policy shared_maps_insert on public.shared_maps
  for insert with check (
    owner = auth.uid()
    and project_id is not null
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner = auth.uid()
    )
  );

drop policy if exists shared_maps_update on public.shared_maps;
create policy shared_maps_update on public.shared_maps
  for update using (owner = auth.uid() or public.is_admin())
  with check (
    public.is_admin()
    or (
      owner = auth.uid()
      and project_id is not null
      and exists (
        select 1 from public.projects p
        where p.id = project_id and p.owner = auth.uid()
      )
    )
  );

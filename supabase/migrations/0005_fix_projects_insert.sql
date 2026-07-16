-- Fix: non-admins cannot create/save cloud maps.
--
-- Diagnosis (verified against the live DB by minting test tokens):
--   * A non-admin user's token resolves auth.uid() correctly and they own the
--     row, yet INSERT into public.projects returns 42501 (RLS violation).
--   * An admin inserting a row they DON'T own also fails (owner check enforced),
--     but an admin inserting their own row succeeds.
--   => the effective INSERT check is `owner = auth.uid() AND is_admin()`.
--
-- That admin gate is NOT in the migrations (0001 defines INSERT as just
-- `owner = auth.uid()`), so a stray/restrictive policy was added to the live DB
-- out of band. This drops EVERY policy on public.projects (incl. restrictive
-- ones) and recreates the intended set: owner full CRUD + collaborator viewing
-- (0003), with INSERT gated only on ownership.

-- 1) Drop all existing policies on public.projects (permissive AND restrictive).
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'projects'
  loop
    execute format('drop policy if exists %I on public.projects', r.policyname);
  end loop;
end $$;

-- 2) Recreate the correct set.
--    SELECT/UPDATE use the collaborator-aware helpers from 0003; INSERT/DELETE
--    stay owner/admin per 0001.
create policy projects_select on public.projects
  for select using (public.can_view_project(id));

create policy projects_insert on public.projects
  for insert with check (owner = auth.uid());

create policy projects_update on public.projects
  for update using (public.can_edit_project(id))
  with check (public.can_edit_project(id));

create policy projects_delete on public.projects
  for delete using (owner = auth.uid() or public.is_admin());

-- 3) Verify - INSERT must be permissive with check `(owner = auth.uid())` and
--    NO is_admin() anywhere. Expect 4 rows, all permissive=PERMISSIVE.
select policyname, cmd, permissive, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'projects'
order by cmd;

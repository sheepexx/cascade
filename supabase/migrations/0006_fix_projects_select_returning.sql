-- Fix: non-admins cannot save cloud maps (INSERT ... RETURNING fails with 42501).
--
-- Root cause (proven against the live DB): the app saves with
-- `.insert(...).select('id')`, i.e. INSERT ... RETURNING. To return the row,
-- Postgres evaluates the SELECT policy on the new row. The SELECT policy was
-- `can_view_project(id)`, which runs `select 1 from projects where id = pid and
-- owner = auth.uid()` - a self-referential subquery that CANNOT see the
-- row being inserted in the same command. So it returns false for non-admins
-- (admins pass via the is_admin() short-circuit), raising
-- "new row violates row-level security policy for table projects".
--
-- Verified: the same insert WITHOUT returning succeeds; with returning it 42501s
-- for a non-admin owner, succeeds for an admin.
--
-- Fix: evaluate ownership against the row's own `owner` column directly (so the
-- new row passes during RETURNING), and check collaborators via the *separate*
-- project_collaborators table (no self-reference on projects). Same access
-- semantics as before: owner OR admin OR collaborator may view.

-- Restore the real insert check (it was temporarily set to `true` while debugging).
alter policy projects_insert on public.projects with check (owner = auth.uid());

-- Direct `owner = auth.uid()` makes the new row visible during RETURNING; the
-- SECURITY DEFINER can_view_project() handles admin + collaborators for existing
-- rows WITHOUT triggering RLS on project_collaborators (which would recurse back
-- into projects). Inlining the collaborator subquery here caused 42P17 recursion.
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select using (
    owner = auth.uid()
    or public.can_view_project(id)
  );

-- Verify: should show projects_insert check = (owner = auth.uid()) and
-- projects_select using the direct owner/collaborator expression.
select polname,
       polcmd::text as cmd,
       pg_get_expr(polqual, polrelid)      as using_expr,
       pg_get_expr(polwithcheck, polrelid) as check_expr
from pg_policy
where polrelid = 'public.projects'::regclass
order by polcmd::text;

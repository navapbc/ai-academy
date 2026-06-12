-- champion_admin_read_policies (P5.1c): the security boundary for Phase 5.
--
-- Expands the owner-only SELECT RLS on module_progress / quiz_attempts /
-- lab_submissions / profiles so a CHAMPION can read rows of learners in a cohort
-- they are assigned to, and an ADMIN can read all rows. The existing owner-only
-- read and every write policy are left untouched (PostgreSQL OR-combines
-- permissive policies, so these are purely additive: a plain learner still reads
-- only their own rows). Scoped strictly to those four tables — enrollments /
-- cohort_champions get no new read policy (is_champion_of reads them internally
-- as a definer; enumerating members is a P5.2/P5.5a dashboard concern), and
-- role_changes admin-read is deferred to P5.2 where a dashboard consumes it.

-- ---------------------------------------------------------------------------
-- Helper functions. Both are SECURITY DEFINER on purpose: the profiles policies
-- below reference is_admin(), so if the helper read profiles under the CALLER's
-- RLS it would re-trigger those policies → infinite recursion. The functions are
-- owned by postgres, which owns the tables and bypasses RLS (no table uses FORCE
-- ROW LEVEL SECURITY), so the reads run cleanly. auth.uid() inside a definer
-- function still resolves from the request JWT — it is the CALLER's uid, not the
-- owner's — so the scoping is correct. STABLE + empty search_path + fully
-- schema-qualified references, per the Supabase-recommended pattern.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

-- is_champion_of takes the row's owner column as an argument, so unlike
-- is_admin() (row-independent → hoisted to an InitPlan, evaluated once) it is
-- evaluated per row, each time doing the cohort_champions⋈enrollments join. The
-- indexes on cohort_champions(user_id) and enrollments(cohort_id) cover it at
-- this scale; revisit the query plan before P5.2 dashboard queries bulk-scan
-- these tables for every learner.
create or replace function public.is_champion_of(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.cohort_champions cc
    join public.enrollments e on e.cohort_id = cc.cohort_id
    where cc.user_id = (select auth.uid())
      and e.user_id = target
  );
$$;

-- Both helpers are EXECUTE-able by PUBLIC by default; the RLS policies below
-- (all `to authenticated`) require `authenticated` to have EXECUTE, so lock the
-- grant down to that role — anon cannot invoke them directly. (They only ever
-- return a boolean about the *caller's* own role/assignment, so the exposure is
-- minimal regardless; this is defense in depth.)
revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;
revoke execute on function public.is_champion_of(uuid) from public;
grant execute on function public.is_champion_of(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Additive SELECT policies. Owner column: user_id on the three activity tables,
-- id on profiles.
-- ---------------------------------------------------------------------------

-- module_progress
create policy "Module progress is readable by admin"
  on public.module_progress for select
  to authenticated
  using (public.is_admin());

create policy "Module progress is readable by champion"
  on public.module_progress for select
  to authenticated
  using (public.is_champion_of(user_id));

-- quiz_attempts
create policy "Quiz attempts are readable by admin"
  on public.quiz_attempts for select
  to authenticated
  using (public.is_admin());

create policy "Quiz attempts are readable by champion"
  on public.quiz_attempts for select
  to authenticated
  using (public.is_champion_of(user_id));

-- lab_submissions
create policy "Lab submissions are readable by admin"
  on public.lab_submissions for select
  to authenticated
  using (public.is_admin());

create policy "Lab submissions are readable by champion"
  on public.lab_submissions for select
  to authenticated
  using (public.is_champion_of(user_id));

-- profiles (owner column is id)
create policy "Profiles are readable by admin"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

create policy "Profiles are readable by champion"
  on public.profiles for select
  to authenticated
  using (public.is_champion_of(id));

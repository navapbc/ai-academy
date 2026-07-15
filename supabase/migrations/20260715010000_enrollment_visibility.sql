-- enrollment_visibility (cohort-restructure U4): the modules visibility flip
-- + viewer-independent staff denominators. One coordinated migration: the
-- policy change and the view/denominator hardening it forces land together.
--
-- Part 1 — modules SELECT policy (R5/R7/R8). Replaces the blanket
-- "Modules are viewable by authenticated users" policy (P3.2.2, `using (true)`)
-- with the Key-Decisions predicate:
--
--   visibility = 'public' OR has_program_access() OR is_staff()
--
-- so `visibility='program'` rows (Course 1 activities, seeded in U8) never
-- reach an unenrolled learner's browser. Every pre-existing row defaulted to
-- 'public' in U1, so nothing disappears for anyone today; Week 0, the
-- supplemental matrix content, and custom resources stay open to every
-- signed-in Nava user (R8). The U1 structure-table policies already exempt
-- public-module membership rows, so Week 0 renders inside Course 1 for exactly
-- the unenrolled population.
--
-- Deliberately NOT here:
--   • status / archived filtering stays client-side — the D10 "draft — under
--     review" badge on matrix cells is preserved; only the visibility axis
--     moves into RLS.
--   • the `draft` column exposure — deferred scoped work (closing it breaks
--     the CMS read path; see the plan's Deferred to Separate Tasks).
-- CMS/staff reads are unaffected: admins and champions pass is_staff(), and
-- admin-content writes ride service_role (bypasses RLS).
--
-- Part 2 — staff denominators (R16 groundwork). The P5.2a views are
-- `security_invoker`, and `learner_progress_summary` computed its
-- `modules_total` / `completion_pct` denominator with an inline
-- `count(*) from modules where status='published'` — evaluated under the
-- CALLER's RLS. That was exact while every authenticated user saw every row;
-- under the new policy an unenrolled non-staff caller would count only public
-- rows, skewing totals. The count moves into `published_modules_total()`
-- (SECURITY DEFINER ⇒ RLS-independent ⇒ the same number for every viewer).
-- Verified against the actual view SQL: only `learner_progress_summary`
-- counts modules — `cohort_progress_summary` / `cohort_score_distribution`
-- aggregate ITS output (avg completion_pct, learner counts), so they inherit
-- the fix unchanged and are not re-created. The views' RLS-scoped
-- progress/quiz/lab reads stay invoker-scoped on purpose — the P5.1c
-- champion/admin boundary is untouched; only the curriculum denominator
-- becomes viewer-independent.
--
-- Idempotent + re-runnable (D-25): drop-if-exists + guarded create policy,
-- create-or-replace function and view.

-- ---------------------------------------------------------------------------
-- 1. published_modules_total(): the viewer-independent denominator.
-- ---------------------------------------------------------------------------
-- Same hardening as is_admin()/is_staff(): SECURITY DEFINER (owned by
-- postgres, which owns the tables and bypasses RLS), STABLE, empty
-- search_path, fully schema-qualified. Returns int to keep the replaced
-- view column's type identical. Exposes only an aggregate count — no row
-- content — so granting it to every authenticated user is safe.
create or replace function public.published_modules_total()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from public.modules
  where status = 'published';
$$;

-- Unlike the policy helpers (evaluated inside RLS, which service_role skips),
-- this function runs in the VIEW body: security_invoker means whoever selects
-- the view needs EXECUTE — so service_role gets an explicit grant too.
revoke execute on function public.published_modules_total() from public;
grant execute on function public.published_modules_total() to authenticated;
grant execute on function public.published_modules_total() to service_role;

-- ---------------------------------------------------------------------------
-- 2. learner_progress_summary: re-created with the definer denominator.
-- ---------------------------------------------------------------------------
-- Byte-for-byte the P5.2a definition except: the `published_total` CTE is
-- gone, and its two read sites (`modules_total`, the `completion_pct`
-- divisor) call public.published_modules_total() instead. Identical column
-- list/types/order, so CREATE OR REPLACE succeeds in place and the dependent
-- cohort_progress_summary / cohort_score_distribution views keep working
-- unchanged. The function is row-independent + STABLE, so the planner hoists
-- it to an InitPlan (evaluated once per query, like the old CTE).
create or replace view public.learner_progress_summary
with (security_invoker = true) as
with best_quiz as (
  -- best (max) score fraction per (user, module), over modules that have a usable
  -- max_score; one row per (user_id, module_id).
  select
    qa.user_id,
    qa.module_id,
    max(qa.score::numeric / qa.max_score) as best_pct
  from public.quiz_attempts qa
  where qa.max_score is not null and qa.max_score > 0
  group by qa.user_id, qa.module_id
)
select
  p.id as user_id,
  e.cohort_id,
  (
    select count(*)::int
    from public.module_progress mp
    join public.modules m on m.cell_id = mp.module_id
    where mp.user_id = p.id
      and mp.status = 'completed'
      and m.status = 'published'
  ) as modules_completed,
  public.published_modules_total() as modules_total,
  (
    select count(*)::int
    from public.module_progress mp
    join public.modules m on m.cell_id = mp.module_id
    where mp.user_id = p.id
      and mp.status = 'completed'
      and m.status = 'published'
  )::numeric / nullif(public.published_modules_total(), 0) as completion_pct,
  (
    select count(distinct qa.module_id)::int
    from public.quiz_attempts qa
    where qa.user_id = p.id
  ) as quizzes_attempted,
  (
    select count(distinct qa.module_id)::int
    from public.quiz_attempts qa
    where qa.user_id = p.id and qa.passed
  ) as quizzes_passed,
  (
    select avg(bq.best_pct)
    from best_quiz bq
    where bq.user_id = p.id
  ) as avg_quiz_pct,
  exists (
    select 1
    from public.quiz_attempts qa
    where qa.user_id = p.id and qa.module_id = '2.14' and qa.passed
  ) as glat_passed,
  (
    select count(*)::int
    from public.lab_submissions ls
    where ls.user_id = p.id and ls.status = 'reviewable'
  ) as reviewable_labs
from public.profiles p
left join public.enrollments e on e.user_id = p.id;

-- Grants survive CREATE OR REPLACE, but re-granting is idempotent and keeps
-- the file self-contained.
grant select on public.learner_progress_summary to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The modules SELECT policy swap.
-- ---------------------------------------------------------------------------
-- Sequenced AFTER the denominator fix within this single-transaction
-- migration, so no committed state ever pairs the new policy with the old
-- invoker-scoped count.
drop policy if exists "Modules are viewable by authenticated users" on public.modules;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'modules'
      and policyname = 'Modules viewable by visibility, enrollment, or staff'
  ) then
    create policy "Modules viewable by visibility, enrollment, or staff"
      on public.modules for select
      to authenticated
      using (
        visibility = 'public'
        or public.has_program_access()
        or public.is_staff()
      );
  end if;
end $$;

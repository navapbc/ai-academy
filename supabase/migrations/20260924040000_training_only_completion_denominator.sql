-- training_only_completion_denominator — scope the staff completion metric to
-- course lessons, matching the learner-facing number.
--
-- WHY: supplemental coursework and resources are explicitly extra — they are not
-- required for course completion (product decision, 2026-09-24, also now stated
-- in 2.14's copy). The learner-facing surfaces already reflect that: the "Your
-- Training" headline, the Sidebar count and the My Progress card all run through
-- `isTrainingModule` in src/lib/modules.ts (origin === 'course'). The staff side
-- did not, so `learner_progress_summary.completion_pct` still divided by every
-- published module — 46 — while the learner saw a denominator of 13.
--
-- Both sides of the fraction move. Scoping only the denominator would let a
-- learner with supplemental completions exceed 100%.
--
-- KEEP IN SYNC WITH `isTrainingModule` (src/lib/modules.ts). This is a
-- cross-language allow-list: origin = 'course', published, not archived. There is
-- no shared definition, so this comment is the only link between them. An origin
-- added later is "extra" until it is named in BOTH places.
--
-- WHY A NEW FUNCTION rather than redefining `published_modules_total()`: that
-- function's name describes what it counts, and enrollmentVisibility.integration
-- .test.ts:263-340 calls it over RPC and asserts exactly that meaning
-- (viewer-independent, equal to the real published count). It is left untouched.
--
-- `create or replace view` is safe here: column names, types and order are
-- unchanged (`modules_total` stays int, `completion_pct` stays numeric), so the
-- dependent `cohort_progress_summary` and `cohort_score_distribution` keep
-- working and pick up the new semantics automatically. security_invoker = true is
-- re-stated so the view cannot silently lose its RLS scoping.
--
-- SCOPE / BLAST RADIUS:
--   * staff LearnerDetail "Completion"  (src/lib/learnerDetail.ts)
--   * cohort dashboard avg_completion_pct (src/lib/dashboard.ts, via
--     cohort_progress_summary)
--   * evidence export: UNAFFECTED IN OUTPUT — evidenceExport.ts selects
--     completion_pct but never emits it (interface + select list only).
--   * glat_pass_rate, avg_quiz_pct, quizzes_*, reviewable_labs: deliberately
--     unchanged. Those measure supplemental activity, which still happens; only
--     the completion fraction was making a claim about required work.

create or replace function public.training_modules_total()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  -- Mirror of isTrainingModule (src/lib/modules.ts): course-origin only.
  select count(*)::int
  from public.modules
  where origin = 'course'
    and status = 'published'
    and archived_at is null;
$$;

revoke execute on function public.training_modules_total() from public;
grant execute on function public.training_modules_total() to authenticated;
grant execute on function public.training_modules_total() to service_role;

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
    -- Numerator scoped to the same allow-list as training_modules_total(), so
    -- supplemental/resource completions can never push this over 100%.
    select count(*)::int
    from public.module_progress mp
    join public.modules m on m.cell_id = mp.module_id
    where mp.user_id = p.id
      and mp.status = 'completed'
      and m.origin = 'course'
      and m.status = 'published'
      and m.archived_at is null
  ) as modules_completed,
  public.training_modules_total() as modules_total,
  (
    select count(*)::int
    from public.module_progress mp
    join public.modules m on m.cell_id = mp.module_id
    where mp.user_id = p.id
      and mp.status = 'completed'
      and m.origin = 'course'
      and m.status = 'published'
      and m.archived_at is null
  )::numeric / nullif(public.training_modules_total(), 0) as completion_pct,
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

-- Grants survive CREATE OR REPLACE, but re-granting keeps the file
-- self-contained and re-runnable.
grant select on public.learner_progress_summary to authenticated;

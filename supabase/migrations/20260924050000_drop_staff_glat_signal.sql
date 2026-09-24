-- drop_staff_glat_signal — remove the GLAT pass/fail signal from the staff
-- aggregation layer.
--
-- WHY: the GLAT is a learner self-check, not a credential. 2.14 now says so in
-- its own copy (20260924030000): it opens nothing, supplemental coursework is
-- optional and not required for course completion, and the score is the
-- learner's own calibration signal. Reporting a pass/fail on that to staff —
-- per learner on LearnerDetail, and as a cohort-wide pass rate on the Cohort
-- Dashboard — contradicts it and turns an honest self-assessment into something
-- a learner has a reason to game. The learner keeps their own GLAT card; it is
-- computed client-side in summarizeOwnProgress (src/lib/learnerSelf.ts) from
-- their own quiz attempts, NOT from these views, so it is unaffected.
--
-- DROP + CREATE, not CREATE OR REPLACE: `create or replace view` cannot REMOVE a
-- column. learner_progress_summary loses glat_passed and cohort_progress_summary
-- loses glat_pass_rate, so all three views are dropped in dependency order and
-- rebuilt. cohort_score_distribution is unchanged but must be recreated because
-- it depends on learner_progress_summary.
--
-- Grants do NOT survive a DROP (unlike CREATE OR REPLACE), so every view is
-- re-granted below, and security_invoker = true is re-stated on each — a view
-- rebuilt without it would silently lose its RLS scoping.
--
-- The rest of learner_progress_summary is carried over verbatim from
-- 20260924040000_training_only_completion_denominator.sql, including the
-- course-only numerator and training_modules_total() denominator.
--
-- NOT TOUCHED: quiz_attempts rows for module_id '2.14' are still written and
-- still feed avg_quiz_pct, and the GLAT lab itself (cell 2.14, passThreshold
-- 0.8) is unchanged. This removes a staff-facing readout, not the instrument or
-- its data — the history stays queryable if the decision is ever revisited.

drop view if exists public.cohort_progress_summary;
drop view if exists public.cohort_score_distribution;
drop view if exists public.learner_progress_summary;

create view public.learner_progress_summary
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
    -- Keep in sync with isTrainingModule (src/lib/modules.ts).
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
  (
    select count(*)::int
    from public.lab_submissions ls
    where ls.user_id = p.id and ls.status = 'reviewable'
  ) as reviewable_labs
from public.profiles p
left join public.enrollments e on e.user_id = p.id;

grant select on public.learner_progress_summary to authenticated;

create view public.cohort_progress_summary
with (security_invoker = true) as
select
  cohort_id,
  count(*)::int as learner_count,
  avg(completion_pct) as avg_completion_pct,
  avg(avg_quiz_pct) as avg_quiz_pct,
  coalesce(sum(reviewable_labs), 0)::int as reviewable_total
from public.learner_progress_summary
group by cohort_id;

grant select on public.cohort_progress_summary to authenticated;

-- Unchanged from 20260613000000:141-153; recreated only because it depends on
-- learner_progress_summary.
create view public.cohort_score_distribution
with (security_invoker = true) as
select
  cohort_id,
  case
    when avg_quiz_pct < 0.60 then 'lt60'
    when avg_quiz_pct < 0.80 then '60to79'
    else '80to100'
  end as band,
  count(*)::int as learner_count
from public.learner_progress_summary
where avg_quiz_pct is not null
group by cohort_id, band;

grant select on public.cohort_score_distribution to authenticated;

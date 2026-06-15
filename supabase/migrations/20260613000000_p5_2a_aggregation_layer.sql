-- p5_2a_aggregation_layer (P5.2a): the dashboard aggregation layer.
--
-- Adds the RLS-scoped read substrate the staff dashboard (P5.2b shell, P5.2c
-- drill-down) consumes: completion %, score distribution, GLAT pass rate, and
-- review-queue counts. Two parts:
--
--   1. Champion/admin SELECT policies on `enrollments`. P5.1c added champion/admin
--      reads to the four activity tables but deliberately left enrollments
--      owner-only, punting cross-user enrollment reads "to P5.2/P5.5a". A view that
--      groups by cohort must read enrollments, so that deferred work lands here --
--      verbatim parallel to the P5.1c policies, reusing is_admin/is_champion_of.
--   2. Three `security_invoker = true` views. RLS on the base tables applies as the
--      QUERYING user, and the filter runs pre-aggregation, so a champion's
--      count/avg covers only their cohort (no leak through the aggregate); an admin
--      sees all; a plain learner sees only their own row. No SECURITY DEFINER -- the
--      boundary stays in RLS, provable by the gated suite. Each view is granted
--      SELECT to `authenticated` (without it PostgREST 401s even with RLS correct).

-- ---------------------------------------------------------------------------
-- 1. enrollments read policies (additive; owner-read policy untouched).
--    cohort_champions gets none -- no view groups by champion, and is_champion_of
--    reads it internally as a SECURITY DEFINER.
-- ---------------------------------------------------------------------------
create policy "Enrollments are readable by admin"
  on public.enrollments for select
  to authenticated
  using (public.is_admin());

create policy "Enrollments are readable by champion"
  on public.enrollments for select
  to authenticated
  using (public.is_champion_of(user_id));

-- ---------------------------------------------------------------------------
-- 2a. learner_progress_summary -- one row per VISIBLE learner. Spine is profiles
--     (scoped by P5.1c's is_champion_of(id)/is_admin()); left join enrollments for
--     cohort_id. Per-learner metrics are computed by correlated aggregates over the
--     RLS-scoped activity tables.
--
--     GLAT assumption: glat_passed reads quiz_attempts for module_id='2.14' -- the
--     GLAT cell. P4.10 (the GLAT itself) is not built, so this returns false for
--     everyone until then; it is correct the moment 2.14 attempts exist.
--     -- revisit when P4.10 lands: D7 says the GLAT sets a "completion marker",
--     -- which could instead land as a module_progress completion row.
-- ---------------------------------------------------------------------------
create or replace view public.learner_progress_summary
with (security_invoker = true) as
with published_total as (
  select count(*)::int as n from public.modules where status = 'published'
),
best_quiz as (
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
  (select n from published_total) as modules_total,
  (
    select count(*)::int
    from public.module_progress mp
    join public.modules m on m.cell_id = mp.module_id
    where mp.user_id = p.id
      and mp.status = 'completed'
      and m.status = 'published'
  )::numeric / nullif((select n from published_total), 0) as completion_pct,
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

grant select on public.learner_progress_summary to authenticated;

-- ---------------------------------------------------------------------------
-- 2b. cohort_progress_summary -- aggregate learner_progress_summary by cohort.
--     Selecting a security_invoker view from a security_invoker view stays invoker
--     end-to-end, so RLS still resolves to the caller. The four P5.2b summary cards.
--     Unenrolled learners (cohort_id NULL) collapse into a single NULL-cohort group;
--     the dashboard filters to real cohort_ids.
-- ---------------------------------------------------------------------------
create or replace view public.cohort_progress_summary
with (security_invoker = true) as
select
  cohort_id,
  count(*)::int as learner_count,
  avg(completion_pct) as avg_completion_pct,
  (count(*) filter (where glat_passed))::numeric / nullif(count(*), 0) as glat_pass_rate,
  avg(avg_quiz_pct) as avg_quiz_pct,
  coalesce(sum(reviewable_labs), 0)::int as reviewable_total
from public.learner_progress_summary
group by cohort_id;

grant select on public.cohort_progress_summary to authenticated;

-- ---------------------------------------------------------------------------
-- 2c. cohort_score_distribution -- per (cohort_id, band) learner counts over
--     avg_quiz_pct. Bands (avg_quiz_pct is a 0..1 fraction):
--       'lt60'   : < 0.60
--       '60to79' : 0.60 .. 0.7999...
--       '80to100': >= 0.80
--     Learners with no quiz data (avg_quiz_pct NULL) are excluded from the bands.
-- ---------------------------------------------------------------------------
create or replace view public.cohort_score_distribution
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

-- multi_enrollment (cohort-restructure U5): multi-row enrollment + cohort
-- lifecycle guard (R6/R16).
--
--   1. enrollments: unique(user_id) → unique(user_id, cohort_id). A learner may
--      hold one enrollment PER COHORT (cohort-2 alumni re-enrollment), instead
--      of one enrollment total. The admin-cohorts Edge Function's upsert
--      conflict target changes in lockstep ((user_id) → (user_id, cohort_id)):
--      enrolling into a second cohort now ADDS a row — there is no
--      "reassignment" semantics anymore.
--   2. cohorts.archived_at: archive replaces hard-delete as the end-of-cohort
--      operation. Archiving touches NEITHER cohort_champions NOR enrollments
--      (Key Decision: auto-demotion would strip an ex-champion's program access
--      and their read access to the cohort they just ran, while their learners
--      keep both). Consequences, both deliberate:
--        • has_program_access() counts ANY enrollments row, so an enrollment in
--          an archived cohort still grants program access (alumni keep access).
--        • champions of an archived cohort keep read-only dashboard access
--          (their cohort_champions rows survive). Demotion happens only on
--          explicit unassign (roleAfterUnassign — unchanged).
--      Hard delete remains possible ONLY at zero enrollments; the admin-cohorts
--      function enforces that guard (409 + enrollment count) — the DB keeps the
--      cascade for the zero-enrollment case.
--   3. Champion SELECT on enrollments becomes cohort-ROW-scoped (review P1):
--      the P5.2a policy used the user-keyed is_champion_of(user_id), which was
--      exactly row-scoped only because of unique(user_id). Under multi-row it
--      would let a champion of cohort A enumerate a dual-enrolled learner's
--      OTHER cohort memberships. The replacement grants a champion an
--      enrollment row only when they champion that row's cohort. The
--      progress/attempts/submissions champion policies keep the existing
--      champion-of-any-shared-cohort posture (that data is not
--      cohort-partitioned) — documented accepted posture, asserted by the
--      gated multiEnrollment integration suite.
--
-- Views — verified against the live definitions, deliberately NOT re-created:
--   • learner_progress_summary (as re-created in 20260715010000) is
--     `from profiles p left join enrollments e on e.user_id = p.id`; with
--     multiple enrollment rows the join already fans out to ONE ROW PER
--     (learner × cohort) — exactly the U5-required shape — and its per-learner
--     correlated aggregates are user-scoped, so each cohort row repeats the
--     same (correct) metrics. Column list unchanged.
--   • cohort_progress_summary / cohort_score_distribution GROUP BY cohort_id
--     over that output, so a dual-enrolled learner counts once per cohort —
--     the intended per-cohort semantics. Global (cross-cohort) rollups don't
--     exist in SQL; the all-cohorts evidence export dedups learner rows
--     client-side (src/lib/evidenceExport.ts dedupLearnerRows).
--
-- Idempotent + re-runnable (D-25): drop-if-exists + guarded creates.

-- ---------------------------------------------------------------------------
-- 1. unique(user_id) → unique(user_id, cohort_id).
-- ---------------------------------------------------------------------------
-- The inline `unique (user_id)` in 20260611010000_cohort_substrate.sql got the
-- default name enrollments_user_id_key. The replacement's index (user_id,
-- cohort_id) keeps user_id as the leading column, so has_program_access()'s
-- user_id lookup stays index-covered; enrollments_cohort_id_idx covers the
-- cohort-side lookups.
alter table public.enrollments
  drop constraint if exists enrollments_user_id_key;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'enrollments_user_id_cohort_id_key'
      and conrelid = 'public.enrollments'::regclass
  ) then
    alter table public.enrollments
      add constraint enrollments_user_id_cohort_id_key unique (user_id, cohort_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. cohorts.archived_at — archive lifecycle marker.
-- ---------------------------------------------------------------------------
-- Nullable (forward-compatible for already-open tabs); null = active. Set only
-- by the admin-cohorts function's archive_cohort action (idempotent: it stamps
-- archived_at once and leaves an already-archived cohort untouched).
alter table public.cohorts
  add column if not exists archived_at timestamptz;

-- ---------------------------------------------------------------------------
-- 3. Champion read on enrollments: cohort-row-scoped.
-- ---------------------------------------------------------------------------
-- Replaces "Enrollments are readable by champion" (P5.2a, 20260613000000,
-- using is_champion_of(user_id)). Owner-read (P5.1b) and admin-read (P5.2a)
-- arms are untouched.
--
-- The predicate reads cohort_champions inline (as the plan prescribes) rather
-- than through a definer helper. cohort_champions' own RLS applies inside the
-- subquery, but its owner-read policy (user_id = auth.uid()) is exactly the
-- filter this predicate already applies, so the nested RLS is a harmless
-- double-filter — and cohort_champions' policies reference no other table, so
-- there is no recursion hazard.
drop policy if exists "Enrollments are readable by champion" on public.enrollments;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'enrollments'
      and policyname = 'Enrollments are readable by cohort champion'
  ) then
    create policy "Enrollments are readable by cohort champion"
      on public.enrollments for select
      to authenticated
      using (
        exists (
          select 1
          from public.cohort_champions cc
          where cc.cohort_id = enrollments.cohort_id
            and cc.user_id = (select auth.uid())
        )
      );
  end if;
end $$;

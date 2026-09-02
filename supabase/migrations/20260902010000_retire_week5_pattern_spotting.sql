-- Retire the Week 5 pattern-spotting activity:
--
--   * c1-w5-pattern-spotting — "Spot the Pattern: Four Ways AI Fails in Civic Tech"
--
-- The four-failure-shape practice is covered elsewhere in the program, so the
-- Academy copy is no longer needed; leaving it assigned only adds noise to a
-- learner's Week 5 list. Week 5 keeps c1-w5-classify-route, the breakout the
-- facilitator doc actually sends learners into the Academy for.
--
-- Same shape as 20260806010000_retire_lookup_and_delegation_sorts.sql, and the
-- same reasoning applies:
--
-- ARCHIVE, NEVER HARD DELETE. `delete from public.modules` cascades
-- public.content_versions (20260602130334_modules_content_as_data.sql:50-58),
-- destroying CMS version history irreversibly, and buys nothing:
-- module_progress.module_id is plain text with no FK
-- (20260528221204_init_core.sql:23-31), so neither path touches recorded
-- progress. Restoring the lesson is a one-line
-- `update public.modules set archived_at = null` plus re-inserting its
-- course_week_modules row.
--
-- ORDER MATTERS:
--   1. drop the week membership FIRST — the CMS refuses to archive a
--      week-assigned lesson (admin-content/index.ts:253 ->
--      archiveBlockedReason at admin-content-core.ts:1104), and
--      buildCourseAuthoring (src/lib/adminCourses.ts) keeps listing an archived
--      module as a week member; it only filters archived_at out of the
--      assignable picker (:192).
--   2. then stamp archived_at — learners stop seeing the row immediately
--      (src/lib/modules.ts:317 filters `.is('archived_at', null)`).
--
-- NO ordering gap to close: pattern-spotting held week_sort_order 1, the last of
-- Week 5's two members, so c1-w5-classify-route keeps sort_order 0 and Week 5
-- needs no re-sort. Contrast the Week 2 fix-up in the earlier retire migration,
-- where the retired lesson held slot 0.
--
-- published_modules_total() already filters archived_at
-- (20260806010000_retire_lookup_and_delegation_sorts.sql), so this module drops
-- out of every learner's completion denominator with no function change here.
-- As with that migration, the `modules_completed` numerator in
-- learner_progress_summary still counts a completion recorded against this
-- module, so completion_pct rises for anyone who already finished it — warn
-- champions of an in-flight cohort before deploying.
--
-- Idempotent (D-25): the delete is a no-op on re-run, and archived_at is set via
-- coalesce so an already-archived row keeps its original timestamp.
--
-- DATA-04 caveat: this migration touches only archived_at and membership —
-- never body_md or lab_config_json — so no CMS-authored copy is clobbered.

do $$
declare
  m           record;
  unassigned  integer := 0;
  archived    integer := 0;
begin
  for m in
    select cell_id, title, status, archived_at
    from public.modules
    where cell_id = 'c1-w5-pattern-spotting'
  loop
    raise notice 'retire_pattern_spotting: found cell_id=% title=% status=% archived_at=%',
      m.cell_id, m.title, m.status, m.archived_at;
  end loop;

  delete from public.course_week_modules
   where cell_id = 'c1-w5-pattern-spotting';
  get diagnostics unassigned = row_count;

  update public.modules
     set archived_at = coalesce(archived_at, now())
   where cell_id = 'c1-w5-pattern-spotting'
     and archived_at is null;
  get diagnostics archived = row_count;

  raise notice 'retire_pattern_spotting: % week membership row(s) removed, % module(s) newly archived.',
    unassigned, archived;
end $$;

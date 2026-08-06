-- Retire the two full-group live activities (content review W1.2 + W1.3,
-- Sarah Grayvin comments [4] and [5]):
--
--   * c1-w1-lookup-vs-predict — "Lookup or Predict?"            (Week 1)
--   * c1-w2-delegation-sort   — "Full-AI, Assisted, or Human-Only?" (Week 2)
--
-- Both are run live by the Champion with the whole group; neither is worked
-- through in the Academy, so they only add noise to a learner's week list.
--
-- ARCHIVE, NEVER HARD DELETE (human decision 2). `delete from public.modules`
-- cascades public.content_versions (20260602130334_modules_content_as_data.sql
-- :50-58), destroying CMS version history irreversibly, and buys nothing:
-- module_progress.module_id is plain text with no FK (20260528221204_init_core
-- .sql:23-31), so neither path touches recorded progress. Restoring either
-- lesson mid-pilot is a one-line `update public.modules set archived_at = null`
-- plus re-inserting its course_week_modules row.
--
-- ORDER MATTERS:
--   1. drop the week membership FIRST — the CMS refuses to archive a
--      week-assigned lesson (admin-content/index.ts:239-254 ->
--      archiveBlockedReason at admin-content-core.ts:1039-1046), and
--      buildCourseAuthoring (src/lib/adminCourses.ts:164-173) keeps listing an
--      archived module as a week member; it only filters archived_at out of the
--      assignable picker (:192).
--   2. then stamp archived_at — learners stop seeing the rows immediately
--      (src/lib/modules.ts:317 filters `.is('archived_at', null)`).
--   3. then close the Week 2 ordering gap left behind (delegation-sort held
--      week_sort_order 0). Mirrors the same change in
--      supabase/seed-data/course1-content.json, so a fresh `db reset` and an
--      already-migrated database land on identical state.
--   4. re-issue published_modules_total() with an archived_at filter (W1.3).
--
-- Idempotent (D-25): the delete is a no-op on re-run, archived_at is set via
-- coalesce so an already-archived row keeps its original timestamp, and the
-- function/grants are create-or-replace.
--
-- DATA-04 caveat: this migration mutates rows the CMS may also have edited. It
-- only touches archived_at / membership / sort_order — never body_md or
-- lab_config_json — so no authored copy is clobbered.

-- ---------------------------------------------------------------------------
-- 1 + 2 + 3. Unassign, archive, close the ordering gap. One transaction.
-- ---------------------------------------------------------------------------
do $$
declare
  m           record;
  unassigned  integer := 0;
  archived    integer := 0;
  resorted    integer := 0;
begin
  for m in
    select cell_id, title, status, archived_at
    from public.modules
    where cell_id in ('c1-w1-lookup-vs-predict', 'c1-w2-delegation-sort')
    order by cell_id
  loop
    raise notice 'retire_sorts: found cell_id=% title=% status=% archived_at=%',
      m.cell_id, m.title, m.status, m.archived_at;
  end loop;

  delete from public.course_week_modules
   where cell_id in ('c1-w1-lookup-vs-predict', 'c1-w2-delegation-sort');
  get diagnostics unassigned = row_count;

  update public.modules
     set archived_at = coalesce(archived_at, now())
   where cell_id in ('c1-w1-lookup-vs-predict', 'c1-w2-delegation-sort')
     and archived_at is null;
  get diagnostics archived = row_count;

  update public.course_week_modules
     set sort_order = 0
   where cell_id = 'c1-w2-ground-and-scope'
     and sort_order <> 0;
  get diagnostics resorted = row_count;

  raise notice 'retire_sorts: % week membership row(s) removed, % module(s) newly archived, % Week 2 membership row(s) re-sorted.',
    unassigned, archived, resorted;
end $$;

-- ---------------------------------------------------------------------------
-- 4. published_modules_total(): exclude archived modules (W1.3).
-- ---------------------------------------------------------------------------
-- Supersedes the definition in 20260715010000_enrollment_visibility.sql:55-65,
-- which counted every status='published' row with no archived_at filter. The
-- two lessons retired above stay status='published' (archive is the soft-delete
-- axis), so without this they would sit in every learner's denominator forever
-- and permanently cap the champion dashboard's completion_pct below 100%.
--
-- Signature, volatility, security and search_path are unchanged, so
-- learner_progress_summary (which reads it at :108 and :116) picks the fix up
-- in place and needs no re-creation.
--
-- Deliberately NOT changed: the `modules_completed` numerator in
-- learner_progress_summary still counts completions against archived modules.
-- Filtering it would retroactively lower already-recorded completions — a
-- product call, not a bug fix (human decision 11). The effect of this migration
-- is therefore that completion_pct rises for anyone mid-cohort; warn champions
-- of an in-flight cohort before deploying.
create or replace function public.published_modules_total()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from public.modules
  where status = 'published'
    and archived_at is null;
$$;

-- Re-issued verbatim from 20260715010000:70-73 — grants survive CREATE OR
-- REPLACE, but repeating them keeps this file self-contained and re-runnable.
revoke execute on function public.published_modules_total() from public;
grant execute on function public.published_modules_total() to authenticated;
grant execute on function public.published_modules_total() to service_role;

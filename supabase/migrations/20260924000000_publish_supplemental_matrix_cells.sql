-- publish_supplemental_matrix_cells — sign off the 18 matrix cells still marked
-- 'in_review', clearing the "draft — under review" badge across the whole
-- Supplemental coursework section.
--
-- WHY: 20260602141611_stage_1b_content.sql:12-13 describes 'in_review' as "a
-- queryable marker, flipped to 'published' on sign-off". That sign-off never
-- happened for these cells — the only formal L&D review (Sarah Grayvin,
-- 2026-08-03) landed entirely inside Course 1 and touched zero matrix cells
-- (docs/content/content-review-plan.md:14-16). Meanwhile learners have been
-- seeing them the whole time: src/lib/modules.ts:337 keeps every matrix row
-- regardless of status, so 'in_review' only adds a badge, it never hid a
-- lesson. This migration makes the recorded state match what learners see.
-- See docs/content/supplemental-audit.md for the per-cell analysis.
--
-- SCOPE: modules.status only, for the 18 cell_ids listed below. The list is
-- explicit rather than a `status = 'in_review'` set-predicate so this does
-- exactly what was approved even against a CMS-drifted environment where some
-- other cell has since been moved back into review.
--
-- DELIBERATELY NOT TOUCHED:
--   * progress_reset_at — publishing is NOT a publish-with-reset here. Nothing
--     about these lessons changed, so no learner progress is invalidated.
--   * version / draft — public.modules has no triggers (verified), all matrix
--     `draft` columns are null, and the 1.4 reconcile precedent
--     (20260915000000) bumps neither. Nothing to carry.
--
-- KNOWN SIDE EFFECT: LocalTutorFAB excludes draft and in_review content from the
-- tutor's grounding (R7, src/components/LocalTutorFAB.grounding.test.ts:51).
-- Publishing these 18 cells makes their bodies and tutor references quotable by
-- the local tutor. That is the intended behaviour for signed-off content.
--
-- CAVEAT CARRIED FORWARD: 2.14 ("GLAT-style objective gate") is published here
-- as instructed, but its body and question bank still describe stage gating,
-- which was deleted in the cohort restructure — it tells learners a score "is
-- what opens the next stage". 2.13 and 2.15 carry the same dead "Stage 2"
-- vocabulary. Publishing removes the draft badge from that stale wording. The
-- framing fix is tracked in docs/content/supplemental-audit.md and is NOT part
-- of this migration.
--
-- Idempotent: the `status = 'in_review'` guard makes a second apply a no-op, and
-- a deliberate future move back into review is never silently re-published.

update public.modules
   set status     = 'published',
       updated_at = now()
 where origin = 'matrix'
   and status = 'in_review'
   and cell_id in (
     '1.2',  '1.3',  '1.12', '1.13',
     '2.1',  '2.2',  '2.3',  '2.4',  '2.5',  '2.6',
     '2.7',  '2.8',  '2.9',  '2.10', '2.11',
     '2.13', '2.14', '2.15'
   );

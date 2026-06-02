-- reconcile_stage_1b_provenance (DATA-01 fix)
--
-- The six Stage-1b cells (1.1, 1.2, 1.7, 1.8, 1.11, 1.12) were authored in
-- 20260602141611_stage_1b_content with status='in_review' and version bumped to
-- 2. The later, GENERATED 20260602190000_load_curriculum_content then overwrote
-- their body_md + quiz_json with the canonical published curriculum (for ALL 28
-- cells) WITHOUT touching status/version. That left these six rows displaying
-- the published 190000 content while still flagged status='in_review' at
-- version 2 — inconsistent with the other 22 cells (status='published',
-- version 1), and an inaccurate provenance marker.
--
-- This normalizes the six cells to match their siblings, so the queryable
-- status/version reflects the content that actually reaches runtime. The
-- runtime ignores status, so there is no behavior change — only data hygiene.
--
-- Idempotent: a plain UPDATE-by-cell_id, safe to re-run on `supabase db reset`.
update public.modules
   set status = 'published',
       version = 1
 where cell_id in ('1.1', '1.2', '1.7', '1.8', '1.11', '1.12');

-- W2-5 / audit D-24: restore cell 1.12's intentional provenance marker.
--
-- 20260602240000_seed_exercises_1_12_1_13.sql seeded DRAFT harm-rubric /
-- signoff configs for 1.12 and 1.13 with status='in_review', version=2 —
-- the "this content has not been SME-reviewed" bookmark every other lab-config
-- seed sets. The later 20260602260000_reconcile_stage_1b_provenance.sql was
-- written against the pre-240000 state and reset 1.12 (among the six Stage-1b
-- cells) back to published/version 1, silently clearing that marker — leaving
-- 1.12 published while its same-vintage sibling 1.13 stayed in_review.
--
-- This restores 1.12 to in_review/version 2, matching 1.13 and the intent of
-- 240000. The runtime ignores status (audit D-08), so there is no behavior
-- change — only truthful review-state bookkeeping for the SME pass (W3-1).
--
-- Idempotent: the guard only matches the exact clobbered state. A second apply
-- is a no-op, and a deliberate future SME publish (which will bump version
-- and/or set status='published' at version >= 2) is never overwritten.
update public.modules
   set status = 'in_review',
       version = 2,
       updated_at = now()
 where cell_id = '1.12'
   and lab_config_json is not null
   and status = 'published'
   and version = 1;

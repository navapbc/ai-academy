-- renumber_matrix_sort_order — put "Supplemental coursework" in cell-number order.
--
-- SYMPTOM: the section listed 1.3, 1.4, 1.5, 1.6, 1.9, 1.10, 1.13 and only then
-- 1.1, 1.2, 1.7, 1.8, 1.11, 1.12 before section 2.
--
-- CAUSE (not a string-sort bug): the section renders in `modules.sort_order`
-- ascending, straight from the fetch (src/lib/modules.ts:340) with no
-- client-side re-sort, and sort_order still encoded the ORIGINAL AUTHORING
-- SEQUENCE. The Stage-1a cells were seeded first and took 1–7; the six Stage-1b
-- cells (1.1, 1.2, 1.7, 1.8, 1.11, 1.12 — see 20260602141611_stage_1b_content.sql)
-- were seeded afterwards and took 8–13. Within each of those blocks the order
-- was already numerically correct — 1.10 correctly followed 1.9, and 2.10
-- correctly follows 2.9 — which is why this is not a 1-digit/2-digit
-- lexicographic problem. Stage grouping was deleted in the cohort restructure,
-- so the sequence it left behind no longer means anything to a learner.
--
-- FIX: renumber the thirteen 1.x cells to 1–13 in cell-number order. Section 2
-- already holds 14–28 in the right order and is deliberately left untouched, so
-- the whole section reads 1.1 … 1.13, 2.1 … 2.15.
--
-- KNOCK-ON (intended): sort_order is also the order of the My Progress module
-- table (learnerDetail.ts:257) and the ModulePager completion cursor, so those
-- pick up the same corrected sequence.
--
-- Not a content change: no body, quiz, lab or status is touched, and ordering is
-- not part of any completion record. The CMS may still permute sort_order later
-- (adminCourses.ts); this only fixes the seeded baseline.
--
-- Re-runnable: a second apply writes the same numbers.

update public.modules as m
   set sort_order = v.ord,
       updated_at = now()
  from (values
    ('1.1', 1), ('1.2', 2), ('1.3', 3), ('1.4', 4), ('1.5', 5),
    ('1.6', 6), ('1.7', 7), ('1.8', 8), ('1.9', 9), ('1.10', 10),
    ('1.11', 11), ('1.12', 12), ('1.13', 13)
  ) as v(cell_id, ord)
 where m.cell_id = v.cell_id
   and m.origin = 'matrix'
   and m.sort_order is distinct from v.ord;

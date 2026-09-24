# Supplemental coursework — outdated / no-longer-needed audit

_Generated 2026-09-24 from the local Supabase database at migration `20260923000000`
(64/64 migrations applied, matching the repo). Analysis only — no rows or migrations changed._

## Status — actioned 2026-09-24

Two items from this audit have been implemented (local migrations, not yet committed or deployed):

- **All 18 `in_review` cells published** — `supabase/migrations/20260924000000_publish_supplemental_matrix_cells.sql`.
  All 28 matrix cells are now `published`; no cell in the section carries the draft badge.
- **1.10 re-tensed** — `supabase/migrations/20260924010000_reconcile_1_10_regulatory_floor.sql`
  plus the matching `curriculum-content.json` edit. The stale wording was in **three** fields
  (`body_md`, `quiz_json`, `lab_config_json`), not just the body.

**New finding while verifying 1.10 — needs an L&D decision.** Article 4 was not merely enforced
on schedule; it was **rewritten**. The Digital Omnibus, Regulation (EU) 2026/1744, entered into
force 27 July 2026 and changed the AI-literacy duty from *ensuring* "a sufficient level" of AI
literacy (an obligation of result) to *taking measures to support its development* (an obligation
of effort). 1.10 never characterised the duty either way, so **nothing it says is contradicted**
and the re-tensing fix stands on its own. But a lesson called "Regulatory floor awareness" that
names Article 4 arguably should reflect the current text. Adding that is a content judgement, so
it was deliberately left out. See the `NOT IN SCOPE` note in the reconcile migration.

**Follow-on (2026-09-24): "Your Training" now counts course lessons only.** The publish above
exposed that the completion headline treated Resources as training. `isTrainingModule` in
`src/lib/modules.ts` is now the single allow-list predicate (`origin === 'course'`) used by
App.tsx's headline, the Sidebar count and the My Progress card, so supplemental coursework and
resources are both excluded. The learner denominator is 13.

`fetchLearnerDetail` also gained a missing `.is('archived_at', null)`: retired lessons are
archived rather than hard-deleted, so all three were still counted, capping the My Progress
"Completion" card at 13/16 with no way to reach 100%. That fetch is shared, so the **staff
learner-detail table now hides archived lessons too** (and any historical completions of them).

`learner_progress_summary.completion_pct` is **unchanged** — it still divides by
`published_modules_total()` (now 46, counting matrix + custom), per the U13 "staff denominator
semantics differ by design" invariant. Aligning it would need a migration and would change the
evidence export, so it is an open question.

**Stage vocabulary retired (2026-09-24)** — `20260924030000_retire_stage_vocabulary.sql` plus the
matching `curriculum-content.json` edits. 1.11, 2.13 and 2.15 lost their stray "Stage" references.
2.14 was retitled "GLAT-style objective self-check", its body rewritten, and three "Stage 2"
references cleared from the GLAT question bank. Per the product decision, it now states plainly
that the check opens nothing, that supplemental coursework is optional and not required for
course completion, and that the score is the learner's own calibration signal. **The instrument
is unchanged** — sectionA (5) / sectionBC (35) items and `passThreshold` 0.8 are untouched, so
`glat_passed` keeps its meaning on the learner dashboard, staff learner detail and evidence export.
No matrix cell now contains stage-gating language.

**Still open:**

- **Merge candidates 1.1, 1.6, 2.5** — real redundancy with Week 0/Week 1 and the
  `custom-how-claude-works-tokens` resource, but which copy survives is an L&D editorial call.
- **1.10 and the Digital Omnibus** — whether to reflect Article 4's rewrite (see above).
- **Staff `completion_pct`** — `learner_progress_summary` still divides by all 46 published
  modules while the learner-facing headline counts 13 course lessons. Given the decision that
  supplemental work is not required for course completion, aligning the staff denominator is now
  the most defensible option; it needs a migration and would change the evidence export.
- **The "GLAT" stat card** — now that the check is explicitly a self-check, consider whether a
  pass/fail card belongs on the *staff* learner-detail view and in the evidence export, or
  whether it should be learner-facing only.

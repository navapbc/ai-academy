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

- ~~**Merge candidates 1.1 and 2.5**~~ — **done 2026-09-24**,
  `20260924060000_dedupe_llm_mechanics.sql`. The token/context-window explanation now has one
  home each: 1.1 owns the mechanics (next-token prediction, what a token is), 2.5 owns managing
  the window, and each points at the other instead of restating it. The Resources lesson is
  unchanged — it must stand alone for Week 1 learners who never open the supplemental section,
  so its overlap is deliberate. 2.5 was **not** gutted: only its opening definition was
  duplicated; the failure modes, tactics and worked example appear nowhere else. Also repaired
  seed/DB drift on 1.1 and 1.3 (unshipped plain-language edits) and dropped a mis-citation in
  1.1. All 28 matrix bodies now match the seed JSON byte for byte.
- ~~**1.6 Setup and access**~~ — **done 2026-09-24**, `20260924070000_fix_1_6_mfa_step.sql`.
  Reclassified first: *not* a merge candidate. It is the vendor-neutral "why" to
  `c1-w0-claude-setup`'s Claude-specific "how", which is a defensible pair. The real defect was
  accuracy — the checklist said "Turn on MFA and confirm it actually prompts you on next login",
  a setting that does not exist at Nava, where sign-in is Google SSO and multi-factor lives at
  the identity provider (Week 0 never mentions MFA for that reason). Replaced across all four
  places it appeared (three in the body, one quiz option) with the failure mode Week 0 actually
  warns about: taking the wrong sign-in path and landing in a personal workspace that looks
  identical to the org one.
- **1.10 and the Digital Omnibus** — whether to reflect Article 4's rewrite (see above).
- ~~**Staff `completion_pct`**~~ — **done 2026-09-24**,
  `20260924040000_training_only_completion_denominator.sql`. New
  `training_modules_total()` (course-origin, published, not archived) replaces
  `published_modules_total()` in `learner_progress_summary`, and the numerator is scoped to
  match so supplemental completions can't push a learner past 100%. Staff denominator 46 → 13.
  `cohort_progress_summary` / `cohort_score_distribution` inherit it. `published_modules_total()`
  is untouched — its RPC contract is asserted by `enrollmentVisibility.integration.test.ts`.
  Evidence-export **output** is unaffected: `evidenceExport.ts` selects `completion_pct` but
  never emits it.
- ~~**The "GLAT" stat card**~~ — **done 2026-09-24**, `20260924050000_drop_staff_glat_signal.sql`.
  The GLAT is learner-facing only now. Removed the per-learner "GLAT" card from staff
  LearnerDetail and the "GLAT pass rate" card from the Cohort Dashboard, and dropped
  `glat_passed` / `glat_pass_rate` from `learner_progress_summary` / `cohort_progress_summary`
  (DROP + recreate, since `create or replace view` cannot remove a column; `security_invoker` and
  grants re-stated and verified). The learner keeps their own GLAT card — it is computed
  client-side in `summarizeOwnProgress` from their own attempts, not from these views. The
  instrument, its `passThreshold` and the `quiz_attempts` history are untouched, so the decision
  is reversible.

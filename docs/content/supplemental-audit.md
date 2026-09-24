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

**Still open:** the 2.14 framing rewrite, the 1.11 / 2.13 / 2.15 "Stage" wording, and the three
merge candidates (1.1, 1.6, 2.5). Publishing removed the draft badge from that stale wording, so
the 2.14 rewrite is now the most visible remaining item.

---

## Scope

"Supplemental coursework" is defined in `src/lib/modules.ts:43-54` as matrix-origin modules not
assigned to any visible course week. Confirmed by query: **all 28 matrix cells (1.1–1.13,
2.1–2.15) are unassigned** — every row in `course_week_modules` is a `c1-*` course lesson
(`supabase/migrations/20260715040000_seed_course1_content.sql:1568-1586`). So the supplemental
section *is* the whole matrix.

All 28 are `visibility = 'public'` and none are archived — every one is live to learners today.

## Headline findings

**1. 18 of 28 cells (64%) sit in `in_review`, and learners see them anyway.** Matrix cells
bypass the published-only filter by design — `src/lib/modules.ts:337` keeps every matrix row
regardless of status, showing a "draft — under review" badge instead of hiding the lesson.
(*Inferred from seed dates:* most have been in this state since the early-June content load.) The only formal L&D review
covered **zero** matrix cells — "Every comment and tracked change lands inside Course 1 … Zero
land on the 28 matrix cells" (`docs/content/content-review-plan.md:14-16`). So this is not
content that was reviewed and held back; it is content that was never reviewed and shipped
half-labelled. This is the biggest single decision in the section, and it is an editorial call,
not a code problem.

**2. 2.14's *framing* is dead, but the instrument is load-bearing — rewrite it, don't retire
it.** The body is built on stage gating, deleted in the cohort restructure (`CLAUDE.md`:
"stage gating was deleted"), and on quizzes gating progress, which they no longer do ("Quizzes
never gate completion"). It still tells learners the score "is what opens the next stage" and
frames itself as "the Stage 2 to Stage 3 step". That vocabulary runs into the GLAT question
bank as well as the body.

But the objective check itself still runs and is still reported in three places, so retiring
2.14 would break live surfaces: `glat_passed` reads `quiz_attempts` for `module_id = '2.14'`
(`supabase/migrations/20260715010000_enrollment_visibility.sql:132-136`) and surfaces on the
**learner's own dashboard** (`src/components/LearnerDashboard.tsx:199`), the **staff learner
detail** view (`src/components/staff/LearnerDetail.tsx:64`), and the **evidence export**
(`src/lib/evidenceExport.test.ts`). Correct verdict: strip the Stage/gate language from the body
and question bank, keep the assessment.

**3. 1.10 uses future tense for a date that has passed.** It tells learners the team treats
the EU AI Act Article 4 duty as live "ahead of August 2026 enforcement", and that "enforcement
powers begin 2 August 2026" — written as upcoming, but that date was seven weeks ago. The
wording needs re-tensing, and someone should re-verify the actual current Article 4 enforcement
status before rewriting rather than assuming it began on schedule.

**4. 1.3 and 1.12 are the in-Academy home for two topics whose course lessons were retired —
but the topics are still covered.** I initially read these as sole-surviving coverage; that is
wrong. The retirement rationales say otherwise, and the coverage checks confirm it:

- `c1-w2-delegation-sort` was archived because it is "run live by the Champion with the whole
  group; neither is worked through in the Academy"
  (`supabase/migrations/20260806010000_retire_lookup_and_delegation_sorts.sql:7-8`). Delegation
  still appears in five live lessons (`c1-w2-ground-and-scope`, `c1-w34-pod-kickoff`, both
  `walk-the-workflow-*`, `c1-w67-pod-meeting-2`).
- `c1-w5-pattern-spotting` was archived because "the four-failure-shape practice is covered
  elsewhere in the program"
  (`supabase/migrations/20260902010000_retire_week5_pattern_spotting.sql:5-6`) — namely both
  `c1-w67-find-the-failure-*` lessons and `c1-w67-pod-meeting-1`. This retirement was 09-02 and
  is *not* attributable to Sarah's 08-03 review, which only covered the other two.

So 1.3 and 1.12 are ordinary promote-candidates, not urgent. Their remaining value is as the
**self-serve written version** of practices that now exist only as facilitator-led live
activities — worth keeping for anyone not in a cohort, but not a gap.

**5. Nothing in the section is technically broken.** All 22 distinct lab kinds used by matrix
cells have a live renderer in `src/components/ModuleRenderer.tsx`. Separately checked 1.3, the
one `type = sorter` cell with no lab kind: its `sorter_config_json` is populated with a
`scenarios` array and `ModuleRenderer.tsx:134` renders it. No dead exercise types, no orphaned
configs.

## Per-cell verdicts

Verified = read from the DB body or a cited file. Inferred = my editorial judgement.

| Cell | Status | Verdict | Reason |
|---|---|---|---|
| 1.1 Mechanical mental model | published | **Merge / trim** | Triplicated: next-token predictor, "1.5 tokens per word", context window all also in `custom-how-claude-works-tokens` and the W1 experiments *(verified — near-identical framing and the same IBM citation)* |
| 1.2 Hallucination structural | in_review | Keep, promote | Overlaps W1 confidently-wrong but goes deeper; cites 2025 Stack Overflow survey, now one edition stale *(inferred)* |
| 1.3 AI-appropriate vs human judgement | in_review | Keep, promote | Self-serve counterpart to a now-facilitator-only activity; topic still covered in 5 live lessons *(verified)*. Sorter renders correctly *(verified)* |
| 1.4 Data classification | published | **Keep — current** | Reconciled to Week 5's corrected rules on 09-15 *(verified: `20260915000000`, `20260915010000`)* |
| 1.5 Approved-tool literacy | published | Keep | OMB M-25-21/22 citations still accurate *(verified)* |
| 1.6 Setup and access | published | **Merge candidate** | Conceptually duplicates `c1-w0-claude-setup`; its "turn on MFA" step is moot under Nava's Google SSO *(inferred)* |
| 1.7 Bias / fairness / accessibility | published | Keep | Citations current incl. M-26-04 *(verified)* |
| 1.8 Energy / environment / sovereignty | published | Keep | *(no issues found)* |
| 1.9 Disclosure norms | published | Keep | *(no issues found)* |
| 1.10 Regulatory floor | published | **Update — future tense, past date** | Says the duty is live "ahead of August 2026 enforcement"; that date has passed, so re-verify current Article 4 status and re-tense *(verified the wording; status needs checking)* |
| 1.11 Job-shape change | published | **Update — dead vocabulary** | Body refers to "Stage 2 experimentation"; stages no longer exist *(verified)* |
| 1.12 Civic-tech harm patterns | in_review | Keep, promote | Self-serve counterpart to retired `c1-w5-pattern-spotting`; four-failure-shape practice still covered in W6–7 *(verified)* |
| 1.13 Non-practitioner literacy | in_review | Keep, promote | *(no issues found)* |
| 2.1 Prompt construction | in_review | Keep, promote | *(no issues found)* |
| 2.2 Output validation | in_review | Keep, promote | *(no issues found)* |
| 2.3 Polished-output trap | in_review | Keep, promote | *(no issues found)* |
| 2.4 Iteration | in_review | Keep, promote | *(no issues found)* |
| 2.5 Context window | in_review | **Merge / trim** | Overlaps `custom-how-claude-works-tokens` on the core explanation; the lab is the part worth keeping *(verified)* |
| 2.6 AI for writing | in_review | Keep, promote | *(no issues found)* |
| 2.7 AI for synthesis | in_review | Keep, promote | *(no issues found)* |
| 2.8 Calibrated trust | in_review | Keep, promote | *(no issues found)* |
| 2.9 Failure modes | in_review | Keep | Overlaps W6–7 find-the-failure but is the reusable/general version *(inferred)* |
| 2.10 Test-driven prompting | in_review | Keep, promote | *(no issues found)* |
| 2.11 Use-case library + Diligence Statement | in_review | Keep, verify | Only cell referencing the Diligence Statement; confirm that artifact is still expected of learners *(verified it is unique; the expectation is a product question)* |
| 2.12 Switching tools/models/modes | published | Keep, verify | Most likely to drift as the Claude surface changes (cf. the Cowork-merged-into-chat correction) *(inferred)* |
| 2.13 Metric / productivity illusions | in_review | Keep, light edit | "the whole point of this stage" — dead vocabulary *(verified)* |
| 2.14 GLAT objective gate | in_review | **Rewrite framing — do not retire** | Stage/gate premise dead in body + question bank, but the instrument feeds learner dashboard, staff detail and evidence export *(verified)* |
| 2.15 Paired AI-on / AI-off calibration | in_review | Keep, light edit | "Stage 2 taught you to question" — dead vocabulary *(verified)* |

## Summary counts

- **Rewrite framing: 1** — 2.14 (keep the instrument; strip Stage/gate language)
- **Factual/vocabulary fixes: 4** — 1.10 (expired date), 1.11, 2.13, 2.15 (dead "Stage" wording)
- **Merge/trim for redundancy: 3** — 1.1, 1.6, 2.5
- **Promote out of draft: 18** — a single editorial decision, none individually urgent
- **No change needed: the rest**

## Caveats

- This reflects **repo + migration state**. Staff can edit content and week assignments through
  the admin CMS, so production may differ. A CMS drift audit is already an open item
  (`docs/content/content-review-plan.md`).
- "Outdated" here means contradicted, expired, or premised on something deleted. Cells marked
  "no issues found" were checked for dead premises, stale dates and redundancy — not
  re-reviewed for pedagogical quality. No L&D review has ever covered these 28 cells.
- **Write path for matrix cells is not the course-content generator.** `generate-content-reconcile.mjs`
  generates from `course1-content.json` and only covers `c1-*` lessons. Matrix cells live in
  `curriculum-content.json`, loaded by `20260602190000_load_curriculum_content.sql`, and the
  precedent for changing a shipped one is a **hand-written** reconcile migration — the
  `20260915000000_reconcile_1_4_*` pair contains no "GENERATED by" header. Editing
  `curriculum-content.json` alone is a silent no-op against any already-seeded database, so every
  content fix here needs a paired UPDATE migration. Retirement, if any, follows the `archived_at`
  pattern in `20260806010000` / `20260902010000`.

# Week 2: Resources (connectors + Projects) + Ground/Scope copy tighten

**Date:** 2026-07-17
**Branch:** `feat/week2-resources-and-groundscope` (stacked off `feat/week1-resources-and-sorter`)
**Status:** Approved design, pending implementation plan

## Problem

Reviewing the Week 2 live-session run-of-show ("The basics of working with an
LLM") against the built AI Academy content surfaced three items; two need repo
changes:

1. **Two "AI Academy" resource pointers don't resolve.** The speaker notes send
   learners to the AI Academy for (a) *how connectors work* to ground Claude
   against connected spaces — Confluence, Slack, Google Drive (Slide 7), and
   (b) *Claude's Projects feature* for reusing sources/scoping across chats
   (Slide 8). A keyword scan of all Course 1 content returns `confluence` = 0,
   `google drive` = 0, `projects feature` = 0, and `connector` only inside an
   unrelated Weeks 3–4 activity. Neither resource exists.

2. **The "Ground & Scope for Improvement" activity over-promises.** The seeded
   `chat-compare` (`c1-w2-ground-and-scope`) demonstrates **grounding** only
   (same prompt in both panes; the second pane is given source material), but
   its `body_md` frames it as testing "foundational prompting strategies"
   (plural, implying ground *and* scope). `chat-compare` shares ONE learner
   prompt across all panes (verified in `src/types.ts` — panes vary only by
   `systemPromptMd` and `sourceMd`), so a true grounded+scoped "prompt pair" is
   not expressible without a component change. Decision (made): keep the
   source-toggle design (it isolates grounding cleanly) and tighten the copy so
   it honestly presents the grounding experience, with scoping covered in the
   live teach and the new Projects resource.

3. **Delegation-sort scenario mismatch (deck vs academy).** Out of scope for the
   repo: decision (made) is to keep the academy's current six scenarios and
   reword the deck's Slide-4 key to match (deck-side, owner: user). No academy
   change.

## Constraints

- **Content-as-data pipeline (unchanged).** Source of truth is
  `supabase/seed-data/course1-content.json`; the migration
  `supabase/migrations/20260715040000_seed_course1_content.sql` is **generated**
  by `scripts/generate-course1-seed.mjs` and must never be hand-edited.
- **Generator schema.** `origin: custom` requires `week: null` /
  `week_sort_order: null`; `visibility ∈ {public, program}`;
  `type ∈ {content, lab, ...}`; `evidence_type` from the allow-list
  (`reflection`); `dimension` may be `[]`; non-empty `title`/`body_md`; integer
  `sort_order`; unique `cell_id`. `body_md` may not contain the literal `$md$`.
- **Pre-reveal rule** forbids the token `LLM` only in `week0`/`week1` modules.
  The new resources are `week: null`; the edited activity is `week2`. Neither is
  pre-reveal, so `LLM`/token language is allowed. (No hard requirement to use it.)
- Node 22 for `npm test`/`lint`. Base off `feat/week1-resources-and-sorter`
  (this work stacks on the Week 1 resources + sorter), not `main`.
- Current custom resources occupy `sort_order` 950/951/952; new ones take
  **953** and **954**.

## Design

### 1. Two new resource lessons

Both `origin: custom`, `visibility: public`, `type: content`,
`evidence_type: reflection`, `dimension: []`, `week: null`,
`week_sort_order: null`, `lab_config_json: null` — matching the existing custom
resources. They render in "Resources & additional lessons".

#### Resource C — `custom-grounding-with-connectors` — "Grounding with connectors"

`sort_order: 953`. Body sections:

- **Grounding, in one line** — brief recap: giving Claude curated source
  material to predict from lowers the odds of a confident wrong answer.
- **What connectors do** — instead of pasting everything in, connectors let
  Claude pull from connected spaces (Confluence, Slack, Google Drive) you've
  granted access to; on Nava's Claude, these are available to ground against
  real content.
- **Choosing good sources** — safe to share, accurate, and narrow enough to keep
  the prediction on target; pointing Claude at "everything" defeats the purpose.
- **Retrieval isn't fact-checking** (the deck's watch-for) — connectors ground
  the prediction; Claude can still misread or cherry-pick a source, and the
  source itself can be wrong. Still verify. Cross-links **Controlling what
  Claude can do: tools & permissions** (approve/auto tool use) by name.

#### Resource D — `custom-reusing-context-claude-projects` — "Reusing context: Claude Projects"

`sort_order: 954`. Body sections:

- **What a Project is** — a saved workspace that keeps instructions and source
  files attached, so every chat you start inside it already has your context.
- **When to use one** — recurring tasks, or when the same grounding and scoping
  apply across many chats.
- **Grounding + scoping, saved once** — put your curated sources (grounding) and
  standing instructions (scoping) in the Project; new chats inherit them.
- **Still start fresh chats per task** — a Project doesn't remove the
  context-window habit; open a new chat inside it at each logical breakpoint.
  Cross-links **How Claude works: tokens & context windows** by name.

### 2. Ground & Scope activity — copy tighten (`c1-w2-ground-and-scope`)

Edit `body_md` and (lightly) `reflectionMd` only. Do NOT change `kind`, `title`,
`subtitle`, `panes`, `sourceMd`, `suggestedPrompts`, or the source-material
block.

- `body_md`: change the framing sentence from testing "foundational prompting
  strategies" to specifically the **grounding** habit, and add one sentence that
  scoping is the companion habit covered in the live session, cross-linking the
  Projects resource. Exact new second paragraph:

  > This activity is about the first habit — **grounding**. You'll run the same
  > task two ways and compare the answers: the two Claude chats below get the
  > **same prompt**, but only the second one is given the source material shown
  > here. (Scoping, the companion habit, comes up in the live session — and the
  > *Reusing context: Claude Projects* resource shows how to save grounding and
  > scoping together.)

  Keep the first paragraph ("Part of the Week 2 live session…") and the
  `## Source material` block unchanged.

- `reflectionMd`: append one watch-for line so learners don't over-read a good
  grounded answer: "Grounding lowers the odds of a wrong answer — it doesn't
  remove the need to verify. A grounded answer is still an unverified answer
  until you check it against the source." Keep the three existing reflection
  questions and the closing line.

### 3. Delegation sort — no change

Academy keeps its six scenarios (`c1-w2-delegation-sort` untouched).

## Out of scope (owner: user, in Google Slides)

- Reword deck Slide 6 ("prompt pairs / enter one in each chat") to the grounding
  source-toggle framing.
- Reword deck Slide 4's seven-item key to the academy's six scenarios.
- (Carried from Week 1) the "~500,000 words" figure and the "deterministic
  tools = skills/harnesses/hooks/agents" phrasing.

## Data flow

1. Edit `course1-content.json`: add two `custom` modules (953, 954); edit
   `c1-w2-ground-and-scope` `body_md` + `reflectionMd`.
2. `node scripts/generate-course1-seed.mjs` → regenerates the migration.
   Expected: `17 modules (12 week-assigned).` (15 → 17; the two new resources are
   unassigned, so week-assigned stays 12.)
3. `npm run lint && npm test` (Node 22).
4. Optional: `npx supabase db reset` applies cleanly (idempotent).

## Testing

- **Generator validation** is the first gate (bad schema throws before SQL).
- **No existing test asserts these bodies.** The two new resources are
  `week: null` → absent from `course_week_modules`, so
  `courseStructure.integration.test.ts` (membership by `cell_id`, DB-gated) is
  unaffected. The Ground & Scope edit changes only `body_md`/`reflectionMd` of an
  existing module; its `cell_id` and membership are unchanged. No test edits
  needed.
- **Migration re-run** must apply cleanly (`ON CONFLICT DO NOTHING`).
- No new exercise kind (reuse `content`), so no renderer/type/component changes.

## Success criteria

- Two public resources appear in "Resources & additional lessons" covering
  connectors and Claude Projects — resolving the Slide 7 and Slide 8 pointers.
- The Ground & Scope activity honestly frames itself as a grounding contrast and
  cross-links the Projects resource; the reflection carries the verify watch-for.
- Delegation sort unchanged. Generator clean; `lint` + `test` green; migration
  re-applies idempotently.

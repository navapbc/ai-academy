# Design — Week 1 "Lookup vs. Predict" sort (`prediction-sort`)

- **Date:** 2026-07-16
- **Branch:** `feat/course1-week1-live` (off `feat/cohort-program-restructure`)
- **Scope:** One new exercise kind + one seeded Week 1 module. Completes the Week 1
  live-session activity set from the Course 1 program outline.
- **Skill mapped:** 1.01 (an LLM is a next-token predictor; "knowing" is statistical
  pattern completion, not lookup).

## Problem

Week 1 of Course 1 ("What are we actually working with?") already ships two
`chat-compare` experiments — *Experiment 1: Same Prompt, Different Answers* and
*Experiment 2: Being Confidently Wrong* — the "Break Claude on Purpose" hook. The
program outline's **second** Week 1 activity, the **"Lookup vs. predict" sort**, is
not yet built. It is the activity that surfaces the core 1.01 misconception: people
assume the model *retrieves* facts, when it only ever *predicts* the next token.

## Pedagogical framing (decided in brainstorming): intuition-then-reveal

A literal two-bucket sort where some items are "genuinely lookup" would *reinforce*
the misconception. Instead:

1. The learner sorts each task by what it **feels like** — *"Feels like looking it
   up"* vs *"Feels like making it up."* There is **no wrong answer** at this stage.
2. On submit, **every** item flips to the **same** reveal: *"This was Claude
   predicting the next word — it never looked anything up,"* plus a one-line,
   item-specific note on why it felt like one or the other.
3. The gap between the learner's split and the uniform reveal **is** the lesson.

The reveal copy stays light and hands the deep "why" to the Champion's live debrief,
consistent with how the two experiments already defer mechanism to the live session.

### Pre-reveal copy constraint

Week 1 is a `PRE_REVEAL` week in `scripts/generate-course1-seed.mjs`: all copy must
say **"Claude"** and **never** the token **"LLM"** (the generator throws on
`\bLLMs?\b`). Reveal/takeaway text uses "Claude predicts the next word" — allowed;
"LLM" — forbidden.

## Architecture

Additive only, following the exact pattern used to add `chat-compare` (U6) and
`decision-scenario` (U7) on the base branch. No existing kind, component, or seed row
is modified.

### 1. Types — `src/types.ts`

New union member added to `LabConfig`:

```ts
export interface PredictionSortItem {
  id: string;
  /** The task/prompt shown on the card. */
  prompt: string;
  /** One-line note revealed after submit; every note reaffirms prediction-not-lookup. */
  reveal: string;
}

export interface PredictionSortConfig {
  kind: 'prediction-sort';
  introMd: string;
  /** The two drop-target labels shown to the learner. */
  bucketLabels: { lookup: string; predict: string };
  items: PredictionSortItem[];
  /** The uniform payoff card shown after submit. */
  takeaway: { title: string; body: string };
}
```

There is deliberately **no** `correct` field: placement is never graded. The
learner's placements are still persisted in the submission transcript for cohort
insight, but they do not produce a score.

### 2. Component — `src/components/exercises/PredictionSort.tsx`

Mirrors `ScenarioExercise.tsx` / `ChatCompare.tsx` conventions:

- Renders `introMd`, then each item as a card.
- **Placement uses two labelled buttons** per card (one per bucket), *not*
  drag-and-drop. Rationale: the repo enforces `jsx-a11y` at **error** level plus an
  axe test (P6.4); two radio-style buttons are keyboard-accessible with no custom DnD
  a11y work. This is still a two-bucket sort in substance.
- Buttons use the `role="radio"` / `aria-checked` pattern already established in
  `ScenarioExercise.tsx`.
- Submit is disabled until **every** item is placed (guards the async-save window per
  DATA-04, same as `ScenarioExercise`).
- On submit: `recordLabSubmission(user.id, { labId, transcript: { placements, items },
  status: 'submitted' })`. Uses `useAuth`; surfaces a `saveError` (with the "sign in
  to record" path) exactly like the sibling exercises.
- After submit: every card flips to show its `reveal` note under a shared banner
  ("This was Claude predicting the next word — it never looked anything up"), then the
  `takeaway` card renders (styled like `ScenarioExercise`'s keepable takeaway).
- **No score is shown** (intuition has no right answer).
- "Try again" resets placements and the graded state.
- **No `onComplete` prop.** Completion happens through the participation seam: the
  recorded submission auto-completes the module (`via='lab'`), identical to
  `chat-compare` / `decision-scenario`.

### 3. Dispatch — `src/components/ModuleRenderer.tsx`

One new case in `renderExercise()` (the `module.labConfig?.kind` switch):

```ts
case 'prediction-sort':
  return <PredictionSort config={module.labConfig} labId={module.cellId} />;
```

### 4. Seed content — `supabase/seed-data/course1-content.json`

One new object appended to `modules` (source of truth; the SQL migration is
generated, never hand-edited):

| Field | Value |
|---|---|
| `cell_id` | `c1-w1-lookup-vs-predict` |
| `week` / `week_sort_order` | `week1` / `2` (after the two experiments at 0, 1) |
| `origin` / `visibility` | `course` / `program` |
| `title` | `Lookup or Predict?` |
| `type` | `lab` |
| `dimension` | `["Discernment"]` |
| `evidence_type` | `performance-task` |
| `sort_order` | `903` |
| `body_md` | Framing: part of the Week 1 live session, run after the experiments. |
| `lab_config_json` | a `prediction-sort` config (below) |

`bucketLabels`: `{ lookup: "Feels like looking it up", predict: "Feels like making it up" }`

Proposed 6 mixed, mostly-everyday items (final copy tunable during implementation):

| # | `prompt` | Feels like | `reveal` beat |
|---|---|---|---|
| 1 | "What's the capital of France?" | looking up | Claude predicted "Paris" because those words follow that question countless times in its training — same machinery as everything else here. |
| 2 | "Give me three ideas for a team offsite." | making up | Obviously generated on the spot — no "right" answer to retrieve. But #1 worked the same way. |
| 3 | "Summarize this paragraph I just pasted." | looking up | It's grounded in the text you gave it, yet it still predicts the summary word by word — it isn't copying sentences out. |
| 4 | "Who won the 2043 World Cup?" | looking up | There's nothing to look up — Claude predicts a plausible-sounding answer. That's how the confident wrong answers in Experiment 2 happen. |
| 5 | "What page of *To Kill a Mockingbird* is the trial on?" | looking up | Claude has no book to flip through; it predicts a page number that sounds right. |
| 6 | "Translate 'good morning' into Spanish." | looking up | Feels like a dictionary lookup, but Claude is predicting the tokens "buenos días" from patterns. |

`takeaway`:
- `title`: "The twist: it was all prediction"
- `body`: "You probably split these into 'looking it up' and 'making it up.' Here's
  the catch — Claude did the exact same thing for every one: it predicted the next
  word from patterns in its training. It never looked anything up. Some predictions
  land on the truth (common patterns); some drift into confident fiction (Experiment
  2). Your Champion will unpack why in the live debrief."

After editing the JSON, run `node scripts/generate-course1-seed.mjs` to regenerate
`supabase/migrations/20260715040000_seed_course1_content.sql`. The generator's
existing validation (type/evidence/dimension/dollar-quote/pre-reveal) covers the new
row with no generator changes; `lab_config_json` is opaque JSON to it.

### 5. Tests

- **`src/components/exercises/PredictionSort.test.tsx`** (jsdom docblock, following
  `ChatCompare.test.tsx` + `src/test/supabaseMock.ts`):
  - renders all items and both bucket labels;
  - submit is disabled until every item is placed;
  - after placing all + submit: the shared reveal banner, each item's `reveal` note,
    and the `takeaway` render; `recordLabSubmission` is called once with the
    placements;
  - "Try again" clears placements and hides the reveal;
  - the "sign in to record" path renders the `saveError` when unauthenticated.
- **Generator/seed**: `node scripts/generate-course1-seed.mjs` runs clean (validates
  the new row, including the pre-reveal "no LLM" rule).
- **Lint/build/test** on Node 22 (repo requires it): `npm run lint`, `npm test`.
- If `src/test/a11y.axe.test.tsx` enumerates exercise kinds, add `prediction-sort`.

### Verification not runnable headless

`npx supabase db reset` (applies the regenerated migration against a live local
stack) requires Docker + the Supabase stack and is **flagged as a manual step**, not
run in this branch's automated pass.

## Completion / gating

The module completes on **participation** (`via='lab'`, fired by the recorded
submission) — no quiz gate. This matches the two Week 1 experiments and the
restructure branch's U9 participation-completion model.

## Out of scope

- Weeks 5–8 content (1.04, 1.12, integrate).
- Course norms / 1.01 teaching slides (facilitator-led, live-session/slide-deck, not
  a platform module).
- Any change to the existing `ScenarioSorter` (delegate/assist) or the two
  experiments.
- Drag-and-drop interaction (rejected for accessibility; two-button placement instead).

# Design — Week 2 "Delegation task sort" (`delegation-sort`)

- **Date:** 2026-07-16
- **Branch:** `feat/course1-week2-live` (off `feat/course1-week1-live`, which is off
  `feat/cohort-program-restructure`)
- **Scope:** One new additive exercise kind + one seeded Week 2 module. Completes the
  Week 2 live-session activity set from the Course 1 program outline.
- **Skill mapped:** 1.03 (the pause-before-use question — is a task pattern-matching/
  synthesis where AI helps, or values/ethics/accountability where human judgment is
  required; classify tasks + give a rationale).

## Problem

Week 2 of Course 1 ("The basics of working with an LLM") already ships the
"Ground & Scope for Improvement" module (a `chat-compare`), which is the outline's
activity #2 (skill 1.02 — grounding/scoping/verifying against hallucination). The
outline's **first** Week 2 activity, the **Delegation task sort**, is not yet built:
learners categorize Nava-flavored scenarios as **Full-AI / AI-assisted / Human-only**
and debate a one-sentence rationale. That activity is this design.

## Pedagogical framing (decided in brainstorming): participation, suggested-answer

The existing `ScenarioSorter` (matrix cell 1.3) is mastery-gated — it blocks completion
until every scenario is categorized correctly. That conflicts with the cohort program's
participation-based, safe-to-fail model (the restructure deleted gating) and with the
outline's framing of this as a **debate**, not a pass/fail test. So the Week 2 sort
mirrors the Week 1 `prediction-sort` model:

1. The learner sorts each scenario into one of three category buckets.
2. On submit, each card reveals a **suggested** categorization + a one-sentence
   rationale, framed as *"a defensible call"* — reasonable people may sort gray-area
   cases (e.g. a 508 audit) differently, which is what the live debate is for.
3. Completion is by participation (the recorded submission), regardless of matches.
   **No score, no gate.**

The `suggested` value is authored guidance shown on reveal; it is never used to score,
gate, or mark the learner wrong.

## Architecture

Additive only, following the `prediction-sort` (Week 1) and `chat-compare` /
`decision-scenario` (restructure) pattern. No existing kind, component, or seed row is
modified. Deliberately a **separate kind from `prediction-sort`** (not a shared
generalized "card-sort"): `prediction-sort` is under review in an open PR (#113), and
merging the two now would couple the branches. If a third sort appears later,
generalizing is a reasonable future refactor.

### 1. Types — `src/types.ts`

New union member added to `LabConfig`:

```ts
export interface DelegationSortItem {
  id: string;
  /** The task/scenario shown on the card. */
  scenario: string;
  /** id of the categories[] entry this item is a defensible fit for — shown on
   *  reveal as guidance; NEVER used to score or gate. */
  suggested: string;
  /** One-sentence rationale revealed after submit. */
  rationale: string;
}

export interface DelegationSortConfig {
  kind: 'delegation-sort';
  introMd: string;
  /** The category buckets, in display order (3 for Week 2). */
  categories: { id: string; label: string; desc: string }[];
  items: DelegationSortItem[];
  /** The payoff card shown after submit. */
  takeaway: { title: string; body: string };
}
```

There is no `correct` field: placement is never graded. The learner's placements are
persisted in the submission transcript for cohort insight, not scored.

### 2. Component — `src/components/exercises/DelegationSort.tsx`

Mirrors `PredictionSort.tsx` / `ScenarioExercise.tsx` conventions:

- Renders `introMd`, a compact legend of the `categories` (label + desc), then each
  item as a card.
- **Placement uses N labelled buttons** per card (one per category), `role="radio"` /
  `aria-checked` inside a `role="radiogroup"` labelled by the scenario — keyboard
  accessible, no drag-and-drop (repo enforces `jsx-a11y` at error level + axe).
- Submit is disabled until every item is placed (guards the async-save window per
  DATA-04).
- On submit: `recordLabSubmission(user.id, { labId, transcript: { placements, items },
  status: 'submitted' })`. Uses `useAuth`; surfaces a `saveError` (with the "sign in to
  record" path) exactly like the sibling exercises.
- After submit: each card reveals **"A defensible call: {suggested label} —
  {rationale}"** under a shared banner explaining gray-area cases invite debate; then
  the `takeaway` card renders (styled like the sibling takeaway).
- **No score is shown.** "Try again" resets placements and graded state.
- **No `onComplete` prop.** Completion happens through the participation seam
  (`via='lab'`), identical to `prediction-sort` / `chat-compare` / `decision-scenario`.

### 3. Dispatch — `src/components/ModuleRenderer.tsx`

One new case in `renderExercise()`:

```ts
case 'delegation-sort':
  return <DelegationSort config={module.labConfig} labId={module.cellId} />;
```

### 4. Validators — client AND Deno (parity)

The PR #113 whole-branch review caught that a new kind must be registered on *both*
sides or the CMS rejects the seeded module and the seed-guard test silently skips it.
So register `delegation-sort` in both from the start:

- **Client** — `src/lib/labValidation.ts`: add to `LAB_KINDS`, `LAB_KIND_LABELS`
  ("Delegation sort"), and a `LAB_VALIDATORS['delegation-sort']` shape validator.
- **Deno** — `supabase/functions/admin-content/admin-content-core.ts`: add to
  `LAB_KINDS` and a matching `LAB_VALIDATORS['delegation-sort']` entry (mirror the
  client validator's shape and error strings).

Shape enforced by both validators:
- `introMd`: non-empty string.
- `categories`: non-empty array of `{ id, label, desc }` — `id`/`label` non-empty
  strings, `desc` a string.
- `items`: non-empty array of `{ id, scenario, suggested, rationale }` — `id`/
  `scenario`/`suggested`/`rationale` non-empty strings. (Referential integrity of
  `suggested` → a `categories[].id` is enforced in the seed content and asserted in a
  component/seed test, not in the generic validator, to keep the validator field-shape
  only — consistent with sibling validators.)
- `takeaway`: object with non-empty string `title` and `body`.

### 5. Seed content — `supabase/seed-data/course1-content.json`

One new object appended to `modules` (source of truth; SQL migration is generated,
never hand-edited):

| Field | Value |
|---|---|
| `cell_id` | `c1-w2-delegation-sort` |
| `week` / `week_sort_order` | `week2` / `1` (after "Ground & Scope" at 0) |
| `origin` / `visibility` | `course` / `program` |
| `title` | `Full-AI, Assisted, or Human-Only?` |
| `type` | `lab` |
| `dimension` | `["Delegation"]` |
| `evidence_type` | `performance-task` |
| `sort_order` | `921` |
| `body_md` | Framing: part of the Week 2 live session, run before "Ground & Scope". |
| `lab_config_json` | a `delegation-sort` config (below) |

`categories` (ids used by `suggested`):
- `{ id: "full-ai", label: "Full-AI", desc: "AI does it end-to-end — pattern-matching or synthesis, low-stakes, easy to verify." }`
- `{ id: "assisted", label: "AI-assisted", desc: "AI helps; a person directs, checks, and owns the result." }`
- `{ id: "human-only", label: "Human-only", desc: "A person must make and own the call (AI may help prep, never decide)." }`

Proposed 6 Nava-flavored items (2 per category; final copy tunable in implementation):

| # | `scenario` | `suggested` | `rationale` |
|---|---|---|---|
| 1 | "Draft a benefits-eligibility denial letter for a caseworker to review before it goes out." | assisted | AI can draft the language, but a person must verify the determination and own what's sent. |
| 2 | "Reformat the findings from a 508 accessibility audit into a summary table." | full-ai | Mechanical restructuring of existing content — low-stakes and easy to check. |
| 3 | "Write a performance improvement plan (PIP) for a teammate who's struggling." | human-only | Accountability and values — a manager must make and own this call. |
| 4 | "Write a condolence note to a colleague who just lost a family member." | human-only | A human relationship; sincerity can't be delegated. |
| 5 | "Summarize 40 pages of public comments on a proposed policy into the main themes." | full-ai | Pattern-matching and synthesis over public text — exactly where AI speeds things up. |
| 6 | "Decide which of three vendors should be awarded a contract." | human-only | A high-stakes, accountable decision; AI may help compare, never decide. |

`takeaway`:
- `title`: "The question to ask first: who owns the call?"
- `body`: "Before reaching for AI, ask what kind of task this is. Pattern-matching and
  synthesis (summarizing, reformatting, drafting) are where AI multiplies your speed.
  Anything carrying values, ethics, or accountability stays human-owned — AI can help
  you prepare, but a person makes and owns the decision. The gray-area cases are worth
  arguing about; that's the point of today's discussion."

After editing the JSON, run `node scripts/generate-course1-seed.mjs` to regenerate
`supabase/migrations/20260715040000_seed_course1_content.sql`. Week 2 is **not** a
pre-reveal week (the "Claude, never LLM" rule applies only to Weeks 0–1), so the copy
may reference the mental model directly if useful — though this activity's copy doesn't
need to.

### 6. Tests

- **`src/components/exercises/DelegationSort.test.tsx`** (jsdom, following
  `PredictionSort.test.tsx` + `src/test/supabaseMock.ts`): renders items + category
  labels; submit disabled until all placed; after placing all + submit the reveal
  banner, each item's suggested+rationale, and the takeaway render and
  `recordLabSubmission` is called once; "Try again" resets; the signed-out path renders
  the `saveError`.
- **Referential integrity:** a test (in the component test or a small seed-shape test)
  asserts every item's `suggested` matches a `categories[].id`.
- **Client validator** — `src/lib/labValidation.test.ts`: valid config passes; malformed
  variants (missing `items`, empty `categories`, item missing `scenario`) rejected.
- **Deno validator** — `supabase/functions/admin-content/admin-content-core.test.ts`:
  valid accepted + malformed rejected (mirror the `decision-scenario` test).
- **Dispatch** — `src/components/ModuleRenderer.dispatch.test.tsx`: add a
  `['delegation-sort', 'STUB:DelegationSort']` row + stub.
- **Seed guard** — `admin-content-core.seed.test.ts` covers the new seeded module
  automatically once `delegation-sort` is in the Deno `LAB_KINDS`.
- Generator runs clean; `npm run lint` / `npm test` on Node 22.

### Verification not runnable headless

`npx supabase db reset` (applies the regenerated migration) requires Docker + the
Supabase stack; flagged as a manual step, plus a manual click-through of the Week 2
module in the running app.

## Completion / gating

The module completes on **participation** (`via='lab'`, fired by the recorded
submission) — no quiz gate, no all-correct requirement. Matches the Week 1 sort and the
restructure's U9 participation-completion model.

## Out of scope

- "Ground & Scope for Improvement" already exists and covers outline activity #2
  (1.02) — no change.
- 1.02 / 1.03 teaching content (facilitator-led slides).
- The pod "personal delegation list" (Weeks 3–4).
- Generalizing `prediction-sort` + `delegation-sort` into one shared kind (deferred to
  avoid coupling with the open Week 1 PR).
- Any change to the existing `ScenarioSorter` (matrix cell 1.3).

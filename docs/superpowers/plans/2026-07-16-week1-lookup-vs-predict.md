# Week 1 "Lookup vs. Predict" Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Week 1 "Lookup vs. Predict" intuition-then-reveal sort as a new
additive `prediction-sort` exercise kind, plus its seeded Course 1 Week 1 module.

**Architecture:** New member of the `LabConfig` discriminated union (`types.ts`) → a
new `PredictionSort.tsx` exercise component → one `case` in `ModuleRenderer`'s
`renderExercise` switch → one new module row in the Course 1 seed JSON, regenerated
into its migration. Follows the exact additive pattern used for `chat-compare` (U6)
and `decision-scenario` (U7). No existing kind, component, or seed row is modified.

**Tech Stack:** React 19 + TypeScript (strict), Vite, Vitest + Testing Library
(jsdom per-file docblock), `react-markdown` + `remark-gfm`, `motion/react`,
`lucide-react`, Tailwind (Nava tokens). Content pipeline: JSON seed →
`scripts/generate-course1-seed.mjs` → SQL migration.

## Global Constraints

- **Node 22 required** for `npm run lint` / `npm test` / `npm run build` (jsdom tests
  throw `ERR_REQUIRE_ESM` on Node 20). Use `nvm use 22` first.
- **Strict TypeScript:** zero `any` / `@ts-ignore` in production source;
  `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`,
  `noFallthroughCasesInSwitch` are on.
- **Additive union rule:** add new exercise types as new union members + a new switch
  case only. Do not modify existing members/cases.
- **Pre-reveal copy rule (Week 0/1):** all seeded copy must say **"Claude"** and must
  **never** contain the token **"LLM"** — `generate-course1-seed.mjs` throws on
  `\bLLMs?\b`.
- **Never hand-edit** `supabase/migrations/20260715040000_seed_course1_content.sql`;
  change `supabase/seed-data/course1-content.json` and re-run the generator.
- **Branch:** `feat/course1-week1-live` (already created off
  `feat/cohort-program-restructure`). Never commit to `main`.
- `recordLabSubmission(userId, { labId, transcript, status })` fires the participation
  event (`via='lab'`) that auto-completes the module — components do **not** call
  `onComplete` for this.

---

### Task 1: `prediction-sort` types + `PredictionSort` component

**Files:**
- Modify: `src/types.ts` (add two interfaces near the other exercise configs; add one
  member to the `LabConfig` union at `src/types.ts:735`)
- Create: `src/components/exercises/PredictionSort.tsx`
- Test: `src/components/exercises/PredictionSort.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` → `{ user: { id: string } | null }` from `src/lib/auth`;
  `recordLabSubmission(userId: string, submission: { labId: string; transcript:
  unknown; status: string }): Promise<string>` from `src/lib/progress`.
- Produces: `PredictionSortConfig` (kind `'prediction-sort'`) and `PredictionSortItem`
  exported from `src/types.ts`; default-exported `PredictionSort` React component with
  props `{ config: PredictionSortConfig; labId: string }`.

- [ ] **Step 1: Add the types to `src/types.ts`**

Insert these two interfaces immediately after the `ScenarioExerciseConfig` block
(near line 188, before the `SorterCategory` comment) so related configs stay grouped:

```ts
/**
 * 1.01 prediction-sort (Course 1, Week 1): an intuition-then-reveal two-bucket
 * sort. The learner places each task by what it FEELS like — "looking it up" vs
 * "making it up" — then every item reveals the same truth: it was all prediction,
 * never lookup. There is deliberately no `correct` field: placement is never graded.
 * Records a lab_submissions row (`transcript` = { placements, items }); the
 * participation seam auto-completes the module (`via='lab'`). No quiz gate.
 */
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

Then add the union member at `src/types.ts:735` (append after `DecisionScenarioConfig`):

```ts
  | DecisionScenarioConfig
  | PredictionSortConfig
  | GlatConfig;
```

- [ ] **Step 2: Write the failing test `src/components/exercises/PredictionSort.test.tsx`**

```tsx
// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import PredictionSort from './PredictionSort';
import type { PredictionSortConfig } from '../../types';

const { recordLabSubmission, useAuth } = vi.hoisted(() => ({
  recordLabSubmission: vi.fn(async () => 'sub-1'),
  useAuth: vi.fn((): { user: { id: string } | null } => ({ user: { id: 'u1' } })),
}));
vi.mock('../../lib/auth', () => ({ useAuth }));
vi.mock('../../lib/progress', () => ({ recordLabSubmission }));

beforeEach(() => {
  recordLabSubmission.mockClear();
  useAuth.mockReturnValue({ user: { id: 'u1' } });
});

const config: PredictionSortConfig = {
  kind: 'prediction-sort',
  introMd: 'Sort each task by what it feels like.',
  bucketLabels: { lookup: 'Feels like looking it up', predict: 'Feels like making it up' },
  items: [
    { id: 'a', prompt: "What's the capital of France?", reveal: 'Predicted Paris.' },
    { id: 'b', prompt: 'Give me three offsite ideas.', reveal: 'Plainly generated.' },
  ],
  takeaway: { title: 'The twist', body: 'It was all prediction.' },
};

// Places every item into its lookup bucket by clicking the lookup-labelled button
// inside each item's radiogroup.
function placeAll() {
  for (const item of config.items) {
    const group = screen.getByRole('radiogroup', { name: item.prompt });
    fireEvent.click(within(group).getByRole('radio', { name: config.bucketLabels.lookup }));
  }
}

describe('PredictionSort', () => {
  test('renders each item prompt and both bucket labels', () => {
    render(<PredictionSort config={config} labId="c1-w1-lookup-vs-predict" />);
    expect(screen.getByText("What's the capital of France?")).toBeTruthy();
    expect(screen.getByText('Give me three offsite ideas.')).toBeTruthy();
    // Bucket labels appear as radio options inside each item.
    expect(screen.getAllByRole('radio', { name: 'Feels like looking it up' }).length).toBe(2);
  });

  test('submit is disabled until every item is placed', () => {
    render(<PredictionSort config={config} labId="c1-w1-lookup-vs-predict" />);
    const submit = screen.getByRole('button', { name: /submit/i });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    placeAll();
    expect((submit as HTMLButtonElement).disabled).toBe(false);
  });

  test('on submit: reveals notes + takeaway and records one submission', async () => {
    render(<PredictionSort config={config} labId="c1-w1-lookup-vs-predict" />);
    placeAll();
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => expect(recordLabSubmission).toHaveBeenCalledTimes(1));
    expect(recordLabSubmission).toHaveBeenCalledWith('u1', expect.objectContaining({
      labId: 'c1-w1-lookup-vs-predict',
      status: 'submitted',
    }));
    expect(screen.getByText(/it never looked anything up/i)).toBeTruthy();
    expect(screen.getByText('Predicted Paris.')).toBeTruthy();
    expect(screen.getByText('The twist')).toBeTruthy();
  });

  test('try again resets placements and hides the reveal', async () => {
    render(<PredictionSort config={config} labId="c1-w1-lookup-vs-predict" />);
    placeAll();
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => expect(screen.getByText('The twist')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.queryByText('The twist')).toBeNull();
    expect((screen.getByRole('button', { name: /submit/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  test('signed-out: shows the sign-in prompt and does not record', async () => {
    useAuth.mockReturnValue({ user: null });
    render(<PredictionSort config={config} labId="c1-w1-lookup-vs-predict" />);
    placeAll();
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(recordLabSubmission).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
nvm use 22 && npx vitest run src/components/exercises/PredictionSort.test.tsx
```
Expected: FAIL — cannot resolve `./PredictionSort` (module not created yet).

- [ ] **Step 4: Create `src/components/exercises/PredictionSort.tsx`**

```tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Shuffle, Check, Sparkles, ClipboardCheck } from 'lucide-react';
import type { PredictionSortConfig } from '../../types';
import { useAuth } from '../../lib/auth';
import { recordLabSubmission } from '../../lib/progress';

interface Props {
  config: PredictionSortConfig;
  labId: string;
}

type Bucket = 'lookup' | 'predict';

// Course 1, Week 1 intuition-then-reveal sort (1.01). The learner places each task
// into one of two buckets by what it FEELS like; on submit every card reveals the
// same truth — it was all prediction, never lookup. No score, no wrong answer. The
// recorded submission auto-completes the module via the participation seam (via='lab'),
// so there is no onComplete prop (matches chat-compare / decision-scenario).
export default function PredictionSort({ config, labId }: Props) {
  const { user } = useAuth();
  const { items, bucketLabels, takeaway } = config;

  const [placements, setPlacements] = useState<Record<string, Bucket>>({});
  const [graded, setGraded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const allPlaced = items.every((it) => placements[it.id] !== undefined);

  const place = (id: string, bucket: Bucket) => {
    if (graded) return;
    setPlacements((prev) => ({ ...prev, [id]: bucket }));
  };

  const handleSubmit = async () => {
    if (!allPlaced || graded || saving) return; // guard the async-save window (DATA-04)
    setGraded(true);
    setSaveError(null);

    if (!user) {
      setSaveError('Sign in to record your work — the reveal is shown below.');
      return;
    }

    setSaving(true);
    try {
      await recordLabSubmission(user.id, {
        labId,
        transcript: {
          placements,
          items: items.map((it) => ({ id: it.id, prompt: it.prompt })),
        },
        status: 'submitted',
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not record your submission.');
    } finally {
      setSaving(false);
    }
  };

  const handleRetry = () => {
    setPlacements({});
    setGraded(false);
    setSaveError(null);
  };

  return (
    <div className="bg-white border-2 border-nava-mint rounded-3xl p-8 shadow-sm space-y-8" id="prediction-sort">
      <div className="flex items-center gap-3 border-b border-nava-mint pb-6">
        <div className="w-10 h-10 bg-nava-mint rounded-xl flex items-center justify-center text-nava-green">
          <Shuffle className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold">Lookup or Predict?</h3>
          <p className="text-xs text-gray-500">Sort by gut feel — there is no wrong answer here.</p>
        </div>
      </div>

      {config.introMd && (
        <div className="prose prose-sm max-w-none text-gray-700">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{config.introMd}</ReactMarkdown>
        </div>
      )}

      <div className="space-y-6">
        {items.map((item) => {
          const chosen = placements[item.id];
          return (
            <div
              key={item.id}
              className={`rounded-2xl border-2 p-5 space-y-4 transition-colors ${
                graded ? 'border-nava-plum/20 bg-nava-plum/5' : 'border-gray-100'
              }`}
            >
              <p className="text-sm font-semibold text-gray-800 leading-relaxed">{item.prompt}</p>

              <div className="flex flex-col sm:flex-row gap-2" role="radiogroup" aria-label={item.prompt}>
                {(['lookup', 'predict'] as Bucket[]).map((bucket) => {
                  const selected = chosen === bucket;
                  return (
                    <button
                      key={bucket}
                      role="radio"
                      aria-checked={selected}
                      disabled={graded}
                      onClick={() => place(item.id, bucket)}
                      className={`flex-1 text-left text-sm font-medium rounded-xl px-4 py-2.5 border-2 transition-all ${
                        selected
                          ? 'border-nava-green bg-nava-mint text-nava-green'
                          : 'border-gray-100 text-gray-700 hover:border-nava-green/30'
                      }`}
                    >
                      {bucketLabels[bucket]}
                    </button>
                  );
                })}
              </div>

              <AnimatePresence>
                {graded && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    role="status"
                    aria-live="polite"
                    className="flex gap-3 rounded-xl bg-nava-mint/40 p-4"
                  >
                    <div className="w-7 h-7 rounded-full bg-nava-mint flex items-center justify-center shrink-0">
                      <Check className="w-4 h-4 text-nava-green" />
                    </div>
                    <p className="text-xs leading-relaxed text-gray-700">{item.reveal}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {saveError && <p role="alert" className="text-xs text-red-600 font-medium">{saveError}</p>}

      <AnimatePresence>
        {graded && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border-2 border-nava-plum/20 bg-nava-plum/5 p-6 space-y-3"
          >
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-nava-plum" />
              <h4 className="font-bold text-nava-plum">{takeaway.title}</h4>
            </div>
            <p className="text-sm font-semibold text-gray-800">
              Every one of these was Claude predicting the next word — it never looked anything up.
            </p>
            <p className="text-sm text-gray-600 leading-relaxed">{takeaway.body}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {graded ? (
        <div className="flex justify-end border-t border-gray-100 pt-6">
          <button
            onClick={handleRetry}
            className="px-6 py-2.5 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-black transition-all active:scale-95"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="flex justify-end border-t border-gray-100 pt-6">
          <button
            onClick={handleSubmit}
            disabled={!allPlaced || saving}
            className="flex items-center gap-2 px-10 py-3 bg-nava-green text-white rounded-xl font-bold shadow-lg shadow-nava-green/20 disabled:opacity-50 transition-all active:scale-95"
          >
            {saving ? (
              <>
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                  <Sparkles className="w-4 h-4" />
                </motion.div>
                Submitting…
              </>
            ) : (
              'Submit'
            )}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run src/components/exercises/PredictionSort.test.tsx
```
Expected: PASS (5 tests).

- [ ] **Step 6: Typecheck + lint the two files**

```bash
npm run lint
```
Expected: no errors (strict TS clean; no `any`).

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/components/exercises/PredictionSort.tsx src/components/exercises/PredictionSort.test.tsx
git commit -m "feat(exercises): prediction-sort kind — Week 1 Lookup-vs-Predict intuition sort (1.01)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Wire `prediction-sort` into `ModuleRenderer`

**Files:**
- Modify: `src/components/ModuleRenderer.tsx` (import + one `case` in `renderExercise`)

**Interfaces:**
- Consumes: `PredictionSort` (default export from Task 1); `module.labConfig` narrowed
  to `PredictionSortConfig` by the `kind` discriminant; `module.cellId`.
- Produces: nothing new (dispatch wiring only).

- [ ] **Step 1: Add the import**

Near the other exercise imports at the top of `src/components/ModuleRenderer.tsx`, add:

```tsx
import PredictionSort from './exercises/PredictionSort';
```

- [ ] **Step 2: Add the switch case**

In `renderExercise()`, immediately after the `case 'decision-scenario':` block
(ends around `src/components/ModuleRenderer.tsx:233`), add:

```tsx
      case 'prediction-sort':
        // 1.01 intuition sort (Course 1, Week 1) — records a submission that
        // auto-completes the module via the participation seam (via='lab'); no
        // onComplete (see PredictionSortConfig). Matches chat-compare/decision-scenario.
        return <PredictionSort config={module.labConfig} labId={module.cellId} />;
```

- [ ] **Step 3: Typecheck**

```bash
npm run lint
```
Expected: no errors. (The `noFallthroughCasesInSwitch` / exhaustive-union checks now
see the new member handled.)

- [ ] **Step 4: Full test run (nothing regressed)**

```bash
npm test
```
Expected: PASS (full suite green, including the new `PredictionSort.test.tsx`).

- [ ] **Step 5: Commit**

```bash
git add src/components/ModuleRenderer.tsx
git commit -m "feat(exercises): dispatch prediction-sort in ModuleRenderer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Seed the Week 1 module + regenerate the migration

**Files:**
- Modify: `supabase/seed-data/course1-content.json` (append one object to `modules`)
- Generated (do not hand-edit): `supabase/migrations/20260715040000_seed_course1_content.sql`

**Interfaces:**
- Consumes: the fixed `week1` uuid already in the JSON's `weeks` map; the
  `prediction-sort` config shape from Task 1.
- Produces: a published `origin='course'` module `c1-w1-lookup-vs-predict` assigned to
  `week1` at `week_sort_order: 2`.

- [ ] **Step 1: Append the module to `supabase/seed-data/course1-content.json`**

Add this object as the last element of the `modules` array (after the existing
`week1` "Experiment 2" entry; JSON comma before it as needed):

```json
{
  "cell_id": "c1-w1-lookup-vs-predict",
  "week": "week1",
  "week_sort_order": 2,
  "origin": "course",
  "visibility": "program",
  "title": "Lookup or Predict?",
  "type": "lab",
  "dimension": ["Discernment"],
  "evidence_type": "performance-task",
  "sort_order": 903,
  "body_md": "Part of the Week 1 live session, after the two experiments. Sort each task below by what it *feels* like Claude is doing — then submit to see the twist. There is no wrong answer while you sort; the point is to compare your gut feeling against what's actually happening.",
  "lab_config_json": {
    "kind": "prediction-sort",
    "introMd": "For each task, place it in the bucket that matches your gut: does it feel like Claude is **looking something up**, or **making something up**? Sort all six, then submit.",
    "bucketLabels": {
      "lookup": "Feels like looking it up",
      "predict": "Feels like making it up"
    },
    "items": [
      {
        "id": "capital",
        "prompt": "What's the capital of France?",
        "reveal": "Feels like a fact Claude retrieved — but Claude predicted \"Paris\" because those words follow that question countless times in its training. Same machinery as everything else here."
      },
      {
        "id": "offsite",
        "prompt": "Give me three ideas for a team offsite.",
        "reveal": "Obviously generated on the spot — there's no \"right\" answer to retrieve. But the capital of France worked the exact same way."
      },
      {
        "id": "summary",
        "prompt": "Summarize this paragraph I just pasted.",
        "reveal": "It's grounded in the text you gave it, yet Claude still predicts the summary word by word — it isn't copying sentences straight out."
      },
      {
        "id": "worldcup",
        "prompt": "Who won the 2043 World Cup?",
        "reveal": "There's nothing to look up — the match hasn't happened. Claude predicts a plausible-sounding answer anyway. That's how the confident wrong answers in Experiment 2 happen."
      },
      {
        "id": "mockingbird",
        "prompt": "What page of To Kill a Mockingbird is the trial on?",
        "reveal": "Claude has no book to flip through; it predicts a page number that sounds right."
      },
      {
        "id": "translate",
        "prompt": "Translate 'good morning' into Spanish.",
        "reveal": "Feels like a dictionary lookup, but Claude is predicting the words \"buenos días\" from patterns it has seen."
      }
    ],
    "takeaway": {
      "title": "The twist: it was all prediction",
      "body": "You probably split these into \"looking it up\" and \"making it up.\" Here's the catch — Claude did the exact same thing for every one: it predicted the next word from patterns in its training. It never looked anything up. Some predictions land on the truth (they're common patterns); some drift into confident fiction (Experiment 2). Your Champion will unpack why in the live debrief."
    }
  }
}
```

- [ ] **Step 2: Regenerate the migration**

```bash
node scripts/generate-course1-seed.mjs
```
Expected stdout: `Wrote …20260715040000_seed_course1_content.sql: 10 modules (9 week-assigned).`
(9 modules → 10; 8 week-assigned → 9.) If the generator throws
`pre-reveal copy … must say "Claude", never "LLM"`, the copy accidentally contains
"LLM" — fix the JSON and re-run.

- [ ] **Step 3: Verify the new row is in the generated SQL**

```bash
grep -c "c1-w1-lookup-vs-predict" supabase/migrations/20260715040000_seed_course1_content.sql
```
Expected: `2` (one module INSERT + one course_week_modules membership row).

- [ ] **Step 4: Confirm no other migration lines changed unexpectedly**

```bash
git diff --stat supabase/migrations/20260715040000_seed_course1_content.sql
```
Expected: only insertions (the new module block + one membership row); no deletions.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed-data/course1-content.json supabase/migrations/20260715040000_seed_course1_content.sql
git commit -m "feat(content): seed Week 1 Lookup-vs-Predict sort module (1.01)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 6 (MANUAL — needs Docker + local Supabase stack; not run headless):**

```bash
npx supabase db reset          # applies the regenerated migration + seed
npm run dev                    # then sign in as demo@navapbc.com, open Course 1 → Week 1
```
Confirm the "Lookup or Predict?" module renders after the two experiments, all six
items place via keyboard/click, submit reveals every note + the takeaway, and the
module marks complete on submit.

---

## Self-Review

**Spec coverage:**
- Types (§Architecture.1) → Task 1, Step 1. ✅
- Component with two-button placement, no score, participation completion (§.2) →
  Task 1, Steps 2–4. ✅
- ModuleRenderer dispatch (§.3) → Task 2. ✅
- Seed module + regenerate migration, pre-reveal rule (§.4) → Task 3, Steps 1–2. ✅
- 6 mixed-everyday items + takeaway (§.4 table) → Task 3, Step 1 (verbatim). ✅
- Tests (§.5): component test → Task 1; generator run → Task 3, Step 2; lint/test on
  Node 22 → Task 1 Step 6, Task 2 Steps 3–4. ✅
- a11y axe enumeration note (§.5): the repo's `src/test/a11y.axe.test.tsx` does not
  enumerate exercise kinds by config (it renders full pages), so no edit is required;
  `PredictionSort` uses the same `role="radio"`/`aria-checked` pattern already covered.
  Flagged — verify during Task 2 Step 4 that the axe test stays green.
- DB-reset verification is manual (§Verification not runnable headless) → Task 3,
  Step 6. ✅

**Placeholder scan:** No TBD/TODO/"add error handling"/"similar to Task N". All code
blocks are complete; the item copy is verbatim. ✅

**Type consistency:** `PredictionSortConfig` / `PredictionSortItem` / `bucketLabels
{lookup,predict}` / `placements: Record<string, Bucket>` / `recordLabSubmission(userId,
{labId, transcript, status})` are identical across the type def, the component, the
test, and the seed JSON. Union member name `PredictionSortConfig` matches in `types.ts`
and the `ModuleRenderer` narrowing. ✅

# Week 2 "Delegation Task Sort" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Week 2 "Delegation task sort" as a new additive `delegation-sort`
exercise kind (participation-based, suggested-answer), plus its seeded Course 1 Week 2
module.

**Architecture:** New member of the `LabConfig` union (`types.ts`) → a new
`DelegationSort.tsx` component (mirrors the Week 1 `PredictionSort`, but N configurable
category buckets + a suggested categorization/rationale revealed per item) → a `case`
in `ModuleRenderer` → registration in BOTH the client (`labValidation.ts`) and Deno
(`admin-content-core.ts`) validators → one seeded Week 2 module. No existing kind,
component, or seed row is modified.

**Tech Stack:** React 19 + TypeScript (strict), Vitest + Testing Library (jsdom
docblock), `react-markdown` + `remark-gfm`, `motion/react`, `lucide-react`, Tailwind
(Nava tokens). Content pipeline: JSON seed → `scripts/generate-course1-seed.mjs` → SQL
migration.

## Global Constraints

- **Node 22 required** for `npm run lint` / `npm test` (jsdom throws `ERR_REQUIRE_ESM`
  on Node 20). Run `export NVM_DIR="$HOME/.nvm"; source "$NVM_DIR/nvm.sh"; nvm use 22`
  before any npm/npx command; confirm `node -v` is v22.
- **Strict TypeScript:** zero `any` / `@ts-ignore` in production source.
- **Additive union rule:** new exercise types are new union members + additive
  registrations only. Do not modify existing members/cases.
- **Register the kind in BOTH validators** — client `src/lib/labValidation.ts` AND Deno
  `supabase/functions/admin-content/admin-content-core.ts`. (A kind registered only
  client-side causes the CMS to reject the seeded module and the seed-guard test to
  silently skip it — the defect the Week 1 PR review caught.)
- The component takes props `{ config, labId }`, has **no `onComplete`** — completion
  is via the participation seam (`recordLabSubmission` fires `via='lab'`).
- The sort has **no `correct` field, no score, no gate** — `suggested` is guidance
  shown on reveal only.
- **Never hand-edit** `supabase/migrations/20260715040000_seed_course1_content.sql`;
  change `supabase/seed-data/course1-content.json` and re-run the generator.
- **Week 2 is NOT a pre-reveal week** — the "Claude, never LLM" rule applies only to
  Weeks 0–1, so Week 2 copy may reference the model directly.
- **Branch:** `feat/course1-week2-live` (already created off `feat/course1-week1-live`).
  Never commit to `main`. There is a pre-existing unstaged `package-lock.json` change —
  never stage it.

---

### Task 1: `delegation-sort` types + component + client validator

**Files:**
- Modify: `src/types.ts` (add two interfaces near the other exercise configs; add one
  member to the `LabConfig` union)
- Create: `src/components/exercises/DelegationSort.tsx`
- Test: `src/components/exercises/DelegationSort.test.tsx`
- Modify: `src/lib/labValidation.ts` (`LAB_KINDS`, `LAB_KIND_LABELS`, `LAB_VALIDATORS`)
- Test: `src/lib/labValidation.test.ts`

**Interfaces:**
- Consumes: `useAuth()` → `{ user: { id: string } | null }`; `recordLabSubmission(userId,
  { labId, transcript, status }): Promise<string>` from `src/lib/progress`.
- Produces: `DelegationSortConfig` (kind `'delegation-sort'`) + `DelegationSortItem`
  exported from `src/types.ts`; default-exported `DelegationSort` component with props
  `{ config: DelegationSortConfig; labId: string }`.

- [ ] **Step 1: Add the types to `src/types.ts`**

Insert immediately after the `PredictionSortConfig` block (the Week 1 kind):

```ts
/**
 * 1.03 delegation-sort (Course 1, Week 2): a participation-based delegation sort.
 * The learner places each scenario into one of the `categories` buckets (Full-AI /
 * AI-assisted / Human-only); on submit each card reveals a SUGGESTED categorization +
 * rationale, framed as a defensible call — never scored or gated. Records a
 * lab_submissions row; the participation seam auto-completes the module (via='lab').
 */
export interface DelegationSortItem {
  id: string;
  /** The task/scenario shown on the card. */
  scenario: string;
  /** id of the categories[] entry this is a defensible fit for — shown on reveal as
   *  guidance; NEVER used to score or gate. */
  suggested: string;
  /** One-sentence rationale revealed after submit. */
  rationale: string;
}

export interface DelegationSortConfig {
  kind: 'delegation-sort';
  introMd: string;
  /** The category buckets, in display order. */
  categories: { id: string; label: string; desc: string }[];
  items: DelegationSortItem[];
  takeaway: { title: string; body: string };
}
```

Add the union member (append after `PredictionSortConfig`, before `GlatConfig`):

```ts
  | PredictionSortConfig
  | DelegationSortConfig
  | GlatConfig;
```

- [ ] **Step 2: Write the failing component test `src/components/exercises/DelegationSort.test.tsx`**

```tsx
// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import DelegationSort from './DelegationSort';
import type { DelegationSortConfig } from '../../types';

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

const config: DelegationSortConfig = {
  kind: 'delegation-sort',
  introMd: 'Sort each task.',
  categories: [
    { id: 'full-ai', label: 'Full-AI', desc: 'end to end' },
    { id: 'assisted', label: 'AI-assisted', desc: 'person checks' },
    { id: 'human-only', label: 'Human-only', desc: 'person owns it' },
  ],
  items: [
    { id: 'a', scenario: 'Reformat a table.', suggested: 'full-ai', rationale: 'Mechanical.' },
    { id: 'b', scenario: "Write a teammate's PIP.", suggested: 'human-only', rationale: 'Accountability.' },
  ],
  takeaway: { title: 'Who owns the call?', body: 'Ask first.' },
};

// Places every item into its first category (choice is irrelevant — nothing is scored).
function placeAll() {
  for (const item of config.items) {
    const group = screen.getByRole('radiogroup', { name: item.scenario });
    fireEvent.click(within(group).getAllByRole('radio')[0]);
  }
}

describe('DelegationSort', () => {
  test('renders each scenario and all category labels as radios', () => {
    render(<DelegationSort config={config} labId="c1-w2-delegation-sort" />);
    expect(screen.getByText('Reformat a table.')).toBeTruthy();
    expect(screen.getByText("Write a teammate's PIP.")).toBeTruthy();
    // 3 categories × 2 items → each label appears as a radio twice
    expect(screen.getAllByRole('radio', { name: 'Full-AI' }).length).toBe(2);
    expect(screen.getAllByRole('radio', { name: 'Human-only' }).length).toBe(2);
  });

  test('submit is disabled until every scenario is placed', () => {
    render(<DelegationSort config={config} labId="c1-w2-delegation-sort" />);
    const submit = screen.getByRole('button', { name: /submit/i });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    placeAll();
    expect((submit as HTMLButtonElement).disabled).toBe(false);
  });

  test('on submit: reveals the suggested call + rationale + takeaway and records once', async () => {
    render(<DelegationSort config={config} labId="c1-w2-delegation-sort" />);
    placeAll();
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => expect(recordLabSubmission).toHaveBeenCalledTimes(1));
    expect(recordLabSubmission).toHaveBeenCalledWith('u1', expect.objectContaining({
      labId: 'c1-w2-delegation-sort',
      status: 'submitted',
    }));
    // Two reveals; the first item (full-ai) shows its label + rationale.
    const reveals = screen.getAllByText(/A defensible call:/i);
    expect(reveals).toHaveLength(2);
    const firstReveal = reveals[0].closest('p');
    expect(firstReveal?.textContent).toContain('Full-AI');
    expect(firstReveal?.textContent).toContain('Mechanical.');
    expect(screen.getByText('Who owns the call?')).toBeTruthy();
  });

  test('try again resets placements and hides the reveal', async () => {
    render(<DelegationSort config={config} labId="c1-w2-delegation-sort" />);
    placeAll();
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => expect(screen.getByText('Who owns the call?')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.queryByText('Who owns the call?')).toBeNull();
    expect((screen.getByRole('button', { name: /submit/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  test('signed-out: shows the sign-in prompt and does not record', async () => {
    useAuth.mockReturnValue({ user: null });
    render(<DelegationSort config={config} labId="c1-w2-delegation-sort" />);
    placeAll();
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(recordLabSubmission).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
export NVM_DIR="$HOME/.nvm"; source "$NVM_DIR/nvm.sh"; nvm use 22
npx vitest run src/components/exercises/DelegationSort.test.tsx
```
Expected: FAIL — cannot resolve `./DelegationSort`.

- [ ] **Step 4: Create `src/components/exercises/DelegationSort.tsx`**

```tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ListChecks, Check, Sparkles, ClipboardCheck } from 'lucide-react';
import type { DelegationSortConfig } from '../../types';
import { useAuth } from '../../lib/auth';
import { recordLabSubmission } from '../../lib/progress';

interface Props {
  config: DelegationSortConfig;
  labId: string;
}

// Course 1, Week 2 delegation sort (1.03). The learner sorts each scenario into a
// category bucket (Full-AI / AI-assisted / Human-only); on submit every card reveals a
// SUGGESTED categorization + rationale, framed as a defensible call (never scored or
// gated). The recorded submission auto-completes the module via the participation seam
// (via='lab'), so there is no onComplete prop (matches prediction-sort / chat-compare).
export default function DelegationSort({ config, labId }: Props) {
  const { user } = useAuth();
  const { categories, items, takeaway } = config;

  const [placements, setPlacements] = useState<Record<string, string>>({});
  const [graded, setGraded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const labelFor = (id: string) => categories.find((c) => c.id === id)?.label ?? id;
  const allPlaced = items.every((it) => placements[it.id] !== undefined);

  const place = (id: string, categoryId: string) => {
    if (graded) return;
    setPlacements((prev) => ({ ...prev, [id]: categoryId }));
  };

  const handleSubmit = async () => {
    if (!allPlaced || graded || saving) return; // guard the async-save window (DATA-04)
    setGraded(true);
    setSaveError(null);

    if (!user) {
      setSaveError('Sign in to record your work — the suggested calls are shown below.');
      return;
    }

    setSaving(true);
    try {
      await recordLabSubmission(user.id, {
        labId,
        transcript: {
          placements,
          items: items.map((it) => ({ id: it.id, scenario: it.scenario, suggested: it.suggested })),
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
    <div className="bg-white border-2 border-nava-mint rounded-3xl p-8 shadow-sm space-y-8" id="delegation-sort">
      <div className="flex items-center gap-3 border-b border-nava-mint pb-6">
        <div className="w-10 h-10 bg-nava-mint rounded-xl flex items-center justify-center text-nava-green">
          <ListChecks className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold">Full-AI, Assisted, or Human-Only?</h3>
          <p className="text-xs text-gray-500">Sort each task, then see a defensible call — gray areas are worth debating.</p>
        </div>
      </div>

      {config.introMd && (
        <div className="prose prose-sm max-w-none text-gray-700">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{config.introMd}</ReactMarkdown>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {categories.map((c) => (
          <div key={c.id} className="text-xs text-gray-600 bg-gray-50 rounded-xl p-3 leading-relaxed">
            <span className="font-bold text-nava-plum">{c.label}</span> — {c.desc}
          </div>
        ))}
      </div>

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
              <p className="text-sm font-semibold text-gray-800 leading-relaxed">{item.scenario}</p>

              <div className="flex flex-col sm:flex-row gap-2" role="radiogroup" aria-label={item.scenario}>
                {categories.map((c) => {
                  const selected = chosen === c.id;
                  return (
                    <button
                      key={c.id}
                      role="radio"
                      aria-checked={selected}
                      disabled={graded}
                      onClick={() => place(item.id, c.id)}
                      className={`flex-1 text-left text-sm font-medium rounded-xl px-4 py-2.5 border-2 transition-all ${
                        selected
                          ? 'border-nava-green bg-nava-mint text-nava-green'
                          : 'border-gray-100 text-gray-700 hover:border-nava-green/30'
                      }`}
                    >
                      {c.label}
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
                    <p className="text-xs leading-relaxed text-gray-700">
                      <span className="font-bold">A defensible call: {labelFor(item.suggested)}.</span> {item.rationale}
                    </p>
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

- [ ] **Step 5: Register the kind in the client validator `src/lib/labValidation.ts`**

(a) Add `'delegation-sort',` to the `LAB_KINDS` array, right after `'prediction-sort',`.

(b) Add to `LAB_KIND_LABELS` (the exhaustive `Record<LabConfig['kind'], string>` — this
is compiler-mandated, or `tsc` fails), right after the `'prediction-sort': 'Prediction sort',`
line:
```ts
  'delegation-sort': 'Delegation sort',
```

(c) Add to the `LAB_VALIDATORS` map, right after the `'prediction-sort': (c) => …,`
entry (mirrors its style exactly — `firstError` / `isObj` / `isNonEmptyStr` / `checkArray`):
```ts
  'delegation-sort': (c) =>
    firstError(
      isNonEmptyStr(c.introMd) ? null : '`introMd` must be a non-empty string.',
      checkArray(c.categories, 'categories', (cat, p) =>
        isObj(cat) && isNonEmptyStr(cat.id) && isNonEmptyStr(cat.label) && typeof cat.desc === 'string'
          ? null
          : `\`${p}\` must be { id, label, desc }.`,
      ),
      checkArray(c.items, 'items', (it, p) =>
        isObj(it) &&
        isNonEmptyStr(it.id) &&
        isNonEmptyStr(it.scenario) &&
        isNonEmptyStr(it.suggested) &&
        isNonEmptyStr(it.rationale)
          ? null
          : `\`${p}\` must be { id, scenario, suggested, rationale } (all non-empty strings).`,
      ),
      isObj(c.takeaway) &&
      isNonEmptyStr((c.takeaway as Obj).title) &&
      isNonEmptyStr((c.takeaway as Obj).body)
        ? null
        : '`takeaway` must be { title, body } (both non-empty strings).',
    ),
```

- [ ] **Step 6: Add client validator tests to `src/lib/labValidation.test.ts`**

Find the `prediction-sort` validator describe/test block and add, right after it,
mirroring its structure:

```ts
  test('delegation-sort: accepts a well-formed config', () => {
    expect(
      validateLabConfig({
        kind: 'delegation-sort',
        introMd: 'Sort these.',
        categories: [
          { id: 'full-ai', label: 'Full-AI', desc: 'end to end' },
          { id: 'human-only', label: 'Human-only', desc: 'person owns it' },
        ],
        items: [{ id: 'a', scenario: 'Reformat a table.', suggested: 'full-ai', rationale: 'Mechanical.' }],
        takeaway: { title: 'T', body: 'B' },
      }).ok,
    ).toBe(true);
  });

  test('delegation-sort: rejects missing items and incomplete categories', () => {
    expect(
      validateLabConfig({
        kind: 'delegation-sort',
        introMd: 'x',
        categories: [{ id: 'full-ai', label: 'Full-AI', desc: '' }],
        takeaway: { title: 'T', body: 'B' },
      }).ok,
    ).toBe(false); // items missing
    expect(
      validateLabConfig({
        kind: 'delegation-sort',
        introMd: 'x',
        categories: [{ id: '', label: 'Full-AI', desc: 'd' }],
        items: [{ id: 'a', scenario: 's', suggested: 'full-ai', rationale: 'r' }],
        takeaway: { title: 'T', body: 'B' },
      }).ok,
    ).toBe(false); // category id blank
  });
```

(If the test file imports `validateLabConfig` under a different local name, use that —
match the existing prediction-sort test's import.)

- [ ] **Step 7: Run tests + lint**

```bash
npx vitest run src/components/exercises/DelegationSort.test.tsx src/lib/labValidation.test.ts
npm run lint
```
Expected: component 5/5 + validation suite green; lint clean.

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/components/exercises/DelegationSort.tsx src/components/exercises/DelegationSort.test.tsx src/lib/labValidation.ts src/lib/labValidation.test.ts
git commit -m "feat(exercises): delegation-sort kind — Week 2 delegation task sort (1.03)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Deno validator parity + ModuleRenderer dispatch

**Files:**
- Modify: `supabase/functions/admin-content/admin-content-core.ts` (`LAB_KINDS` + `LAB_VALIDATORS`)
- Test: `supabase/functions/admin-content/admin-content-core.test.ts`
- Modify: `src/components/ModuleRenderer.tsx` (import + one `case`)
- Test: `src/components/ModuleRenderer.dispatch.test.tsx`

**Interfaces:**
- Consumes: `DelegationSort` (default export from Task 1); `DelegationSortConfig` (kind
  discriminant narrows `module.labConfig`); the Deno core's own `firstError` / `isObj`
  / `isNonEmptyStr` / `checkArray` helpers.
- Produces: nothing new (parity + wiring).

- [ ] **Step 1: Register the kind in the Deno validator `supabase/functions/admin-content/admin-content-core.ts`**

(a) Add `'delegation-sort',` to the Deno `LAB_KINDS` array, right after `'prediction-sort',`.

(b) Add to the Deno `LAB_VALIDATORS` map, right after the `'prediction-sort': (c) => …`
entry — IDENTICAL to the client validator from Task 1 Step 5c (same helpers exist in
this file):
```ts
  'delegation-sort': (c) =>
    firstError(
      isNonEmptyStr(c.introMd) ? null : '`introMd` must be a non-empty string.',
      checkArray(c.categories, 'categories', (cat, p) =>
        isObj(cat) && isNonEmptyStr(cat.id) && isNonEmptyStr(cat.label) && typeof cat.desc === 'string'
          ? null
          : `\`${p}\` must be { id, label, desc }.`,
      ),
      checkArray(c.items, 'items', (it, p) =>
        isObj(it) &&
        isNonEmptyStr(it.id) &&
        isNonEmptyStr(it.scenario) &&
        isNonEmptyStr(it.suggested) &&
        isNonEmptyStr(it.rationale)
          ? null
          : `\`${p}\` must be { id, scenario, suggested, rationale } (all non-empty strings).`,
      ),
      isObj(c.takeaway) &&
      isNonEmptyStr((c.takeaway as Obj).title) &&
      isNonEmptyStr((c.takeaway as Obj).body)
        ? null
        : '`takeaway` must be { title, body } (both non-empty strings).',
    ),
```

- [ ] **Step 2: Add a Deno validator test to `supabase/functions/admin-content/admin-content-core.test.ts`**

Find the `prediction-sort` validator test and add, right after it, mirroring it (use the
file's existing helper for invoking the validator — likely `validateLabConfigJson`):

```ts
  test('delegation-sort: valid accepted, malformed rejected', () => {
    const valid = {
      kind: 'delegation-sort',
      introMd: 'Sort these.',
      categories: [
        { id: 'full-ai', label: 'Full-AI', desc: 'end to end' },
        { id: 'human-only', label: 'Human-only', desc: 'person owns it' },
      ],
      items: [{ id: 'a', scenario: 'Reformat a table.', suggested: 'full-ai', rationale: 'Mechanical.' }],
      takeaway: { title: 'T', body: 'B' },
    };
    expect(validateLabConfigJson(valid).ok).toBe(true);
    expect(validateLabConfigJson({ ...valid, items: [] }).ok).toBe(false);
    expect(validateLabConfigJson({ ...valid, categories: [] }).ok).toBe(false);
    expect(
      validateLabConfigJson({ ...valid, items: [{ id: 'a', scenario: '', suggested: 'full-ai', rationale: 'r' }] }).ok,
    ).toBe(false);
  });
```

(Match the exact assertion API of the neighboring `prediction-sort` / `decision-scenario`
tests — if they assert on `.ok` vs a thrown error vs a returned message, follow suit.)

- [ ] **Step 3: Add the dispatch import + case to `src/components/ModuleRenderer.tsx`**

Import, near the other exercise imports (after the `PredictionSort` import):
```ts
import DelegationSort from './exercises/DelegationSort';
```
Case in `renderExercise()`, immediately after the `case 'prediction-sort':` block:
```ts
      case 'delegation-sort':
        // 1.03 delegation sort (Course 1, Week 2) — records a submission that
        // auto-completes the module via the participation seam (via='lab'); no
        // onComplete (see DelegationSortConfig). Matches prediction-sort.
        return <DelegationSort config={module.labConfig} labId={module.cellId} />;
```

- [ ] **Step 4: Add the dispatch-test row to `src/components/ModuleRenderer.dispatch.test.tsx`**

Mirror the existing `PredictionSort` mock in this file: add a `vi.mock('./exercises/DelegationSort', …)`
stub next to the `PredictionSort` one (same factory shape, returning a `STUB:DelegationSort`
marker), and add a row to the `test.each` kind→component table, right after the
`['prediction-sort', 'STUB:PredictionSort'],` row:
```ts
    ['delegation-sort', 'STUB:DelegationSort'],
```

- [ ] **Step 5: Run tests + lint**

```bash
export NVM_DIR="$HOME/.nvm"; source "$NVM_DIR/nvm.sh"; nvm use 22
npx vitest run supabase/functions/admin-content/admin-content-core.test.ts src/components/ModuleRenderer.dispatch.test.tsx
npm run lint
```
Expected: both test files green; lint clean.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/admin-content/admin-content-core.ts supabase/functions/admin-content/admin-content-core.test.ts src/components/ModuleRenderer.tsx src/components/ModuleRenderer.dispatch.test.tsx
git commit -m "feat(exercises): dispatch delegation-sort + Deno validator parity

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Seed the Week 2 module + regenerate the migration

**Files:**
- Modify: `supabase/seed-data/course1-content.json` (append one object to `modules`)
- Generated (do not hand-edit): `supabase/migrations/20260715040000_seed_course1_content.sql`
- Test: `src/lib/course1Seed.delegation.test.ts` (referential-integrity guard)

**Interfaces:**
- Consumes: the fixed `week2` uuid already in the JSON's `weeks` map; the
  `delegation-sort` config shape from Task 1.
- Produces: a published `origin='course'` module `c1-w2-delegation-sort` assigned to
  `week2` at `week_sort_order: 1`.

- [ ] **Step 1: Append the module to `supabase/seed-data/course1-content.json`**

Add as the last element of the `modules` array (comma after the current last element):

```json
{
  "cell_id": "c1-w2-delegation-sort",
  "week": "week2",
  "week_sort_order": 1,
  "origin": "course",
  "visibility": "program",
  "title": "Full-AI, Assisted, or Human-Only?",
  "type": "lab",
  "dimension": ["Delegation"],
  "evidence_type": "performance-task",
  "sort_order": 921,
  "body_md": "Part of the Week 2 live session — run this in breakout rooms with your group, before the Ground & Scope activity. Before reaching for AI, the first move is deciding *who should do the task*. Sort each scenario below, then submit to see a defensible call and talk it through.",
  "lab_config_json": {
    "kind": "delegation-sort",
    "introMd": "For each task, decide how AI should be involved: **Full-AI** (AI does it end to end), **AI-assisted** (AI helps, a person checks and owns it), or **Human-only** (a person must make and own the call). Sort all six, then submit — the point isn't a single right answer, it's the reasoning.",
    "categories": [
      { "id": "full-ai", "label": "Full-AI", "desc": "AI does it end-to-end — pattern-matching or synthesis, low-stakes, easy to verify." },
      { "id": "assisted", "label": "AI-assisted", "desc": "AI helps; a person directs, checks, and owns the result." },
      { "id": "human-only", "label": "Human-only", "desc": "A person must make and own the call (AI may help prep, never decide)." }
    ],
    "items": [
      {
        "id": "denial-letter",
        "scenario": "Draft a benefits-eligibility denial letter for a caseworker to review before it goes out.",
        "suggested": "assisted",
        "rationale": "AI can draft the language, but a person must verify the determination and own what's sent to the claimant."
      },
      {
        "id": "508-table",
        "scenario": "Reformat the findings from a 508 accessibility audit into a summary table.",
        "suggested": "full-ai",
        "rationale": "Mechanical restructuring of existing content — low-stakes and easy to check at a glance."
      },
      {
        "id": "pip",
        "scenario": "Write a performance improvement plan (PIP) for a teammate who's struggling.",
        "suggested": "human-only",
        "rationale": "Accountability and values — a manager must make and own this call, not a model."
      },
      {
        "id": "condolence",
        "scenario": "Write a condolence note to a colleague who just lost a family member.",
        "suggested": "human-only",
        "rationale": "A human relationship; sincerity is the whole point and can't be delegated."
      },
      {
        "id": "policy-comments",
        "scenario": "Summarize 40 pages of public comments on a proposed policy into the main themes.",
        "suggested": "full-ai",
        "rationale": "Pattern-matching and synthesis over public text — exactly where AI speeds you up (spot-check the themes)."
      },
      {
        "id": "vendor-award",
        "scenario": "Decide which of three vendors should be awarded a contract.",
        "suggested": "human-only",
        "rationale": "A high-stakes, accountable decision; AI may help you compare, but a person makes the call."
      }
    ],
    "takeaway": {
      "title": "The question to ask first: who owns the call?",
      "body": "Before reaching for AI, ask what kind of task this is. Pattern-matching and synthesis — summarizing, reformatting, drafting — are where AI multiplies your speed. Anything carrying values, ethics, or accountability stays human-owned: AI can help you prepare, but a person makes and owns the decision. The gray-area cases (the 508 table, the policy comments) are worth arguing about — that's the point of today's discussion."
    }
  }
}
```

- [ ] **Step 2: Write the referential-integrity guard test `src/lib/course1Seed.delegation.test.ts`**

```ts
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Guards content coherence the generic lab validator intentionally does not check:
// every delegation-sort item's `suggested` must reference a real categories[].id
// (otherwise the reveal shows a raw id instead of a label).
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const seed = JSON.parse(
  readFileSync(join(ROOT, 'supabase', 'seed-data', 'course1-content.json'), 'utf8'),
);

describe('course1 delegation-sort seed', () => {
  test('every item.suggested references a real category id', () => {
    const modules = seed.modules.filter(
      (m: { lab_config_json?: { kind?: string } }) => m.lab_config_json?.kind === 'delegation-sort',
    );
    expect(modules.length).toBeGreaterThan(0);
    for (const m of modules) {
      const cfg = m.lab_config_json;
      const ids = new Set(cfg.categories.map((c: { id: string }) => c.id));
      for (const it of cfg.items) {
        expect(ids.has(it.suggested)).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 3: Run the guard test (fails until the JSON is added — it was added in Step 1, so it passes)**

```bash
export NVM_DIR="$HOME/.nvm"; source "$NVM_DIR/nvm.sh"; nvm use 22
npx vitest run src/lib/course1Seed.delegation.test.ts
```
Expected: PASS (1 test).

- [ ] **Step 4: Validate JSON + regenerate the migration**

```bash
node -e "JSON.parse(require('fs').readFileSync('supabase/seed-data/course1-content.json','utf8')); console.log('JSON valid')"
node scripts/generate-course1-seed.mjs
```
Expected stdout: `Wrote …20260715040000_seed_course1_content.sql: 11 modules (10 week-assigned).`
(Was 10 modules / 9 week-assigned after Week 1 → now 11 / 10.)

- [ ] **Step 5: Verify the generated SQL contains the new module + membership row**

```bash
grep -c "c1-w2-delegation-sort" supabase/migrations/20260715040000_seed_course1_content.sql
git diff --stat supabase/migrations/20260715040000_seed_course1_content.sql
```
Expected: grep = `3` (comment + module INSERT + membership row); diff shows only
insertions (plus the trailing-comma flip on the prior last membership row), no deletions
of existing rows.

- [ ] **Step 6: Full suite + lint**

```bash
npx vitest run
npm run lint
```
Expected: green except the 2 known environmental `progress.test.ts` failures (stale
local DB schema — unrelated); lint clean.

- [ ] **Step 7: Commit**

```bash
git add supabase/seed-data/course1-content.json supabase/migrations/20260715040000_seed_course1_content.sql src/lib/course1Seed.delegation.test.ts
git commit -m "feat(content): seed Week 2 delegation task sort module (1.03)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 8 (MANUAL — needs Docker + local Supabase stack; not run headless):**

```bash
npx supabase db reset          # applies the regenerated migration + seed
npm run dev                    # sign in as demo@navapbc.com, open Course 1 → Week 2
```
Confirm the "Full-AI, Assisted, or Human-Only?" module renders before "Ground & Scope",
all six scenarios place via keyboard/click, submit reveals every suggested call +
rationale + the takeaway, and the module marks complete on submit.

---

## Self-Review

**Spec coverage:**
- Types (§Architecture.1) → Task 1, Step 1. ✅
- Component: participation, no score, N category buttons, suggested+rationale reveal
  (§.2) → Task 1, Steps 2–4. ✅
- Client + Deno validators (§.4) → Task 1 Step 5 (client) + Task 2 Step 1 (Deno). ✅
- Dispatch (§.3) → Task 2 Step 3. ✅
- Seed module + regenerate, 3 categories, 6 scenarios (§.5) → Task 3 Step 1 (verbatim). ✅
- Referential integrity (suggested → category id) (§.6) → Task 3 Step 2. ✅
- Tests (§.6): component → Task 1; client validator → Task 1; Deno validator → Task 2;
  dispatch → Task 2; seed guard auto-covers once in Deno `LAB_KINDS` (Task 2 Step 1). ✅
- Not pre-reveal (Week 2) → Global Constraints; copy references the model freely. ✅
- DB-reset verification is manual → Task 3, Step 8. ✅
- "Ground & Scope" unchanged; ScenarioSorter untouched → nothing in the plan touches
  them. ✅

**Placeholder scan:** No TBD/TODO/"add error handling"/"similar to Task N". Code blocks
are complete; seed copy is verbatim. The one soft reference — "match the neighboring
prediction-sort test's import/assertion API" (Task 1 Step 6, Task 2 Step 2) — points at
a concrete existing test in the same file, not an unwritten one. ✅

**Type consistency:** `DelegationSortConfig` / `DelegationSortItem` / `categories:{id,label,desc}` /
`items:{id,scenario,suggested,rationale}` / `takeaway:{title,body}` / `placements:
Record<string,string>` / `recordLabSubmission(userId,{labId,transcript,status})` are
identical across the type def, component, tests, both validators, and the seed JSON. The
`suggested` field references a `categories[].id`, consistently everywhere. Union member
name `DelegationSortConfig` matches in `types.ts` and the `ModuleRenderer` narrowing. ✅

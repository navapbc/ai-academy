# Week 5 "Civic-Tech Stakes" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seed the two Week 5 Course 1 live-session activities — "Classify & Route" (1.04, `data-classifier`) and "Spot the Pattern" (1.12, `failure-spotter`) — reusing existing exercise kinds.

**Architecture:** Content-only. Both activities map onto exercise kinds already shipped and fully wired (validators client+Deno, `ModuleRenderer` dispatch, dispatch test, seed-guard test). Wire `week5` into the seed pipeline, add two `origin='course'` module rows to the JSON source of truth, regenerate the migration, and update the two tests that assert seeded content. No new component, union member, validator, or dispatch case.

**Tech Stack:** Content pipeline: `supabase/seed-data/course1-content.json` → `node scripts/generate-course1-seed.mjs` → `supabase/migrations/20260715040000_seed_course1_content.sql`. Tests: Vitest (Node 22); one node-env seed test + one DB-gated integration test.

## Global Constraints

- **Node 22 required** for `npm run lint` / `npm test` (jsdom `ERR_REQUIRE_ESM` on Node 20). Run `export NVM_DIR="$HOME/.nvm"; source "$NVM_DIR/nvm.sh"; nvm use 22` before any npm/npx; confirm `node -v` is v22.
- **Never hand-edit** `supabase/migrations/20260715040000_seed_course1_content.sql` — change the JSON and re-run the generator.
- **No code changes** — `data-classifier` and `failure-spotter` are existing, fully-wired kinds. Only the seed JSON, the generated migration, and two test files change.
- **Week 5 is NOT a pre-reveal week** (the "Claude, never LLM" rule is Weeks 0–1 only) — copy may reference the model directly.
- **Fixed uuid:** Week 5 = `c0000000-0000-4000-8000-000000000104` (minted in `20260715000000_course_structure.sql`).
- **Data taxonomy (verbatim, mirror the existing 1.4 exercise):** classes `["Public", "Internal", "Confidential", "Regulated (PII/PHI/CUI)"]`; tools ids `enterprise` / `local` / `consumer`.
- **Branch:** `feat/course1-weeks3-5` (already created off `feat/cohort-program-restructure`). Never commit to `main`. A pre-existing unstaged `package-lock.json` change exists — never stage it.

---

### Task 1: Seed the two Week 5 modules + referential-integrity test

**Files:**
- Modify: `supabase/seed-data/course1-content.json` (add `week5` to the `weeks` map; append two objects to `modules`)
- Create: `src/lib/course1Seed.week5.test.ts`
- Generated (do not hand-edit): `supabase/migrations/20260715040000_seed_course1_content.sql`

**Interfaces:**
- Consumes: the fixed `week5` uuid; the existing `data-classifier` / `failure-spotter` config shapes.
- Produces: two published `origin='course'` modules — `c1-w5-classify-route` (data-classifier) and `c1-w5-pattern-spotting` (failure-spotter) — assigned to `week5` at week_sort_order 0 and 1.

- [ ] **Step 1: Write the failing referential-integrity test `src/lib/course1Seed.week5.test.ts`**

```ts
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Guards Week 5 content coherence the generic lab validators do NOT check: a
// data-classifier item's `dataClass`/`tool` are validated as non-empty strings
// but not for membership in the config's own `classes`/`tools`. (failure-spotter's
// correctIndex range is already enforced by the shared checkMcOptions.)
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const seed = JSON.parse(
  readFileSync(join(ROOT, 'supabase', 'seed-data', 'course1-content.json'), 'utf8'),
);

type Obj = Record<string, unknown>;
const w5 = (seed.modules as Obj[]).filter((m) => (m.week as string) === 'week5');

describe('course1 Week 5 seed', () => {
  test('both Week 5 modules are present', () => {
    const ids = w5.map((m) => m.cell_id).sort();
    expect(ids).toEqual(['c1-w5-classify-route', 'c1-w5-pattern-spotting']);
  });

  test('data-classifier: every item dataClass ∈ classes and tool ∈ tool ids', () => {
    const m = w5.find((m) => (m.lab_config_json as Obj)?.kind === 'data-classifier');
    expect(m).toBeTruthy();
    const cfg = m!.lab_config_json as {
      classes: string[];
      tools: { id: string }[];
      items: { dataClass: string; tool: string }[];
    };
    const classSet = new Set(cfg.classes);
    const toolSet = new Set(cfg.tools.map((t) => t.id));
    expect(cfg.items.length).toBeGreaterThan(0);
    for (const it of cfg.items) {
      expect(classSet.has(it.dataClass)).toBe(true);
      expect(toolSet.has(it.tool)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
export NVM_DIR="$HOME/.nvm"; source "$NVM_DIR/nvm.sh"; nvm use 22
npx vitest run src/lib/course1Seed.week5.test.ts
```
Expected: FAIL — `expected [] to equal [ 'c1-w5-classify-route', 'c1-w5-pattern-spotting' ]` (no Week 5 modules seeded yet).

- [ ] **Step 3: Add `week5` to the `weeks` map in `supabase/seed-data/course1-content.json`**

In the top-level `"weeks": { … }` object, add the entry (after `"weeks34"`):
```json
"week5": "c0000000-0000-4000-8000-000000000104"
```
Mind the comma so the JSON stays valid.

- [ ] **Step 4: Append the two module objects to the `modules` array**

Add both as the last elements of `modules` (comma after the current last element):

```json
{
  "cell_id": "c1-w5-classify-route",
  "week": "week5",
  "week_sort_order": 0,
  "origin": "course",
  "visibility": "program",
  "title": "Classify & Route: What Goes Where?",
  "type": "lab",
  "dimension": ["Diligence"],
  "evidence_type": "performance-task",
  "sort_order": 941,
  "body_md": "Part of the Week 5 live session — run this in breakout rooms with your group. Before you route anything to a tool, you have to classify it. For each artifact below, pick its **data class**, then pick the **right tool** for that class (or no external tool at all). Be ready to defend each call in a sentence or two.",
  "lab_config_json": {
    "kind": "data-classifier",
    "tools": [
      { "id": "enterprise", "label": "Enterprise Claude (Nava-contracted, data-protected)" },
      { "id": "local", "label": "Local / no external AI tool" },
      { "id": "consumer", "label": "Consumer chatbot (e.g., personal ChatGPT)" }
    ],
    "classes": ["Public", "Internal", "Confidential", "Regulated (PII/PHI/CUI)"],
    "items": [
      {
        "text": "A Slack message that includes a client's name and a detail from their case.",
        "dataClass": "Regulated (PII/PHI/CUI)",
        "tool": "local",
        "why": "A client's name plus a case detail is regulated PII/PHI. It doesn't belong in any external tool — use a local/no-external path, or fully redact the identifiers first."
      },
      {
        "text": "A benefits determination letter with the name, address, and case number already redacted.",
        "dataClass": "Confidential",
        "tool": "enterprise",
        "why": "With the identifiers redacted, this drops to confidential program content. The Nava-contracted, data-protected tool is cleared for it; a consumer chatbot is not."
      },
      {
        "text": "A comment you're drafting on a public open-source pull request.",
        "dataClass": "Public",
        "tool": "enterprise",
        "why": "A comment headed for a public pull request is already public — safe for the approved tool, with no sensitive data to protect."
      },
      {
        "text": "An excerpt from a vendor solicitation that hasn't been publicly released yet.",
        "dataClass": "Confidential",
        "tool": "local",
        "why": "An unreleased solicitation is confidential until it's public — keep it in a local/no-external path; off-limits in external tools until release."
      },
      {
        "text": "An internal memo listing staff salaries and performance ratings.",
        "dataClass": "Regulated (PII/PHI/CUI)",
        "tool": "local",
        "why": "Salaries and performance ratings are personnel data — regulated and off-limits in external tools. Local/no-external only."
      },
      {
        "text": "A blog post draft written for publication on Nava's public site.",
        "dataClass": "Public",
        "tool": "enterprise",
        "why": "A draft written for Nava's public site is destined to be public — safe for the approved tool."
      }
    ]
  }
},
{
  "cell_id": "c1-w5-pattern-spotting",
  "week": "week5",
  "week_sort_order": 1,
  "origin": "course",
  "visibility": "program",
  "title": "Spot the Pattern: Four Ways AI Fails in Civic Tech",
  "type": "lab",
  "dimension": ["Discernment"],
  "evidence_type": "performance-task",
  "sort_order": 942,
  "body_md": "Part of the Week 5 live session. There are four failure shapes that matter most in civic tech. For each AI output below, name **which shape** it is and **what to do about it**. The core posture for all four: any of these surfacing is an **escalation event, not a quiet edit** — you flag it, you don't silently reword and move on.",
  "lab_config_json": {
    "kind": "failure-spotter",
    "items": [
      {
        "id": "eligibility",
        "artifactMd": "**Claude:** Yes — based on what you've described, you qualify for expedited SNAP benefits and should receive your first payment within 7 days.",
        "issue": {
          "prompt": "Which civic-tech failure shape is this?",
          "options": [
            "Wrong eligibility/benefits/legal guidance",
            "Audit-failing artifact",
            "Agency-policy bypass",
            "Vulnerable-population voice flattening"
          ],
          "correctIndex": 0,
          "why": "It hands a claimant a definitive eligibility determination — exactly the kind of wrong benefits/legal guidance that can cost someone benefits they're owed, or promise benefits they aren't."
        },
        "mitigation": {
          "prompt": "What's the right move?",
          "options": [
            "Escalate it as an incident — flag it, don't quietly edit and move on",
            "Quietly fix the wording and send it",
            "Ship it — the AI is usually right"
          ],
          "correctIndex": 0,
          "why": "Wrong eligibility guidance is an escalation event: flag it so a person reviews the determination. Quietly rewording hides that the model gave benefits guidance at all."
        }
      },
      {
        "id": "audit",
        "artifactMd": "**Claude:** The grantee met all closeout requirements and funds were properly expended.",
        "issue": {
          "prompt": "Which civic-tech failure shape is this?",
          "options": [
            "Wrong eligibility/benefits/legal guidance",
            "Audit-failing artifact",
            "Agency-policy bypass",
            "Vulnerable-population voice flattening"
          ],
          "correctIndex": 1,
          "why": "It states audit conclusions with no source documents, record numbers, or evidence — an artifact that won't survive an actual audit."
        },
        "mitigation": {
          "prompt": "What's the right move?",
          "options": [
            "Escalate it as an incident — flag it, don't quietly edit and move on",
            "Quietly fix the wording and send it",
            "Ship it — the AI is usually right"
          ],
          "correctIndex": 0,
          "why": "An artifact that can't be traced to evidence is an escalation event — flag it so the record gets built properly, don't paper over it."
        }
      },
      {
        "id": "policy-bypass",
        "artifactMd": "**Claude:** To move faster, you can approve the change yourself now and record the supervisor's sign-off afterward.",
        "issue": {
          "prompt": "Which civic-tech failure shape is this?",
          "options": [
            "Wrong eligibility/benefits/legal guidance",
            "Audit-failing artifact",
            "Agency-policy bypass",
            "Vulnerable-population voice flattening"
          ],
          "correctIndex": 2,
          "why": "It proposes skipping a required approval step — bypassing agency policy in the name of speed."
        },
        "mitigation": {
          "prompt": "What's the right move?",
          "options": [
            "Escalate it as an incident — flag it, don't quietly edit and move on",
            "Quietly fix the wording and send it",
            "Ship it — the AI is usually right"
          ],
          "correctIndex": 0,
          "why": "A suggested policy workaround is an escalation event — flag it; don't quietly follow or soften it into something that still skips the control."
        }
      },
      {
        "id": "voice-flattening",
        "artifactMd": "**Claude:** Most commenters supported the change; a few outliers raised access concerns that didn't reflect the general view.",
        "issue": {
          "prompt": "Which civic-tech failure shape is this?",
          "options": [
            "Wrong eligibility/benefits/legal guidance",
            "Audit-failing artifact",
            "Agency-policy bypass",
            "Vulnerable-population voice flattening"
          ],
          "correctIndex": 3,
          "why": "It flattens a vulnerable constituent's specific access concern into a dismissed 'outlier' — erasing the very voice the comment process exists to surface."
        },
        "mitigation": {
          "prompt": "What's the right move?",
          "options": [
            "Escalate it as an incident — flag it, don't quietly edit and move on",
            "Quietly fix the wording and send it",
            "Ship it — the AI is usually right"
          ],
          "correctIndex": 0,
          "why": "A flattened minority voice is an escalation event — flag it so the concern is represented, don't quietly keep the tidy summary that dropped it."
        }
      }
    ]
  }
}
```

- [ ] **Step 5: Validate JSON + run the referential test to green**

```bash
node -e "JSON.parse(require('fs').readFileSync('supabase/seed-data/course1-content.json','utf8')); console.log('JSON valid')"
npx vitest run src/lib/course1Seed.week5.test.ts
```
Expected: JSON valid; 2 tests PASS.

- [ ] **Step 6: Regenerate the migration**

```bash
node scripts/generate-course1-seed.mjs
```
Expected stdout: `Wrote …20260715040000_seed_course1_content.sql: 13 modules (12 week-assigned).` (was 11 / 10.)

- [ ] **Step 7: Verify the generated SQL contains both modules + membership rows**

```bash
grep -c "c1-w5-classify-route" supabase/migrations/20260715040000_seed_course1_content.sql
grep -c "c1-w5-pattern-spotting" supabase/migrations/20260715040000_seed_course1_content.sql
git diff --stat supabase/migrations/20260715040000_seed_course1_content.sql
```
Expected: each grep = `3` (comment + module INSERT + membership row); diff shows only insertions (plus the trailing-comma flip on the prior last membership row), no deletions.

- [ ] **Step 8: Seed-guard + lint**

```bash
npx vitest run supabase/functions/admin-content/admin-content-core.seed.test.ts
npm run lint
```
Expected: seed-guard green (it now validates the two new configs against the real CMS validators, since `data-classifier`/`failure-spotter` are in the Deno `LAB_KINDS`); lint clean.

- [ ] **Step 9: Commit**

```bash
git add supabase/seed-data/course1-content.json supabase/migrations/20260715040000_seed_course1_content.sql src/lib/course1Seed.week5.test.ts
git commit -m "feat(content): seed Week 5 civic-tech activities — classify & route (1.04) + spot the pattern (1.12)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Update the course-structure integration test

**Files:**
- Modify: `src/lib/courseStructure.integration.test.ts`

**Interfaces:**
- Consumes: the two seeded Week 5 modules from Task 1.
- Produces: nothing (test coverage only).

- [ ] **Step 1: Add the two Week 5 rows to the expected membership set**

In `src/lib/courseStructure.integration.test.ts`, the `expect(assigned).toEqual([...])`
block (the `.sort()`ed course_week_modules list), add the two Week 5 entries after the
`'Week 2:c1-w2-delegation-sort',` line:

```ts
        'Week 2:c1-w2-delegation-sort',
        'Week 5:c1-w5-classify-route',
        'Week 5:c1-w5-pattern-spotting',
```

- [ ] **Step 2: Update the accompanying comment**

Immediately above that `expect(assigned)...` block, the comment currently says Weeks 5+
stay empty shells. Replace it so it stays accurate:

```ts
    // U8 assigns the authored Course 1 content: Week 0 (public set-up), the two
    // Week-1 experiments + the Lookup-vs-Predict sort, Week 2 (Ground & Scope +
    // the Delegation sort), the four Weeks-3–4 pod activities, and Week 5 (Classify
    // & Route + Spot the Pattern). Weeks 6–7 and 8 stay empty shells (authored later
    // via the CMS).
```

(Find the existing comment beginning "U8 assigns the authored Course 1 content" and
replace it wholesale with the block above.)

- [ ] **Step 3: Verify against a live stack (Node 22)**

The `weeks?.[4].subtitle` assertion is unaffected — seeding modules does not set the
`course_weeks.subtitle` (Week 5's subtitle stays null, authored later via the CMS). Run
the full gated suite for this file against a fresh DB:

```bash
export NVM_DIR="$HOME/.nvm"; source "$NVM_DIR/nvm.sh"; nvm use 22
npx supabase db reset
eval "$(npx supabase status -o env | sed 's/^/export /')"
RUN_DB_TESTS=1 SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" VITE_SUPABASE_ANON_KEY="$ANON_KEY" VITE_SUPABASE_URL="${API_URL:-http://127.0.0.1:54321}" \
  npx vitest run src/lib/courseStructure.integration.test.ts
```
Expected: all tests PASS (the U8 seed-assertion now matches the 12 seeded course_week_modules, including the two Week 5 rows).

- [ ] **Step 4: Commit**

```bash
git add src/lib/courseStructure.integration.test.ts
git commit -m "test(course-structure): assert seeded Week 5 classify-route + pattern-spotting

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 5 (MANUAL — needs Docker + local Supabase stack; not run headless):**

```bash
npx supabase db reset      # applies the regenerated migration + seed
npm run dev                # sign in as demo@navapbc.com, open Course 1 → Week 5
```
Confirm both Week 5 modules render: "Classify & Route" (6 artifacts, each with a
data-class pick + a tool pick, auto-graded), and "Spot the Pattern" (4 artifacts, each
with a failure-shape pick + an escalation-move pick), and both auto-complete on submit.

---

## Self-Review

**Spec coverage:**
- Wire `week5` into the seed pipeline (§Architecture.1) → Task 1, Step 3. ✅
- Module 1 Classify & Route, data-classifier, 6 artifacts w/ classes+tools (§.2) → Task 1, Step 4 (verbatim). ✅
- Module 2 Spot the Pattern, failure-spotter, 4 items w/ issue+mitigation (§.3) → Task 1, Step 4 (verbatim). ✅
- Regenerate migration, count 13/12 (§.4) → Task 1, Step 6. ✅
- Referential-integrity seed test (data-classifier membership) (§Testing) → Task 1, Steps 1–2, 5. ✅
- Integration-test update + comment; subtitle assertion unaffected (§.5) → Task 2. ✅
- Seed-guard covers new configs automatically (§Testing) → Task 1, Step 8. ✅
- No code changes; content-only → nothing in the plan touches components/validators/dispatch. ✅
- DB-reset + click-through manual (§Verification not runnable headless) → Task 2, Step 5. ✅

**Placeholder scan:** No TBD/TODO/"add error handling"/"similar to Task N". All JSON + test code is complete and verbatim. ✅

**Type consistency:** `data-classifier` config uses `tools[]{id,label}` / `classes[]` / `items[]{text,dataClass,tool,why}`; `failure-spotter` uses `items[]{id,artifactMd,issue,mitigation}` with each MC `{prompt,options,correctIndex,why}` — matching `DataClassifierConfig` / `FailureSpotterConfig` / `FailureSpotterQuestion` in `types.ts`. Cell ids `c1-w5-classify-route` / `c1-w5-pattern-spotting`, the `week5` key, and the uuid `…104` are identical across the seed JSON, the referential test, and the integration test. ✅

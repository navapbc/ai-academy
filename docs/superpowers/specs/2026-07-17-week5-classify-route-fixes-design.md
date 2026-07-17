# Week 5: Classify & Route fixes (redaction trap, blog-draft class, policy framing, tool labels)

**Date:** 2026-07-17
**Branch:** `feat/week5-classify-route-fixes` (stacked off `feat/week2-resources-and-groundscope`)
**Status:** Approved design, pending implementation plan

## Problem

Reviewing the Week 5 live-session run-of-show ("What's dangerous to put in, and
what's dangerous to get out") against the seeded content found the
**Pattern-Spotting** activity (`c1-w5-pattern-spotting`) fully aligned (no
change), but the **Classify & Route** activity (`c1-w5-classify-route`) has three
content problems and a taxonomy mismatch:

1. **The redaction item teaches the misconception the session exists to break.**
   The deck's highest-value teaching point is the "redaction trap": *redaction is
   not reclassification.* Its item #2 ("a 'redacted' benefits letter") is
   intended as **Confidential/treat-as-Regulated → no tool by default, check the
   contract**, with the watch-for "most groups will call it safe. Do not skip it."
   The seeded academy item #2 does the opposite: a "benefits letter with the
   name, address, and case number already redacted" is marked **Confidential →
   managed tool (safe)**, with the rationale "With the identifiers redacted, this
   drops to confidential program content. The Nava-contracted tool is cleared for
   it." That is the trap, taught as the correct answer — and it skews
   **over-permissive**, the dangerous direction for a government contractor.

2. **The blog-draft item collapses the "will be public ≠ is public" nuance.**
   Deck #6: a not-yet-posted draft is **Internal** (low sensitivity). Academy #6:
   a blog draft for Nava's public site is **Public**, rationale "destined to be
   public — safe" — the exact reasoning the deck flags as the subtle error.

3. **Draft guidance is presented as settled policy.** The deck is emphatic:
   "Nava is developing guidance… **This is not a published policy at this time**,"
   and repeatedly stresses *your contract's rules supersede* and *when in doubt,
   no tool*. The seeded module gives confident single-correct answers with none
   of that framing.

4. **Tool taxonomy mismatch.** The deck names three tiers (Managed all-staff;
   On-request via Eden; Pilot/consumer/unsanctioned). The academy's
   `data-classifier` offers "Enterprise Claude", "Local / no external AI tool",
   "Consumer chatbot". Decision (made): keep the three-option format (it fits the
   single-correct-answer sort) but relabel to the deck's vocabulary; skip the
   Eden middle tier (its answers are "yes if contract permits" — awkward for a
   single-answer sort and it doesn't change these six items' outcomes).

## Constraints

- **Content-as-data pipeline (unchanged).** Source of truth is
  `supabase/seed-data/course1-content.json`; the migration
  `supabase/migrations/20260715040000_seed_course1_content.sql` is **generated**
  by `scripts/generate-course1-seed.mjs` — never hand-edit it.
- **Only `c1-w5-classify-route` changes.** Do not touch `c1-w5-pattern-spotting`
  or any other module.
- `data-classifier` shape (from `src/types.ts` / the seed): top-level `tools`
  (`{id,label}[]`), `classes` (`string[]`), and `items`
  (`{text, dataClass, tool, why}[]`). `dataClass` must be one of `classes`;
  `tool` must be one of the `tools` ids. **Keep the tool ids** (`enterprise`,
  `local`, `consumer`) so existing item `tool` references stay valid — change
  only the labels.
- Week 5 is post-reveal and `program`-gated; LLM/token language is fine.
- Node 22 for `npm test`/`lint`. Base off `feat/week2-resources-and-groundscope`
  (stacks on the Week 1 + Week 2 work), not `main`.
- `body_md` must not contain the literal `$md$`. `course1-content.json` is
  hand-authored — edit with exact string replacement; do not re-serialize.

## Design

All edits are inside the `c1-w5-classify-route` module.

### 1. Relabel the three tools (ids unchanged)

| id (unchanged) | old label | new label |
| --- | --- | --- |
| `enterprise` | Enterprise Claude (Nava-contracted, data-protected) | **Managed all-staff tool (Claude / Gemini / Copilot)** |
| `local` | Local / no external AI tool | **No tool / local (no external AI)** |
| `consumer` | Consumer chatbot (e.g., personal ChatGPT) | **Unsanctioned / consumer tool (e.g., personal ChatGPT)** |

### 2. Fix item #2 — the redaction trap

- `dataClass`: `Confidential` → **`Regulated (PII/PHI/CUI)`**
- `tool`: `enterprise` → **`local`**
- `why` → new: "Redaction is not reclassification. Removing the name doesn't make
  the rest safe — leftover details can still be linkable, and visible redactions
  can be reversed by a determined actor. Treat it as regulated: no external tool
  by default, and check the contract before using even a managed tool."
- `text` unchanged ("A benefits determination letter with the name, address, and
  case number already redacted.") — the point is that *already redacted* ≠ safe.

### 3. Fix item #6 — blog draft

- `dataClass`: `Public` → **`Internal`**
- `tool`: unchanged (`enterprise` — Internal is cleared for the managed all-staff
  tool)
- `why` → new: "A draft isn't public until it's actually posted — \"will be
  public\" is not \"is public.\" It's Internal for now (low sensitivity), so the
  managed all-staff tool is fine, but don't treat unpublished work as already
  cleared."

### 4. Add the "not published policy" framing to `body_md`

Append a short paragraph after the existing intro:

> **A note on this guidance:** Nava's data-class guidance is still being
> developed — treat it as a way to reason about what's safe to share, not as
> published policy. Your contract's rules always supersede it, and when you're
> unsure what class something is, the safe move is **no external tool** until you
> confirm with your program lead.

### Items left unchanged (answers already correct/safe)

- #1 Slack client name + case detail → `Regulated (PII/PHI/CUI)` / `local` ✓
- #3 public open-source PR comment → `Public` / `enterprise` ✓
- #4 unreleased vendor solicitation → `Confidential` / `local` ✓
- #5 internal salary + performance memo → **kept conservative** at
  `Regulated (PII/PHI/CUI)` / `local`. The deck files personnel data as
  Confidential-managed-OK, but over-restriction is the safe direction and
  matches the fix in #2; intentionally not loosened.

Their `why` strings are tool-label-agnostic (none name the old labels verbatim),
so they need no edits.

### Pattern-Spotting — no change

`c1-w5-pattern-spotting` is fully aligned with the deck (four shapes, escalation
posture) and is not touched.

## Out of scope

The deck's/Mural artifact set matches the academy after these fixes (#2 and #6
were the only divergences), so no Week 5 deck rewording is required.

## Data flow

1. Edit `course1-content.json`: relabel `tools` in `c1-w5-classify-route`; edit
   items #2 and #6 (class/tool/why); append the framing paragraph to `body_md`.
2. `node scripts/generate-course1-seed.mjs` → regenerates the migration.
   Expected: `17 modules (12 week-assigned).` (count unchanged — edits only).
3. `npm run lint && npm test` (Node 22).
4. Optional: `npx supabase db reset` applies cleanly.

## Testing

- **Generator validation** is the first gate (a `dataClass` not in `classes` or a
  `tool` id not in `tools` would be a data error caught by app/lab validation;
  the generator emits it and the lab-validation tests exercise the
  `data-classifier` shape).
- **No existing test asserts these specific answers.** `src/lib/course1Seed.week5.test.ts`
  checks (a) both Week 5 modules present by `cell_id` (unchanged) and (b) every
  data-classifier item's `dataClass` ∈ `classes` and `tool` ∈ tool ids. My new
  values stay within the existing `classes` (`Regulated (PII/PHI/CUI)`, `Internal`)
  and keep the tool ids (`local`, `enterprise`), so this test stays green — it
  validates membership, not the chosen answer. `courseStructure.integration.test.ts`
  (membership by `cell_id`, DB-gated) is unaffected, and the generic
  `data-classifier` shape validators (`src/lib/labValidation.ts` and its tests)
  are satisfied because the `{text, dataClass, tool, why}` shape is preserved. No
  test edits needed.
- **Migration re-run** must apply cleanly (`ON CONFLICT DO NOTHING`).
- No new exercise kind, no renderer/type/component changes.

## Success criteria

- Item #2 teaches "redaction is not reclassification" (Regulated / no external
  tool), not the trap.
- Item #6 is Internal with the "will be public ≠ is public" nuance.
- `body_md` carries the "developing guidance / contract supersedes / when unsure,
  no tool" framing.
- Tool labels match the deck's vocabulary; ids unchanged; all item `tool`
  references still resolve.
- Pattern-Spotting untouched. Generator clean; `lint` + `test` green; migration
  re-applies idempotently.

# Design — Week 5 "What's dangerous to put in / get out" (civic-tech stakes)

- **Date:** 2026-07-17
- **Branch:** `feat/course1-weeks3-5` (off `feat/cohort-program-restructure`)
- **Scope:** Two new seeded Week 5 modules (no code changes). Wires Week 5 into the
  Course 1 content pipeline. Weeks 3–4 are already fully seeded and out of scope.
- **Skills mapped:** 1.04 (data classes + approved-tool routing / privacy hygiene) and
  1.12 introduction (the four civic-tech failure shapes + escalate-don't-quietly-edit
  posture).

## Problem

Week 5 of Course 1 is the civic-tech stakes live session. The course/week *shell*
exists (`course_weeks` row "Week 5", uuid `c0000000-0000-4000-8000-000000000104`,
seeded empty in `20260715000000_course_structure.sql`), but no content is assigned and
`week5` isn't in the seed pipeline's `weeks` map yet. The program outline calls for two
platform activities:

1. **Classify-and-route (1.04)** — sort ~6 mixed artifacts by Nava data class and pick
   the right approved tool (or "no tool"); defend each.
2. **Pattern-spotting intro (1.12)** — for one AI output per civic-tech failure shape,
   name which of the four shapes it is and the escalation move.

## Approach (decided in brainstorming): reuse existing kinds, content-only

Both activities map onto exercise kinds already shipped and fully wired (client + Deno
validators, `ModuleRenderer` dispatch, dispatch test, seed-guard test):

- **Classify-and-route → `data-classifier`** (`{ tools, classes, items[]{text, dataClass,
  tool, why} }`) — the learner picks a data class AND a tool per item; both auto-graded.
- **Pattern-spotting → `failure-spotter`** (`{ items[]{id, artifactMd, issue, mitigation} }`,
  each of `issue`/`mitigation` a `{ prompt, options, correctIndex, why }` MC) — two picks
  per artifact: which failure shape, and what to do.

So this is a **content-only** change: two new `origin='course'` module rows + wiring +
a test update. No new component, union member, validator, or dispatch case.

Deliberately **new course modules**, not a reassignment of the matrix cells 1.4/1.12:
those are standalone *supplemental* lessons (public visibility, quiz-based, non-cohort
framing) that live in "Supplemental coursework." Week 5 gets fresh, cohort-framed
`origin='course'` modules, consistent with how Weeks 0–4 were built.

## Architecture

### 1. Wire Week 5 into the seed pipeline — `supabase/seed-data/course1-content.json`

Add to the `weeks` uuid map:
```json
"week5": "c0000000-0000-4000-8000-000000000104"
```
(The uuid is the fixed one minted in `20260715000000_course_structure.sql`.)

### 2. Module 1 — "Classify & Route" (1.04, `data-classifier`)

| Field | Value |
|---|---|
| `cell_id` | `c1-w5-classify-route` |
| `week` / `week_sort_order` | `week5` / `0` |
| `origin` / `visibility` | `course` / `program` |
| `title` | `Classify & Route: What Goes Where?` |
| `type` | `lab` |
| `dimension` | `["Diligence"]` |
| `evidence_type` | `performance-task` |
| `sort_order` | `941` |
| `body_md` | Framing: part of the Week 5 live session; classify each artifact before you route it. |
| `lab_config_json` | `data-classifier` (below) |

`classes` (mirror the established taxonomy): `["Public", "Internal", "Confidential",
"Regulated (PII/PHI/CUI)"]`

`tools` (mirror the established set):
- `{ id: "enterprise", label: "Enterprise Claude (Nava-contracted, data-protected)" }`
- `{ id: "local", label: "Local / no external AI tool" }`
- `{ id: "consumer", label: "Consumer chatbot (e.g., personal ChatGPT)" }`

`items` (6; each `{ text, dataClass, tool, why }`):

| # | text | dataClass | tool | why (summary) |
|---|---|---|---|---|
| 1 | A Slack message that includes a client's name and a detail from their case. | Regulated (PII/PHI/CUI) | local | Client name + case detail is regulated PII/PHI — keep it out of any external tool; use a local/no-external path or fully redact first. |
| 2 | A benefits determination letter with the name, address, and case number already redacted. | Confidential | enterprise | Redaction lowers the class to confidential program content — the Nava-contracted, data-protected tool is cleared for it; a consumer chatbot is not. |
| 3 | A comment you're drafting on a public open-source pull request. | Public | enterprise | Already destined to be public — safe for the approved tool; no sensitivity to protect. |
| 4 | An excerpt from a vendor solicitation that hasn't been publicly released yet. | Confidential | local | Unreleased solicitations are off-limits in external tools until public — keep it local/no-external. |
| 5 | An internal memo listing staff salaries and performance ratings. | Regulated (PII/PHI/CUI) | local | Personnel data is regulated and off-limits in external tools — local/no-external only. |
| 6 | A blog post draft written for publication on Nava's public site. | Public | enterprise | Intended for public release — safe for the approved tool. |

### 3. Module 2 — "Spot the Pattern" (1.12, `failure-spotter`)

| Field | Value |
|---|---|
| `cell_id` | `c1-w5-pattern-spotting` |
| `week` / `week_sort_order` | `week5` / `1` |
| `origin` / `visibility` | `course` / `program` |
| `title` | `Spot the Pattern: Four Ways AI Fails in Civic Tech` |
| `type` | `lab` |
| `dimension` | `["Discernment"]` |
| `evidence_type` | `performance-task` |
| `sort_order` | `942` |
| `body_md` | Framing: intro to the four failure shapes; for each AI output, name the shape and the move. The core posture: any of these is an escalation event, not a quiet edit. |
| `lab_config_json` | `failure-spotter` (below) |

The four failure-shape labels are reused verbatim as the `issue` options for every item
(so the learner classifies into the same fixed set each time):
- `Wrong eligibility/benefits/legal guidance`
- `Audit-failing artifact`
- `Agency-policy bypass`
- `Vulnerable-population voice flattening`

The `mitigation` options are the same fixed set for every item, correct = escalate:
- `Escalate it as an incident — flag it, don't quietly edit and move on` *(correct)*
- `Quietly fix the wording and send it`
- `Ship it — the AI is usually right`

`items` (4; each `{ id, artifactMd, issue, mitigation }`):

| # | id | artifactMd (short AI output) | issue.correct | mitigation.correct |
|---|---|---|---|---|
| 1 | eligibility | "Yes — based on what you've described, you qualify for expedited SNAP benefits and should receive them within 7 days." (the stated facts don't actually meet the rule) | Wrong eligibility/benefits/legal guidance | escalate |
| 2 | audit | A grant-closeout summary that states compliance conclusions but cites no source documents or record numbers. | Audit-failing artifact | escalate |
| 3 | policy-bypass | "To speed this up, you can approve the change yourself and note the supervisor sign-off retroactively." | Agency-policy bypass | escalate |
| 4 | voice-flattening | A public-comment summary that drops a limited-English speaker's specific access concern as an "outlier." | Vulnerable-population voice flattening | escalate |

Each `issue.why` names why that shape fits; each `mitigation.why` reinforces
escalate-don't-quietly-edit.

### 4. Regenerate the migration

`node scripts/generate-course1-seed.mjs` → regenerates
`supabase/migrations/20260715040000_seed_course1_content.sql` (GENERATED — never
hand-edited). Week 5 is **not** a pre-reveal week (the "Claude, never LLM" rule is
Weeks 0–1 only). Expected count after: **13 modules (12 week-assigned)** (was 11/10).

### 5. Update the integration test — `src/lib/courseStructure.integration.test.ts`

The U8 seed-assertion deep-equals the full `course_week_modules` set. Add the two new
rows to the expected list (this is the exact gap that broke the `db-tests` CI job when
Weeks 1/2 modules were added):
```
'Week 5:c1-w5-classify-route',
'Week 5:c1-w5-pattern-spotting',
```
Update the accompanying comment (Weeks 5+ are no longer all empty shells — Week 5 now
has content; Weeks 6–7 and 8 remain empty). The `weeks?.[4].subtitle` assertion is
unaffected — seeding modules does not set the `course_weeks.subtitle` (still null,
authored later via the CMS).

## Testing

- **Generator**: `node scripts/generate-course1-seed.mjs` runs clean (validates the two
  new rows, including `data-classifier`/`failure-spotter` field shapes via the shared
  generator validation) and reports 13 modules / 12 week-assigned.
- **Seed guard** (`admin-content-core.seed.test.ts`): already validates every seeded
  `lab_config_json` against the CMS validators — it now covers the two new configs with
  no test edit (both kinds are in the Deno `LAB_KINDS`).
- **Course-structure integration test**: updated expected list; run under Node 22 with
  `RUN_DB_TESTS=1` + a fresh `db reset` + service/anon keys from `supabase status -o env`.
- **Referential-integrity seed test** — a focused node-env test
  (`src/lib/course1Seed.week5.test.ts`), mirroring the Week 2
  `course1Seed.delegation.test.ts`: for the `data-classifier` module, assert every
  item's `dataClass` ∈ `classes` and `tool` ∈ `tools[].id`. (The shared validators check
  those fields are non-empty strings but NOT membership, so this is the real gap worth a
  guard. `failure-spotter`'s `correctIndex` range is already enforced by the shared
  `checkMcOptions`, so it needs no extra assertion.)
- `npm run lint` / `npm test` (Node 22).

### Verification not runnable headless

`npx supabase db reset` + a click-through of Week 5 in the running app (both activities
render, submit, auto-complete) is a manual step.

## Out of scope

- Weeks 3–4 (already fully seeded — 4 pod activities).
- The 1.04 / 1.12 concept *teaching* (facilitator slides), consistent with Weeks 1–2.
- Weeks 6–7 pod deep-dive of the four patterns, and Week 8.
- Any change to matrix cells 1.4 / 1.12 or the `data-classifier` / `failure-spotter`
  components.

---
title: "feat: PII reminder guardrail at Claude-call input surfaces (P6.3)"
type: feat
status: active
date: 2026-07-02
origin: docs/brainstorms/p6.3-pii-guardrail-requirements.md
---

# feat: PII reminder guardrail at Claude-call input surfaces (P6.3)

## Overview

Add a single shared, reusable **PII reminder notice** and place it at every learner free-text input surface whose content is sent to Claude. Warn-and-teach only — no scanning, no blocking, no acknowledgment gate, no effect on the model-call path. Built shared so P6.6 (submissions/reflections) can reuse it (see origin: `docs/brainstorms/p6.3-pii-guardrail-requirements.md`).

## Problem Frame

Learners paste text into hands-on labs that goes to Claude; there's no reminder not to include real client/constituent PII. This is an AI-literacy app, so a consistent teaching reminder is the highest-value, lowest-carrying-cost intervention. Real PII can't be reliably detected, so scanning/blocking is out (decided in brainstorm).

## Requirements Trace

- R1. One shared, reusable PII-reminder notice component with consistent teaching copy ("don't paste real client/constituent data; use fake/sample data").
- R2. Surface it at every learner free-text input whose content reaches Claude — via `streamChat` (chat) or the `/grade` submission path.
- R3. Structured for reuse so P6.6 can drop it onto submission/reflection surfaces unchanged.
- R4. Zero effect on the model-call path — presentational only; no gating, no new network calls, no persistence.

## Scope Boundaries

- No content scanning / PII detection.
- No blocking, no acknowledgment gate/persistence.
- No Edge-Function change.
- P6.6 submission/reflection **enforcement** and placement on those surfaces is a separate task (this only builds the shared notice + places it on the Claude-call surfaces).

## Context & Research

### Relevant Code and Patterns
- **Claude-call surfaces** (grep `streamChat`): `src/components/Lab.tsx` (config-driven lab container; input textarea ~line 219), `src/components/Playground.tsx`, `src/components/LocalTutorFAB.tsx`, `src/components/exercises/{VoiceEdit,PromptEval,IterationLab,PairedCalibration}.tsx`.
- **Grade-path free-text surfaces** (learner text judged by Claude): the critique/synthesis labs (via `SourcedFreeTextLab` if present) and any exercise that submits free text to `/grade` (`src/lib/grading.ts`). Enumerate precisely in Unit 2.
- No existing notice/callout primitive — create one. Styling: match the repo's Tailwind v4 conventions used in existing exercise components (small bordered `role="note"` block).
- **Branding:** `src/branding.ts` (`BRANDING`, `injectBranding`) — copy may reference the org name via `BRANDING.name` if desired; static copy is acceptable.
- **Test conventions:** component tests use `// @vitest-environment jsdom`.

### Institutional Learnings
- No `docs/solutions/`. Accessibility: keep the notice non-intrusive and screen-reader friendly. Note: W2-9 established `role="status"`/`aria-live` for *live status* regions — not applicable to a static reminder. `role="note"` is a non-standard ARIA role with inconsistent AT support, so the notice is a plain always-present block (text read in normal document order), no non-standard role.

## Key Technical Decisions
- **One shared presentational component** (`PiiNotice`) placed per surface, not copy-pasted text — consistency + P6.6 reuse.
- **Warn-and-teach, static copy** — no props required beyond optional `className`/placement variant; no logic.
- Placement near each input (above the textarea / submit control), unobtrusive.

## Open Questions

### Resolved During Planning
- Enforcement/trigger/scope — settled in brainstorm (warn-only, reminder-only, shared).

### Deferred to Implementation
- Final exact surface list for the `/grade` free-text labs (critique/synthesis) — confirm the shared container (`SourcedFreeTextLab`) vs. per-component placement while wiring Unit 2.
- Final copy wording + whether to use `BRANDING.name` vs. generic "your organization".

## Implementation Units

- [ ] **Unit 1: Shared `PiiNotice` component**

**Goal:** One reusable, accessible PII-reminder notice.

**Requirements:** R1, R3, R4

**Dependencies:** None.

**Files:**
- Create: `src/components/PiiNotice.tsx`
- Test: `src/components/PiiNotice.test.tsx` (jsdom)

**Approach:**
- Small presentational component: a bordered `role="note"` block with a short icon/label + teaching copy ("Reminder: don't paste real client or constituent data — names, SSNs, case numbers, addresses. Use fake or sample data; protecting real data is part of using AI responsibly."). Optional `className` prop for placement tweaks. No state, no effects, no network.
- Keep copy in one place so all surfaces stay consistent (and P6.6 reuses it).

**Patterns to follow:** existing exercise-component Tailwind styling; `role="note"` a11y precedent (W2-9).

**Test scenarios:**
- Happy path: renders the reminder text and has `role="note"` (accessible).
- Edge: applies a passed `className`.

**Verification:** Component renders the notice; jsdom test green.

- [ ] **Unit 2: Place `PiiNotice` on Claude-call input surfaces**

**Goal:** The reminder appears at every learner input whose content reaches Claude.

**Requirements:** R2, R4

**Dependencies:** Unit 1.

**Files:**
- Modify: `src/components/Lab.tsx`, `src/components/Playground.tsx`, `src/components/LocalTutorFAB.tsx`
- Modify: `src/components/exercises/{VoiceEdit,PromptEval,IterationLab,PairedCalibration}.tsx`, and the critique/synthesis free-text surface (`SourcedFreeTextLab` or the specific components) — confirm exact set by grepping `streamChat` and the `/grade` submission inputs.
- Test: extend the nearest existing component tests (e.g. `src/components/Lab.test.tsx`) to assert the notice renders on a representative surface; add assertions where cheap.

**Approach:**
- Import and render `<PiiNotice />` near each input control (above the textarea / near submit). Non-blocking, always visible. No behavior change to submit/stream logic.
- Prefer placing it once in shared containers (`Lab`, `SourcedFreeTextLab`) to cover multiple cells, plus the standalone exercise inputs and Playground/tutor.

**Test scenarios:**
- Happy path: the Lab surface renders `PiiNotice` above its prompt textarea.
- Integration: rendering a representative free-text exercise shows the notice; submitting still calls `streamChat`/grade unchanged (no regression in existing submit tests).
- Edge: the notice does not intercept or alter input/submit (purely presentational).

**Verification:** Every enumerated Claude-call surface shows the reminder; existing lab/exercise submit tests stay green; full suite + lint pass.

## System-Wide Impact
- **Interaction graph:** Purely additive UI; no change to `streamChat`/grade call paths.
- **API surface parity:** All learner→Claude input surfaces get the same notice; any future such surface should include it.
- **Unchanged invariants:** Model-call behavior, submission/grading, gating — all untouched. No persistence, no network.

## Risks & Dependencies
| Risk | Mitigation |
|------|------------|
| Notice missed on some surface (incomplete coverage) | Enumerate via `streamChat` + `/grade` grep in Unit 2; place in shared containers where possible |
| Notice becomes visual noise | Small, unobtrusive `role="note"`; single consistent component |
| Overlap/confusion with P6.6 | Shared component; P6.6 reuses it for submission/reflection surfaces (separate task) |

## Documentation / Operational Notes
- Update PROJECT-PLAN P6.3 status on merge; note P6.6 will reuse `PiiNotice`.

## Sources & References
- **Origin document:** [docs/brainstorms/p6.3-pii-guardrail-requirements.md](docs/brainstorms/p6.3-pii-guardrail-requirements.md)
- Patterns: `src/components/Lab.tsx`, `src/components/Playground.tsx`, `src/components/exercises/*`, `src/branding.ts`, `src/lib/llm.ts`, `src/lib/grading.ts`

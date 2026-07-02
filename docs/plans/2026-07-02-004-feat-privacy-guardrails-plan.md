---
title: "feat: PII reminder on persist-to-DB submission surfaces (P6.6)"
type: feat
status: active
date: 2026-07-02
origin: docs/brainstorms/p6.6-privacy-guardrails-requirements.md
---

# feat: PII reminder on persist-to-DB submission surfaces (P6.6)

## Overview

Extend the shared `PiiNotice` (from P6.3) to the learner free-text surfaces that persist to `lab_submissions` but don't call Claude, so **every** learner free-text capture point carries the "don't paste real PII" reminder. Teach-only — no scanning, no blocking (consistent with the P6.3 decision; see origin: `docs/brainstorms/p6.6-privacy-guardrails-requirements.md`).

## Problem Frame

Reflections, portfolio, and failure-log surfaces save learner free-text to the DB (champion/admin-readable) without going through Claude, so P6.3 didn't cover them. This is the highest-value place to remind learners not to store real client/constituent PII.

## Requirements Trace
- R1. Place the shared `PiiNotice` on the persist-to-DB free-text surfaces: **ReflectionCapture** (1.8/1.11), **FailureLog** (2.9), **UseCasePortfolio** (2.11). (`SignoffChecklist` is checkbox-only — no free-text — so it's excluded.)
- R2. Reuse the existing `src/components/PiiNotice.tsx` unchanged; teach-only, no scan/block/gate.
- R3. Purely presentational — no change to save/record/gating logic.

## Scope Boundaries
- Teach-only; no PII scanning/blocking/acknowledgment (consistent with P6.3).
- Only the three persist free-text surfaces above; Claude-call surfaces already covered by P6.3; `SignoffChecklist` excluded (checkbox-only).
- No change to `PiiNotice`, storage, or RLS.

## Context & Research

### Relevant Code and Patterns
- `src/components/PiiNotice.tsx` — the shared component (P6.3), single source of truth for the copy.
- Placement pattern from P6.3: `<PiiNotice />` rendered above the input, e.g. `src/components/exercises/SourcedFreeTextLab.tsx`.
- Target surfaces (confirmed to have free-text inputs): `src/components/exercises/ReflectionCapture.tsx` (1 textarea), `src/components/exercises/FailureLog.tsx` (2 inputs), `src/components/exercises/UseCasePortfolio.tsx` (4 inputs). `SignoffChecklist.tsx` has 0 free-text inputs → excluded.
- Test conventions: jsdom component tests (`// @vitest-environment jsdom`); existing tests `FailureLog`/`UseCasePortfolio` ready-logic tests + component tests.

## Key Technical Decisions
- Reuse `PiiNotice` unchanged (consistency + single source of truth); teach-only per P6.3.
- Exclude `SignoffChecklist` (checkbox-only; negligible PII risk; adding a data-privacy notice there would be noise).

## Open Questions
### Resolved During Planning
- Enforcement level (teach-only) — from brainstorm.
- `SignoffChecklist` inclusion — excluded (checkbox-only, verified 0 free-text inputs).

### Deferred to Implementation
- Exact placement per surface (above the primary entry field), matching each component's layout.

## Implementation Units

- [ ] **Unit 1: Place `PiiNotice` on the three persist free-text surfaces**

**Goal:** The PII reminder appears on reflections, failure-log, and portfolio entry surfaces.

**Requirements:** R1, R2, R3

**Dependencies:** None (PiiNotice already exists).

**Files:**
- Modify: `src/components/exercises/ReflectionCapture.tsx`, `src/components/exercises/FailureLog.tsx`, `src/components/exercises/UseCasePortfolio.tsx`
- Test: extend the nearest existing component tests (e.g. `src/components/exercises/UseCasePortfolio` / `FailureLog` component tests, or add a small render assertion) to confirm the notice renders; keep existing ready/gating tests green.

**Approach:**
- Import and render `<PiiNotice />` near the primary free-text input on each of the three components (above the textarea/entry form), matching P6.3 placement. No change to save/record/ready-gating logic.

**Patterns to follow:** `src/components/exercises/SourcedFreeTextLab.tsx` (P6.3 placement); `src/components/PiiNotice.tsx`.

**Test scenarios:**
- Happy path: each of the three surfaces renders the PII reminder text near its input.
- Integration: submitting/recording still works unchanged (existing ready-gating tests stay green); the notice is presentational only.
- Edge: the notice doesn't intercept input or alter the entry/gating behavior.

**Verification:** All three surfaces show the reminder; existing exercise tests stay green; full suite + lint pass.

## System-Wide Impact
- **Interaction graph:** additive UI only; no change to save/record/gating.
- **API surface parity:** together with P6.3, all learner free-text capture points (Claude-call and persist-to-DB) now carry the reminder; any new such surface should include it.
- **Unchanged invariants:** storage, RLS, ready-gating, `PiiNotice` component — all untouched.

## Risks & Dependencies
| Risk | Mitigation |
|------|------------|
| Notice missed on a persist surface | Enumerated the three free-text surfaces; SignoffChecklist excluded (verified checkbox-only) |
| Visual noise | Small, consistent shared component; one per surface |

## Documentation / Operational Notes
- Update PROJECT-PLAN P6.6 on merge; note P6.3+P6.6 together cover all learner free-text capture points (teach-only).

## Sources & References
- **Origin document:** [docs/brainstorms/p6.6-privacy-guardrails-requirements.md](docs/brainstorms/p6.6-privacy-guardrails-requirements.md)
- Patterns: `src/components/PiiNotice.tsx`, `src/components/exercises/SourcedFreeTextLab.tsx`, `src/components/exercises/{ReflectionCapture,FailureLog,UseCasePortfolio}.tsx`

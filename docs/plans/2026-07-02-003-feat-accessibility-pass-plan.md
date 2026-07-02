---
title: "feat: Automated a11y pass — jsx-a11y (error) + axe + 508/WCAG audit doc (P6.4)"
type: feat
status: active
date: 2026-07-02
origin: docs/brainstorms/p6.4-accessibility-pass-requirements.md
---

# feat: Automated a11y pass — jsx-a11y (error) + axe + 508/WCAG audit doc (P6.4)

## Overview

Establish an automated accessibility floor and remediate everything it detects: add the `jsx-a11y` eslint plugin at **error** severity and fix all violations app-wide; add automated **axe** assertions over the key surfaces and fix all violations; and produce a **508/WCAG 2.1 AA audit document** that marks each criterion automated-verified / fixed / needs-manual. The manual screen-reader + keyboard 508 verification is explicitly a **human follow-up** (the pipeline can't verify assistive-tech UX) — the audit doc enumerates it (see origin: `docs/brainstorms/p6.4-accessibility-pass-requirements.md`).

## Problem Frame

Internal gov-adjacent training app → Section 508 / WCAG 2.1 AA matters. Prior a11y work (W2-9) exists in spots, but there's no automated a11y tooling (no `jsx-a11y`, no axe). Automated tools catch ~30–40% of WCAG; the rest is human. This task delivers the automatable maximum + a truthful audit artifact; it does not claim 508 certification.

## Requirements Trace

- R1. Add `jsx-a11y` eslint plugin to the flat config at **error**; `npm run lint` fails on any a11y violation.
- R2. Fix every jsx-a11y violation across the codebase (eslint-disable only with a documented, justified reason).
- R3. Add automated **axe** assertions over the key surfaces (component-level in vitest/jsdom) with zero violations on covered surfaces.
- R4. Produce `docs/accessibility/508-wcag-audit.md`: WCAG 2.1 AA checklist (automated-pass / fixed / needs-manual) + the explicit manual follow-up list.

## Scope Boundaries
- **Manual SR/keyboard 508 verification is a human task** — documented, not part of "done" for this merge.
- Not a visual redesign; fixes are a11y-correctness (labels, roles, alt, focus, name/role/value), not restyling.
- Contrast: fix what axe flags; subjective/edge contrast goes on the manual list.
- Axe covers **key representative surfaces**, not literally every component (see Unit 2 list); jsx-a11y (static) covers all JSX.

## Context & Research

### Relevant Code and Patterns
- **eslint flat config**: `eslint.config.*` (repo uses flat config; `npm run lint` = `tsc --noEmit && eslint .`). Add `eslint-plugin-jsx-a11y`'s flat recommended config + escalate to error.
- **Test setup**: vitest; component tests opt into jsdom via `// @vitest-environment jsdom`; `src/test/setup.ts` is the shared setup. Use `vitest-axe` (jsdom-compatible axe matcher) for R3; register its matcher in setup.
- **Prior a11y patterns (W2-9)**: `aria-live`/`role="status"`/`sr-only` (~114 usages) — e.g. Lab grading status, HarmRubric sr-only correctness, focus management on view change. Mirror these; don't regress.
- **Key surfaces to axe-cover (representative)**: `src/components/Login.tsx`, the `Academy`/app shell + `Sidebar`, `ModuleRenderer` (a content lesson + a quiz), a representative lab (`Lab.tsx`), `RoleGuard`/`StaffArea` dashboards (`CohortDashboard`), and a couple of exercise components. Confirm exact set in Unit 2.
- **Recent additions to check**: `PiiNotice` (P6.3), `UsageMonitoring` (P6.2) — include in the axe pass.

### External References
- `eslint-plugin-jsx-a11y` (flat-config `recommended`), `vitest-axe` / `axe-core` — standard, well-documented. Pin versions in `package.json`.

## Key Technical Decisions
- **jsx-a11y at error** (per brainstorm): hard regression floor; all current violations fixed in this work.
- **Axe at the component level (vitest/jsdom), not e2e** — e2e isn't in CI (per CLAUDE.md), so component-level axe is the CI-enforceable choice; optionally add an `@axe-core/playwright` spec later (deferred).
- **Truthful audit doc** — separates automated-verified from human-required; no 508-certified claim.
- **Fix, don't suppress** — eslint-disable only where genuinely unavoidable, with a comment.

## Open Questions

### Resolved During Planning
- Scope + severity (full audit, automatable portion; jsx-a11y=error) — from brainstorm.
- Axe location — component-level vitest for CI enforcement.

### Deferred to Implementation
- **jsx-a11y violation volume is unknown until the plugin runs** — Unit 1 discovers it; if the count is very large, remediation may warrant splitting into follow-up PRs (note in the PR, keep the error gate).
- Exact final list of axe-covered surfaces (Unit 2) — pick representative high-traffic screens.
- Whether any jsx-a11y rule needs project-level config for the design system (discover on first run).

## Implementation Units

- [ ] **Unit 1: Add `jsx-a11y` at error + fix all violations**

**Goal:** Static a11y lint floor with zero violations.

**Requirements:** R1, R2

**Dependencies:** None.

**Files:**
- Modify: `eslint.config.*`, `package.json` (+ `package-lock.json`)
- Modify: across `src/**/*.tsx` as violations require
- Test: n/a (lint is the gate) — existing suite must stay green

**Approach:**
- Add `eslint-plugin-jsx-a11y`; enable its flat `recommended` ruleset, escalated to `error`. Run `eslint .`, triage the violation list, and fix each (proper labels/`htmlFor`, `alt`, button vs. div, `aria-*` validity, keyboard handlers paired with click handlers, no redundant roles, valid `role` values). Prefer real fixes over disables; any disable gets a one-line justification.
- Mirror existing W2-9 patterns; do not regress `role="status"`/`aria-live`/`sr-only`.

**Execution note:** Run the plugin first to enumerate the true violation set before fixing; if the volume is very large, report it (may split remediation) but keep the rule at error.

**Test scenarios:** `Test expectation: none — enforcement is `npm run lint` passing with jsx-a11y at error; behavior is unchanged (existing component tests must stay green).`

**Verification:** `npm run lint` passes with jsx-a11y at error (zero violations); full test suite unchanged/green; build clean.

- [ ] **Unit 2: Automated axe checks over key surfaces + fix violations**

**Goal:** Runtime a11y assertions (axe) on representative screens, zero violations.

**Requirements:** R3, R2

**Dependencies:** Unit 1 (static issues fixed first reduces axe noise).

**Files:**
- Modify: `package.json` (+lock) — add `vitest-axe`; `src/test/setup.ts` — register the axe matcher
- Create: `src/test/a11y.axe.test.tsx` (jsdom) — render each key surface, assert no axe violations
- Modify: component source as axe violations require

**Approach:**
- Add `vitest-axe`; in a jsdom test, render each representative surface (Login, app shell/Sidebar, ModuleRenderer with a content lesson + a quiz, a Lab, CohortDashboard, PiiNotice, UsageMonitoring, plus 1–2 exercises) and assert `expect(await axe(container)).toHaveNoViolations()`. Fix any violations surfaced.
- Keep the covered-surface list explicit in the test so coverage is auditable; note in the audit doc which surfaces are axe-covered.

**Patterns to follow:** existing jsdom component tests (`// @vitest-environment jsdom`), `src/test/setup.ts`.

**Test scenarios:**
- Happy path: each covered surface renders with **zero** axe violations.
- Edge: a surface with dynamic state (e.g. Lab mid-grade, quiz answered) is axe-clean in that state too where cheap.
- Integration: the axe matcher is registered globally (setup) and usable across the suite.

**Verification:** `src/test/a11y.axe.test.tsx` passes with zero violations on all covered surfaces; matcher available suite-wide; full suite + lint green.

- [ ] **Unit 3: 508/WCAG audit document**

**Goal:** A truthful audit artifact separating automated-verified from human-required.

**Requirements:** R4

**Dependencies:** Units 1–2 (documents what they achieved).

**Files:**
- Create: `docs/accessibility/508-wcag-audit.md`

**Approach:**
- Walk WCAG 2.1 AA criteria (grouped by Perceivable/Operable/Understandable/Robust). For each: status = automated-pass (jsx-a11y/axe) / fixed-in-this-work / **needs-manual-verification**, with a one-line note. Include an explicit **manual follow-up checklist**: keyboard-only walkthrough of each key flow, screen-reader testing (VoiceOver + NVDA) of each key flow, visible-focus + color-contrast human checks, and formal 508 sign-off owner/date fields.
- State clearly that automated tooling ≠ 508 certification.

**Test scenarios:** `Test expectation: none — documentation artifact.`

**Verification:** The audit doc exists, maps criteria to status, and enumerates the human follow-up; no overclaim of certification.

## System-Wide Impact
- **Interaction graph:** jsx-a11y fixes touch many components but are correctness-only (labels/roles/keyboard) — no behavioral/logic change intended. Watch for fixes that alter DOM structure breaking existing component-test queries; update those tests.
- **API surface parity:** the lint rule applies repo-wide going forward — new components must be a11y-clean.
- **Unchanged invariants:** app behavior, model calls, data flows untouched; this is a11y-correctness + tooling only. Do not regress W2-9 live-region/focus patterns.

## Risks & Dependencies
| Risk | Mitigation |
|------|------------|
| jsx-a11y surfaces a large violation count → big PR | Enumerate first (Unit 1); if huge, report + consider follow-up PRs but keep the error gate; fixes are mechanical |
| A11y DOM fixes break existing test selectors | Run full suite after fixes; update queries; no behavior change |
| Automated pass mistaken for 508 compliance | Audit doc explicitly separates automated from manual; no certification claim |
| axe in jsdom misses layout/contrast issues | Documented limitation; those go on the manual checklist |

## Documentation / Operational Notes
- Update PROJECT-PLAN P6.4 on merge; note the manual 508 verification remains a human task (like P6.5/P7.1). This closes the automated half of W5-4.

## Sources & References
- **Origin document:** [docs/brainstorms/p6.4-accessibility-pass-requirements.md](docs/brainstorms/p6.4-accessibility-pass-requirements.md)
- Patterns: `eslint.config.*`, `src/test/setup.ts`, W2-9 a11y usages (`role="status"`/`aria-live`/`sr-only`), `src/components/ModuleRenderer.tsx`, `src/components/Lab.tsx`, `src/components/staff/CohortDashboard.tsx`
- External: `eslint-plugin-jsx-a11y`, `vitest-axe`/`axe-core`

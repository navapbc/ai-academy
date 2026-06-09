# W2-7 — Contain malformed authored content (audit D-16)

**Item:** A-2026-06-09 audit remediation W2-7.
**Date:** 2026-06-09 · **Branch:** `feat/w2-7-config-shape-guards`

## The defect (D-16, P3)

`quiz_json` / `lab_config_json` pass through `assertModuleRow` (`src/lib/modules.ts:74-113`)
shape-unvalidated — only scalar columns are checked (TYPE-03). A migration typo in an authored row
(a quiz question missing `options`, a `paired-calibration` config missing `offTask`) compiles,
seeds, and then **throws at render inside the exercise/quiz component** — and the only boundary is
the app-level `ErrorBoundary` (FE-01), which replaces the **entire app** with the reload screen.
One bad row = the whole academy white-screens for every learner. Unknown `kind`s are already
handled (FE-06 fallback + the dispatch `default`); *malformed known-kinds* are not.

## Fix choice: scoped boundary, not 18 schemas

The audit allows "a per-module ErrorBoundary or per-kind config guard". A per-kind schema
validator for 18 lab kinds + quiz shape is a large, drift-prone surface that must be hand-extended
with every new kind (and D-16 is exactly the failure of hand-maintained guarantees). A **scoped
error boundary around each widget region** contains *any* render throw from *any* current or
future kind with zero per-kind maintenance — the new kind is protected the day it's added. This
matters more as the P5.4 CMS approaches (humans editing JSON = more malformed rows).

- New **`SectionBoundary`** component (class boundary like `ErrorBoundary`, but scoped): renders a
  compact `role="alert"` card — "This {label} couldn't load… the rest of the lesson still works" —
  logs the error, and leaves the rest of the page intact. No reload button (the page is fine); a
  remount (navigating away and back) retries naturally because `ModuleRenderer`'s tree is keyed by
  `module.id`.
- `ModuleRenderer` wraps its three widget regions independently: `{interactive}`, `{exercise}`,
  and the inline `<Quiz>`. A broken exercise cannot take down the quiz (the completion gate) and
  vice versa; the lesson body, resources, and navigation always survive.

Trade-off note: if the *quiz* of a quiz-gated module is the malformed part, that module can't be
completed until the row is fixed — but the learner sees exactly which activity failed, on an
otherwise working page, instead of a dead app. (FE-06's dead-end detection is unchanged; it
operates on dispatch results, not render success.)

## Out of scope
Schema validation in `assertModuleRow` (revisit with the P5.4 CMS editor, which is where invalid
JSON should be rejected at write time); the top-level `ErrorBoundary` (still the backstop for
everything outside the widget regions); content fixes.

## Tests
- `SectionBoundary.test.tsx` — renders children; a throwing child produces the scoped fallback
  (and not the app-level "Reload" UI); the error is logged.
- `ModuleRenderer.boundary.test.tsx` — the D-16 regression, with REAL (un-mocked) exercise/quiz
  children: (a) a `paired-calibration` config missing `offTask` renders the lesson body + scoped
  fallback — the page survives (fails pre-fix: the whole render throws); (b) a malformed
  `quiz_json` (question without `options`) renders the body + scoped quiz fallback; (c) a broken
  exercise does NOT take down a healthy quiz next to it.

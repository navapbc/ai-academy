# W2-9 — Accessibility parity (audit D-10 / D-19 / D-20)

**Item:** A-2026-06-09 audit remediation W2-9 — one PR closing three accessibility defects the audit
found. All client-side; no schema, content, gating, completion-semantics, or Edge Function changes.
A head-start on P6.4 (the formal a11y pass).
**Date:** 2026-06-09
**Branch:** `feat/w2-9-a11y-parity`

## Defects and fixes

### D-10 (P2) — No focus/scroll management on module/view change (WCAG SC 2.4.3)
`App.tsx` swaps the content region wholesale when the module or view changes — including on
auto-advance after a completion. Focus falls to `<body>`, and the new module opens scrolled to
wherever the previous one was, so a keyboard/screen-reader learner is stranded mid-page with no
focus anchor. (The DEBT-REPORT focus work covered modals only.)
**Fix:** the scrollable content container gets a ref, `tabIndex={-1}`, a context-reflecting
`aria-label` (module title / "Prompting playground" / "Section locked"), and `id="content-region"`.
A `useEffect` keyed on `[currentModuleId, view, currentModuleLocked]` resets `scrollTop = 0` and
moves focus into the region — skipping the first mount (a `didMountRef` guard) so initial page load
doesn't yank focus. `focus({ preventScroll: true })` since scroll is already reset.

### D-19 (P3) — Lab grading status not announced
`Lab.tsx`'s grading spinner was a bare `<p>` while all four newer judge-graded labs wrap the same
spinner in `<div role="status" aria-live="polite">` (Lab predates the pattern). A screen-reader user
got no signal the judge was running.
**Fix:** wrap the spinner in `role="status" aria-live="polite"`, to sibling-lab parity. Switching
the element from `<p>` to `<div>` also removes the invalid `<p> > <div>` nesting (the motion.div
spinner), clearing a long-standing hydration warning. (W2-8 already brought the grading *error* to a
live region via the shared `GradeError`; this finishes the *status* half.)

### D-20 (P3) — HarmRubric correctness conveyed by colour + icon only
`HarmRubric.tsx`'s per-scenario graded feedback signalled correct/incorrect with a green/red
background and a check/cross icon that carries no text alternative — so a screen-reader or
colour-blind learner couldn't tell whether they got an item right (WCAG 1.4.1 / 1.1.1). The score
summary already had a live region; the per-item correctness did not.
**Fix:** each graded item's rationale is prefixed with `sr-only` "Correct." / "Incorrect." text, and
the decorative icon wrapper is `aria-hidden`. The visible colour/icon stays for sighted users.

## Out of scope
The broader P6.4 pass (axe automation, jsx-a11y lint — W5-4), every other audit item, any
completion-semantics or content change. No new live regions added to HarmRubric beyond the existing
score summary (per-item live regions would fire an N-way announcement storm on submit).

## Tests
- `e2e/13-content-focus.spec.ts` (new) — navigate 1.4 → 1.5: the content region's `scrollTop`
  returns to 0 and `#content-region` becomes the active element (D-10).
- `Lab.test.tsx` — new case: while the judge runs, "Grading your work…" sits inside a `role="status"`
  region (D-19).
- `HarmRubric.test.tsx` (new file) — after grading a right + a wrong pick, sr-only "Correct." and
  "Incorrect." text is present and the icon wrappers are `aria-hidden` (D-20).

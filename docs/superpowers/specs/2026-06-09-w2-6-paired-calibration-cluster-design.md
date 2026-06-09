# W2-6 — PairedCalibration cluster (audit D-09 / D-14 / D-18)

**Item:** A-2026-06-09 audit remediation W2-6 — fix the three defects the audit found in the P4.6
paired-calibration lab (cell 2.15). Component-only; no schema, seed, dispatch, or gating changes.
**Date:** 2026-06-09 · **Branch:** `feat/w2-6-paired-calibration-cluster`

## Defects and fixes

### D-14 (P3) — stopping the timer / starting over doesn't abort the in-flight stream
"Done — stop timer" during an active stream lets the request keep streaming: post-stop tokens
silently accrue into the `onResponse` that gets saved in the transcript, so the recorded output can
contain work produced *after* the measured time. "Start over" has the same hole — the orphan stream
resurfaces as ghost text in the next attempt and keeps "Run prompt" disabled until it finishes.
**Fix:** `finishOn()` and `reset()` both `abortRef.current?.abort()`. Post-W2-4, an abort resolves
`streamChat` cleanly in every phase, so `handleRun`'s `finally` releases `isStreaming` immediately.
The transcript now records exactly what existed when the learner stopped the clock.

### D-18 (P3) — a failed save loses both timed runs
On `recordLabSubmission` failure the only control in the reveal phase is "Start over", which wipes
both timed tasks. The timed runs are unrepeatable evidence (re-doing the task isn't the same task).
**Fix:** extract the save into `saveSubmission()` and, when a save error is showing (and the user is
signed in), render a **"Retry save"** button beside it that re-attempts without touching any state.
"Start over" remains for an intentional fresh attempt.

### D-09 (P2) — a11y regressions vs the sibling-lab patterns
PairedCalibration postdates the X.4 a11y pass and regressed four resolved patterns:
- `runError` / `saveError` are plain `<p>` → add `role="alert"` (A11Y-13 pattern).
- the streamed Claude response has no live region → `role="status"` + `aria-live="polite"` +
  `aria-busy` (A11Y-04 pattern, byte-pattern of `Lab.tsx`).
- `text-gray-400` labels ("Without AI"/"With Claude") and the "Waiting for Claude…" placeholder
  (~2.5:1 on white) → `text-gray-500` (A11Y-05 pattern).
- the six-phase flow swaps the card's whole content silently → one persistent visually-hidden
  `role="status"` announcer that names each phase as it activates ("Timer started — task without
  AI", …, "Calibration result revealed"), so a screen-reader user gets the same signal a sighted
  user gets from the layout change.

## Out of scope
The E2E spec for 2.15 (tracked as W6-3 / audit D-26 — though the new component test added here
shrinks that gap), content changes (2.15 stays `in_review` for SME), `modules.status` semantics.

## Tests
New `PairedCalibration.test.tsx` (the component previously had only pure-math coverage — audit
D-26): walks the full phase flow with `streamChat`/`recordLabSubmission` mocked and pins:
- D-14: "Done — stop timer" mid-stream aborts the controller's signal; "Start over" aborts too and
  the next attempt's Run is immediately usable.
- D-18: a failed save shows a `role="alert"` and a working "Retry save" that preserves `offMs`/
  `onMs` (asserted via the retried submission payload) — and the original failure path is pinned.
- D-09: the error lines carry `role="alert"`, the response region `role="status"`, the announcer
  reflects phase changes.
Each fails on the pre-fix component.

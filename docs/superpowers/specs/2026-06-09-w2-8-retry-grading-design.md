# W2-8 — Retry-grading affordance (audit D-17)

**Item:** A-2026-06-09 audit remediation W2-8 — one PR closing the single defect D-17:
"grading failure is a dead end in all 5 judge-graded labs." All changes are client-side; no schema,
content, gating, completion-semantics, or Edge Function changes.
**Date:** 2026-06-09
**Branch:** `feat/w2-8-retry-grading`

## The defect (D-17, P3)

Five components grade the learner's saved submission with the P4.2 LLM-judge: `Lab` (2.1),
`VoiceEdit` (2.6), `SourcedFreeTextLab` (2.2/2.3 critique + 2.7 synthesis), `PromptEval` (2.10),
`IterationLab` (2.4). Each runs the same shape inside `handleSave`/`handleSubmit`:

```
const id = await recordLabSubmission(...);   // row written, status 'submitted'
setGrading(true);
try { result = await requestLlmGrade(...); await saveGrade(id, result, 'reviewable'); setGradeResult(result); }
catch { setGradeError('Grading is unavailable right now — your work is saved.'); }
finally { setGrading(false); }
```

On a transient judge/network failure the learner sees a passive gray note and **no way to ask for a
grade again**. The submission is already saved, but its status is stuck at `'submitted'` (the grade
is never attached), and the only way to get anchor-scored feedback is to redo the entire lab — which
in the streaming labs (VoiceEdit/PromptEval/IterationLab) re-spends Claude calls. A flaky one-second
blip therefore permanently denies feedback. That is the dead end.

## The fix

Add a **retry affordance** that re-grades the *already-saved* submission — no re-run, no second
`lab_submissions` row, no extra Claude generation calls (only the judge call repeats). Because the
five labs carry byte-identical grading state and try/catch (the very duplication that let D-09's
a11y fix land in only one of them), the retry is implemented **once** and shared, not copy-pasted
five times:

### New: `src/lib/useLabGrading.ts` (hook)
Owns the `grading` / `gradeResult` / `gradeError` trio and:
- `grade({ submissionId, rubric, submission, failureNote })` — runs `requestLlmGrade` →
  `saveGrade(submissionId, result, 'reviewable')` → `setGradeResult`; on throw sets
  `gradeError = failureNote`. Identical behavior to today's inline blocks.
- `retry()` — re-invokes `grade` with the **last request** (held in a ref), so it re-grades the same
  saved submission id with the same judge payload. Available only after a failure populated the ref.
- `reset()` — clears the trio + the ref; replaces the per-component `setGradeResult(null);
  setGradeError(null)` run/regenerate resets.

The hook imports `requestLlmGrade` (from `./grading`) and `saveGrade` (from `./progress`) — the exact
modules every component test already mocks, so the move is transparent to existing tests.

### New: `src/components/GradeError.tsx` (presentational)
Renders the non-blocking failure note + a **"Try grading again"** button in one `role="status"
aria-live="polite"` region (the four exercises already used that live region; `Lab` did not — this
brings it to parity, a free D-09-adjacent a11y win). The button is keyboard-focusable with a visible
focus ring. Used identically in all five labs, replacing each bare
`{gradeError && <p …>{gradeError}</p>}` line.

### Wiring (each of the five components)
- Replace the three `useState` grade vars with the hook.
- Replace the inline grade try/catch with one `await grade({ … })` call — the `submission` payload
  is copied **verbatim** so every judge input stays byte-identical (critique/synthesis byte-stability
  is test-locked).
- Replace the run/regenerate `setGradeResult(null); setGradeError(null)` resets with `reset()`.
- Replace the `gradeError` `<p>` with `<GradeError note={gradeError} onRetry={retry} />`.
- Drop now-unused `saveGrade`/`requestLlmGrade`/`GradeResult` imports.

## Completion semantics (unchanged — verified)
Grading never gates completion. `Lab` still calls `onComplete()` only via its **Continue** button
(shown on success *or* failure, so saved-but-ungraded work can still advance — now alongside Retry);
the four exercises still have no `onComplete`. The retry only fills in the grade card on an
already-saved, already-(quiz-)gateable submission.

## Out of scope
The other audit items (W2-1…W2-7, W2-9 broad a11y), any completion-semantics change, Edge Functions,
content/seed, schema. No change to the judge payloads or the `reviewable` status flow.

## Tests
- `useLabGrading.test.ts` (new) — `grade` happy path saves + sets result; a failing judge sets the
  note and saves nothing; `retry` re-grades the **same** submission id and, when the judge recovers,
  clears the note and shows the result; `reset` clears the trio.
- One new case per component test (`Lab`, `VoiceEdit`, `Critique`/`Synthesis` via SourcedFreeTextLab,
  `PromptEval`, `IterationLab`): after a grading failure, a "Try grading again" button is present;
  clicking it (judge now resolves) renders the anchor-scored card and removes the note — and does
  **not** record a second submission (`recordLabSubmission` still called once). These fail on old
  code (no retry button exists).

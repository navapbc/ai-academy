# W2-4 — Error-path cluster (audit D-03 / D-04 / D-05 / D-13 / D-15)

**Item:** A-2026-06-09 audit remediation W2-4 — one PR fixing the five error-path defects the
audit found in streaming/grading flows. All five are client-side; no schema, content, gating, or
Edge Function changes.
**Date:** 2026-06-09
**Branch:** `feat/w2-4-error-path-cluster`

## Defects and fixes

### D-05 (P2) — `streamChat` abort during the fetch phase throws, violating its contract
`src/lib/llm.ts` documents "Aborting resolves `streamChat` cleanly (it does not throw)", but only
the read-loop catch honors that. An abort while `fetch` itself is pending (before the first byte —
routinely 0.5–2s) rejects with `AbortError`, so Playground's **Stop** pressed early renders
"Error: …" in the assistant bubble.
**Fix:** wrap the `fetch` await in the same abort-aware catch the read loop uses: on
`AbortError`/aborted signal, return cleanly; rethrow anything else. (The pre-send
`options.signal?.aborted` early-return already exists; this closes the in-flight window.)

### D-04 (P2) — Lab writes stream-error text into the saveable/gradeable response
`src/components/Lab.tsx` `handleRun`'s catch does `setResponse('Error: …')`, which flips `hasRun`
and enables "Save & complete" — the error string becomes the recorded transcript and is sent to
the LLM judge.
**Fix:** new `runError` state rendered as a `role="alert"` line (matching the newer labs'
`runError`/`draftError` pattern); the catch never touches `response`. `hasRun` additionally
requires `!runError`, so a *partial* stream that errored mid-flight (real but truncated output)
can't be saved either — the learner re-runs.

### D-13 (P3) — Lab shows the previous run's grade card against a new output
`handleRun` resets `saved`/`saveError` but not `gradeResult`/`gradeError`, so after a graded save a
re-run keeps showing the old anchor scores under the new output until the next save.
**Fix:** clear `gradeResult`/`gradeError` in `handleRun`, exactly as `VoiceEdit.tsx:96-97` and
`PromptEval.tsx:76-77` already do.

### D-03 (P2) — VoiceEdit mid-stream draft failure is a silent dead end
`draftReady = draft.trim().length > 0 && !generating`; a stream that errors after the first chunks
leaves `draft` non-empty, so the phase-1 block — which contains BOTH the error message and the
only Generate/regenerate button — unmounts. The learner sees a truncated draft presented as
finished, no error, no way to regenerate, and an un-prefilled revision.
**Fix:** the catch resets `draft` to `''` (and the accumulator's partial text is discarded — it is
a machine-generated draft; regenerating is cheap and correct), so the phase-1 UI with the
`role="alert"` error and the Generate button stays mounted. `setRevision` continues to run only on
success, preserving the "phase 2 starts from exactly what the model produced" invariant.

### D-15 (P3) — IterationLab discards the learner's typed turn on a failed send
`handleSend` clears `input` optimistically; the catch rolls back `messages` but not the input — in
the lab whose graded artifact *is* the learner's turns, a long steering message is lost to one
transient network error.
**Fix:** the catch restores `setInput(userMsg.content)` alongside the existing message rollback.

## Out of scope
D-17 (retry-grading affordance, item W2-8), D-14/D-18 (PairedCalibration, item W2-6), any
completion-semantics change (no lab gains/loses `onComplete` behavior), Edge Functions, content.

## Tests
- `llm.test.ts` — new: abort while `fetch` is pending resolves cleanly (D-05; fails on old code).
- `Lab.test.tsx` (new file) — a failed run shows the alert and does NOT enable Save (D-04); a
  re-run clears a prior grade card (D-13); a successful run still saves (happy path guard).
- `VoiceEdit.test.tsx` — new case: mid-stream failure keeps the Generate button + error visible
  and leaves the revision empty (D-03; fails on old code).
- `IterationLab.test.tsx` — new case: a failed send restores the typed message into the input
  (D-15; fails on old code).

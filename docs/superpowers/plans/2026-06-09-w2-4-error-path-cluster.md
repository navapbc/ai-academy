# W2-4 — Error-path cluster — implementation plan

Spec: `docs/superpowers/specs/2026-06-09-w2-4-error-path-cluster-design.md`
(audit D-03/D-04/D-05/D-13/D-15; PROJECT-PLAN item W2-4).

1. **`src/lib/llm.ts`** — abort-aware catch around the `fetch` await (D-05). No API change.
2. **`src/components/Lab.tsx`** — add `runError` state + `role="alert"` rendering; catch sets it
   instead of polluting `response`; `hasRun` requires `!runError`; `handleRun` clears
   `runError`/`gradeResult`/`gradeError` (D-04 + D-13).
3. **`src/components/exercises/VoiceEdit.tsx`** — catch resets `draft` to `''` so phase 1 (error +
   regenerate) stays mounted (D-03).
4. **`src/components/exercises/IterationLab.tsx`** — catch restores the rolled-back turn's text
   into `input` (D-15).
5. **Tests** — one new `llm.test.ts` case; new `Lab.test.tsx`; one new case each in
   `VoiceEdit.test.tsx` and `IterationLab.test.tsx`.
6. **Validate** — lint/build/full vitest (no regression), `supabase db reset`, full Playwright E2E
   (03-prompt-lab, 09-voice-edit, 12-iteration are the affected specs), manual error-path check in
   the browser (kill network mid-stream).

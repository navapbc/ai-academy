# W2-6 — PairedCalibration cluster — implementation plan

Spec: `docs/superpowers/specs/2026-06-09-w2-6-paired-calibration-cluster-design.md`
(audit D-09/D-14/D-18; PROJECT-PLAN item W2-6).

1. **`src/components/exercises/PairedCalibration.tsx`** —
   abort in `finishOn` + `reset` (D-14); extract `saveSubmission()` + "Retry save" button (D-18);
   `role="alert"` on both errors, `role="status"`/`aria-live`/`aria-busy` on the streamed response,
   `text-gray-400` → `text-gray-500`, sr-only phase announcer (D-09).
2. **`src/components/exercises/PairedCalibration.test.tsx`** (new) — phase-flow component test
   pinning all three fixes (see spec §Tests).
3. **Validate** — lint/build/full vitest (no regression), `supabase db reset`, full Playwright E2E,
   manual browser run of the 2.15 flow incl. stop-mid-stream and failed-save retry.

# W2-7 — Contain malformed authored content — implementation plan

Spec: `docs/superpowers/specs/2026-06-09-w2-7-config-shape-guards-design.md` (audit D-16).

1. **`src/components/SectionBoundary.tsx`** (new) — scoped class error boundary, `label` prop,
   compact `role="alert"` fallback, console logging like `ErrorBoundary`.
2. **`src/components/ModuleRenderer.tsx`** — wrap `{interactive}`, `{exercise}`, and the inline
   `<Quiz>` each in their own `<SectionBoundary>`.
3. **Tests** — `SectionBoundary.test.tsx` + `ModuleRenderer.boundary.test.tsx` (see spec).
4. **Validate** — lint/build/full vitest, `supabase db reset`, full Playwright E2E (boundary must
   be transparent for healthy content — all 15 specs), manual browser check: temporarily breaking
   a row in the local DB shows the scoped card while the rest of the lesson works (then reset).

# W2-5 — DATA-01 test reconcile + DB-gated tests in CI (audit D-07 / D-24)

**Item:** A-2026-06-09 audit remediation W2-5.
**Date:** 2026-06-09 · **Branch:** `feat/w2-5-data01-ci-dbtests`

## The defects

- **D-07 (P2):** `rls.integration.test.ts` is double-gated (`RUN_DB_TESTS=1` + live stack) and CI
  never sets the flag, so the suite never runs in CI — and it is currently **failing**: the DATA-01
  test asserts all six Stage-1b cells are `published`/v1, but the P4.3a seed
  (`20260603010000_seed_lab_config_1_2.sql`) legitimately moved 1.2 to `in_review`/v2 when it added
  the DRAFT output-audit config. The test encodes a pre-P4.x invariant; the migrations moved on.
- **D-24 (P3):** `20260602260000_reconcile_stage_1b_provenance.sql` was written against the
  pre-240000 state: it reset 1.12 to `published`/v1, clobbering the intentional `in_review`/v2
  marker that `20260602240000_seed_exercises_1_12_1_13.sql` had just set — leaving 1.12 published
  while its same-vintage sibling 1.13 stayed `in_review`. The review-state bookkeeping lies about
  1.12.

## The fix — make the data truthful, then test the real invariant, then run it in CI

1. **Migration `20260609000000_restore_1_12_provenance.sql`** restores 1.12 to `in_review`/v2.
   Guarded on the exact clobbered state (`status='published' and version=1 and lab_config_json is
   not null`), so it is idempotent and can never overwrite a deliberate future SME publish. The
   runtime ignores `status` (audit D-08) — zero behavior change; the SME backlog count (W3-1)
   becomes 14 cells, which is the truth (1.12's harm-rubric config was never reviewed).
2. **DATA-01 test rewritten to the intended invariant:** Stage-1b provenance is *deterministic from
   the migration chain* — cells without a later lab-config seed are `published`/v1 (1.1, 1.7, 1.8,
   1.11); cells whose interactive config landed after the reconcile carry `in_review`/v2 with a
   non-null config (1.2, 1.12). This fails loudly if a future seed/reconcile drifts again.
3. **CI job `db-tests`:** stands up the local Supabase stack in GitHub Actions (Docker is on
   ubuntu-latest; the `supabase` CLI is already a devDependency), exports
   `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` from `supabase status -o env` (no secrets — local
   generated keys), and runs the full vitest suite with `RUN_DB_TESTS=1` so both gated suites
   (`rls.integration.test.ts`, `progress.test.ts`) execute instead of skipping. The existing fast
   `build` job is untouched.

## Out of scope
E2E-in-CI (separate tracked item, needs a seeded user + Playwright browsers); any change to
`modules.status` runtime semantics (that's W3-2); the SME review itself (W3-1).

## Tests
The deliverable *is* tests + the migration: locally `npx supabase db reset` ×2 (idempotency) then
`RUN_DB_TESTS=1` vitest must be fully green (6/6 in the RLS suite — D-07's failure gone), and the
new CI job must pass on the PR itself (its first real execution).

# W2-5 — DATA-01 reconcile + DB tests in CI — implementation plan

Spec: `docs/superpowers/specs/2026-06-09-w2-5-data01-ci-dbtests-design.md` (audit D-07/D-24).

1. **`supabase/migrations/20260609000000_restore_1_12_provenance.sql`** — restore 1.12 to
   `in_review`/v2 under the exact-clobbered-state guard.
2. **`src/lib/rls.integration.test.ts`** — DATA-01 test now asserts the deterministic split:
   {1.1, 1.7, 1.8, 1.11} = published/v1 · {1.2, 1.12} = in_review/v2 + non-null config.
3. **`.github/workflows/ci.yml`** — new `db-tests` job: npm ci → `npx supabase start` → export
   URL/key from `supabase status -o env` → `RUN_DB_TESTS=1 npm run test`.
4. **Validate** — `db reset` ×2; `RUN_DB_TESTS=1` full vitest green locally (RLS suite 6/6);
   lint/build; full Playwright E2E (migration touches modules rows the app reads); the PR's own CI
   run shows the new job green; SQL spot-check that 1.12 = in_review/v2 and 1.13 unchanged.

# W2-1 — User-keyed progress cache + outbox — implementation plan

Spec: `docs/superpowers/specs/2026-06-09-w2-1-user-keyed-progress-cache-design.md` (audit D-01).

1. **`src/lib/progressCache.ts`** — `cacheKey(userId)`; `readProgressCache(userId)` (deletes the
   legacy un-keyed entry when seen), `writeProgressCache(userId, progress)`,
   `clearProgressCache(userId)`. Envelope/version logic untouched.
2. **`src/lib/pendingWrites.ts`** — `pendingKey(userId)`; `readPendingCompletions(userId)` (deletes
   the legacy un-keyed entry when seen — never replayed), `addPendingCompletion(userId, id)`,
   `removePendingCompletion(userId, id)`.
3. **`src/lib/useProgress.ts`** — thread `userId` through hydrate / persist / retry / merge / park.
   No semantic changes otherwise.
4. **`src/lib/auth.tsx`** — `signOut()` captures the current user id and calls
   `clearProgressCache(uid)` before `supabase.auth.signOut()`. Outbox intentionally kept (spec §2).
5. **Tests** — update `progressCache.test.ts`; add `pendingWrites.test.ts`;
   add `useProgress.twouser.test.tsx` (renderHook + mocked `./progress`) reproducing the D-01
   cross-user repro and asserting it no longer happens.
6. **Validate** — lint, build, full vitest (no regression), `supabase db reset` ×2, full Playwright
   E2E (the suite signs in/out repeatedly and exercises persistence in `04-quiz-persistence`),
   manual two-user check against local Supabase.

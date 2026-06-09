# W2-1 — User-keyed progress cache + outbox (audit D-01 / LB-2)

**Item:** A-2026-06-09 audit remediation W2-1 — fix defect **D-01 (P1)**: the localStorage progress
cache and pending-writes outbox are shared across users and survive sign-out.
**Depends on:** P1.4 (the cache/outbox, #8), DATA-02/DATA-10/TYPE-06 fixes (the envelope + outbox
semantics this change must preserve).
**Date:** 2026-06-09
**Branch:** `feat/w2-1-user-keyed-progress-cache`

## 1. The defect (audit D-01)

`progressCache.ts` stores `UserProgress` under the fixed key `sprint_progress`, and
`pendingWrites.ts` parks failed completion writes under the fixed key
`sprint_pending_completions`. Neither key contains the user id and neither is cleared on sign-out
(`auth.tsx` `signOut()` clears nothing). `App.tsx` keys `AcademyApp` by `session.user.id`, which
resets React state — but the fresh mount re-hydrates from the same shared cache. Two failures on a
shared browser:

1. **Local leak/corruption:** user B signing in after user A starts from A's
   `completedModuleIds`; the DATA-02 reconcile then *unions* A's completions into B's state (it is
   deliberately monotonic), so B sees Stage 2 unlocked without earning it and the union can be
   persisted under B.
2. **Cross-account server write:** a completion of A's parked in the outbox is replayed on the next
   reconcile as `setModuleStatus(<current user>, id, 'completed')` — writing **A's completion into
   B's `module_progress` rows**.

## 2. Fix design

**Key both storage entries by user id; never trust an entry you can't attribute.**

- `progressCache.ts` — key becomes `sprint_progress:<userId>`; `readProgressCache(userId)` /
  `writeProgressCache(userId, progress)`; new `clearProgressCache(userId)`. The envelope/version
  check (TYPE-06/DATA-10) is unchanged. The **legacy un-keyed `sprint_progress` entry is deleted on
  first read and never trusted** — it cannot be attributed to a user, and Supabase is the source of
  truth so discarding it only costs one instant-paint.
- `pendingWrites.ts` — key becomes `sprint_pending_completions:<userId>`; all three functions take
  `userId`. The **legacy un-keyed outbox entry is deleted on first read and never replayed** —
  replaying an unattributable completion under whoever signs in next is exactly the D-01 write
  corruption.
- `useProgress.ts` — threads `userId` into every cache/outbox call (initial hydrate, persist
  effect, reconcile retry loop, merge, completeModule park/confirm). With per-user keys, a foreign
  user's cache is structurally invisible — no "ignore foreign owner" branch is needed. The hook
  keeps its existing contract that `userId` is stable for the life of the instance (guaranteed by
  the `key={session.user.id}` remount in `App.tsx`).
- `auth.tsx` — `signOut()` clears the signing-out user's **progress cache** (cheap re-paint data)
  before revoking the session. It deliberately does **not** clear the outbox: a parked completion
  is durable evidence of work done (DATA-02's whole point); now that it is keyed to its owner it is
  safe to leave parked and is retried when *that same user* signs back in. (The audit's fix
  direction allowed "key by user id and/or clear on sign-out"; keying is the load-bearing part,
  clearing the cache is hygiene.)

## 3. Out of scope

Any change to the reconcile/merge semantics (DATA-02 monotonic union stays), the gating logic,
Supabase writes, or the quiz/lab completion flow. No migration: localStorage only.

## 4. Tests

- `progressCache.test.ts` — updated to the keyed API; adds: two-user isolation (A's write invisible
  to B), legacy un-keyed entry ignored **and removed**, corrupt-JSON unchanged.
- `pendingWrites.test.ts` (new) — per-user isolation, idempotent add, remove, legacy entry dropped.
- `useProgress.twouser.test.tsx` (new, the D-01 regression) — with `./progress` mocked: user A
  parks a completion in the outbox (failed write); a fresh hook instance for **user B** must (a)
  hydrate empty, not from A's cache, and (b) **never call `setModuleStatus` with B's id and A's
  module** — the exact cross-account write of the audit repro. Then a fresh instance for **A**
  retries A's parked id under A's id.

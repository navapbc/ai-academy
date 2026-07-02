---
title: "feat: Claude usage tracking + admin monitoring (P6.2)"
type: feat
status: active
date: 2026-07-02
origin: docs/brainstorms/p6.2-cost-caps-monitoring-requirements.md
---

# feat: Claude usage tracking + admin monitoring (P6.2)

## Overview

Durably record Claude API token usage per call (in the `chat` and `grade` Edge Functions), and give admins a staff-area view of per-user token/call totals with outlier flagging. **Monitor + alert only — no call is ever blocked** (see origin). Haiku-default is already shipped, so it's out of scope.

## Problem Frame

All model calls route through `supabase/functions/chat` and `supabase/functions/grade`, but nothing durable records usage — only an in-memory rate counter (D-21). Admins have no visibility into who is consuming API budget, so a runaway bug/abuse could burn spend unnoticed. Internal app, modest spend → the goal is **visibility + early warning**, not gating (see origin: `docs/brainstorms/p6.2-cost-caps-monitoring-requirements.md`).

## Requirements Trace

- R1. Durably record per Claude call: `user_id`, source (`chat`|`grade`), model, input tokens, output tokens, timestamp.
- R2. Token counts come from the Anthropic response usage (not estimated); capture must be best-effort and never break/delay the user-facing call.
- R3. Admin-only usage view: per-user totals (calls, input/output tokens) over a selectable window, sortable, with a cohort rollup for context.
- R4. Monitor-only threshold flagging: users over a configurable per-window threshold are flagged in the admin view (+ logged). No learner-facing effect.
- R5. Usage tracking never denies/degrades a model call; the existing rate limit stays the only limiter.

## Scope Boundaries

- No dollar/cost estimation (token counts only).
- No hard/soft caps, no blocking of any call.
- No per-cohort enforced budget (cohort rollup is a read-only view).
- No learner-facing usage UI.
- Not fixing the in-memory rate-limit durability (D-21) — the new table could later back a durable limiter, but that's separate.

## Context & Research

### Relevant Code and Patterns

- **Edge Function trio**: `supabase/functions/chat/{index.ts,chat-core.ts,chat-core.test.ts}`, `supabase/functions/grade/{index.ts,verdict.ts,verdict.test.ts}`. Pure logic in the sibling `*-core.ts` (node/vitest-testable).
- **`chat/index.ts`** already parses Anthropic's SSE stream (re-streams text deltas). Usage arrives in the same stream: `message_start` → `usage.input_tokens`; final `message_delta` → `usage.output_tokens`. Capture alongside the existing parse, record after the stream completes.
- **`grade/index.ts`** is non-streaming — the Anthropic response JSON carries `usage.{input_tokens,output_tokens}`.
- Both build an **anon** client (`createClient(url, anonKey, {global headers: caller auth})`) for `auth.getUser()`. A **service-role** client is needed to write the client-write-locked usage table — mirror `supabase/functions/review-grade/index.ts` / `admin-content/index.ts` (`Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`).
- **Locked-down table pattern**: `content_changes` in `supabase/migrations/20260618000000_admin_cms_foundation.sql` (RLS on, no client-write policy) + admin `select` via `public.is_admin()` (`supabase/migrations/20260612000000_champion_admin_read_policies.sql`).
- **Aggregation view pattern**: `learner_progress_summary` etc. in `supabase/migrations/20260613000000_p5_2a_aggregation_layer.sql` (`security_invoker = true`, grant select to authenticated; RLS on base table scopes rows).
- **Admin read-only surface**: `src/lib/dashboard.ts` (pure builders + thin fetchers + `numeric`→string coercion via `toNum`) + `src/lib/useDashboard.ts` + `src/components/staff/CohortDashboard.tsx`; gated behind `RoleGuard allow={['admin']}` / `StaffArea`. Mirror for the usage view.
- **Migration conventions**: timestamp-prefixed, idempotent (`create table if not exists`, guarded policies) — `supabase db reset` re-runs everything.
- **Test conventions**: vitest node for `*-core.ts`; DB-gated integration tests (`*.integration.test.ts`, `RUN_DB_TESTS=1`).

### Institutional Learnings

- No `docs/solutions/` in this repo; patterns live in `docs/superpowers/specs/` + prior migrations. The P5.1c `SECURITY DEFINER` `is_admin()` helper is the admin-read primitive to reuse (already exists — no new definer needed).

## Key Technical Decisions

- **Write usage from inside the Edge Functions via a service-role client**, into a client-write-locked table — usage can't be spoofed/underreported by the client. Reuses the existing service-role pattern.
- **Best-effort, non-blocking capture**: record after the Anthropic response (grade) / after the stream finishes (chat); wrap in try/catch so a usage-write failure never affects the user's call (R2/R5). For `chat`, accumulate usage during SSE parsing and insert in the stream's `flush`/close, not inline with token delivery.
- **Token counts only, per-user** (origin decisions). No price table.
- **Threshold as configuration, flagging in the read layer**: a configurable threshold (env `USAGE_ALERT_TOKENS_PER_WINDOW` or a constant in the data-access layer) drives a visual flag in the admin view; no notification channel in v1 (deferred).
- **Reuse the staff-area/admin pattern** rather than a new surface.

## Open Questions

### Resolved During Planning
- Where to capture usage in the streaming path → parse Anthropic SSE `message_start`/`message_delta` usage during the existing stream parse; record on stream close.
- Write authority → service-role client inside the Edge Function; table client-write-locked + admin read via `is_admin()`.
- Enforcement → none (monitor-only), per origin.

### Deferred to Implementation
- Exact default threshold value + whether env vs constant (pick a sane default, make it one-line configurable).
- Whether per-user windowed totals come from a SQL view with a windowed variant vs the client filtering `created_at` — decide when wiring the fetcher (a simple `select` with a `created_at >=` filter + client-side aggregation is likely enough at this volume).
- Alert/notification channel beyond the in-view flag + `console.warn` (email/Slack) — deferred.

## Implementation Units

- [ ] **Unit 1: `claude_usage` table + admin read policy**

**Goal:** A durable, client-write-locked usage table admins can read.

**Requirements:** R1, R3, R4, R5

**Dependencies:** None (reuses `is_admin()`).

**Files:**
- Create: `supabase/migrations/2026XXXXXXXXXX_claude_usage.sql`
- Test: `src/lib/claudeUsageRls.integration.test.ts` (DB-gated, `RUN_DB_TESTS=1`)

**Approach:**
- `claude_usage(id uuid pk, user_id uuid references auth.users, source text check in ('chat','grade'), model text, input_tokens int, output_tokens int, created_at timestamptz default now())`; index on `(user_id, created_at)` and `(created_at)`.
- RLS enabled, **no client insert/update/delete policy** (writes only via service-role); `select` policy `using (public.is_admin())`.
- Follow `content_changes` (locked-down) + `champion_admin_read_policies` (`is_admin()`), idempotent guards from `admin_cms_foundation.sql`.

**Patterns to follow:** `content_changes` table; `is_admin()` select policy; migration idempotency guards.

**Test scenarios:**
- Happy path: a service-role insert succeeds; an admin `select` returns rows.
- Edge: a non-admin authenticated user `select` returns zero rows (RLS denies).
- Error/security: an authenticated (non-service) client `insert`/`update`/`delete` is rejected (no write policy).
- Edge: `source` check constraint rejects a value outside `chat`/`grade`.

**Verification:** RLS matrix (service-role write, admin read, non-admin denied, client-write blocked) passes under `RUN_DB_TESTS=1`; `supabase db reset` applies cleanly twice.

- [ ] **Unit 2: Capture usage in `chat` + `grade` Edge Functions**

**Goal:** Record token usage per call, best-effort, without affecting the user response.

**Requirements:** R1, R2, R5

**Dependencies:** Unit 1.

**Files:**
- Modify: `supabase/functions/chat/index.ts`, `supabase/functions/chat/chat-core.ts`
- Modify: `supabase/functions/grade/index.ts`, `supabase/functions/grade/verdict.ts`
- Test: `supabase/functions/chat/chat-core.test.ts`, `supabase/functions/grade/verdict.test.ts`
- Modify (docs): `supabase/functions/.env.example` (note optional `USAGE_ALERT_TOKENS_PER_WINDOW`)

**Approach:**
- Pure helpers (in `*-core.ts` for node tests): `chat-core.ts` — a usage accumulator over parsed SSE events (`message_start.usage.input_tokens`, `message_delta.usage.output_tokens`) returning a `{input_tokens, output_tokens}` or null; `verdict.ts` — `extractUsage(responseJson)` returning the same shape from `usage`.
- `chat/index.ts`: during the existing SSE parse, feed events to the accumulator; in the stream's close/`flush`, service-role-insert one `claude_usage` row (source `chat`, `user.id`, model). Wrap in try/catch → on failure `console.warn` and continue (never affect the already-delivered stream).
- `grade/index.ts`: after parsing the response, service-role-insert one row (source `grade`). Best-effort try/catch.
- Add a service-role client (`SUPABASE_SERVICE_ROLE_KEY`) in both, mirroring `admin-content`/`review-grade`. Optional: `console.warn` when a single call's tokens exceed the configured threshold (cheap operator signal).

**Execution note:** Implement the pure usage-extraction helpers test-first (they're the parsing correctness core); the DB insert is best-effort glue.

**Patterns to follow:** `admin-content/index.ts` service-role client; existing SSE parse loop in `chat/index.ts`; `verdict.ts` response parsing.

**Test scenarios:**
- Happy path (chat-core): a sequence of SSE events incl. `message_start` + final `message_delta` → accumulator returns correct input/output tokens.
- Edge (chat-core): stream with no usage events (early upstream error) → accumulator returns null; caller skips the insert.
- Happy path (verdict): a grade response JSON with `usage` → `extractUsage` returns the token pair.
- Edge (verdict): response missing `usage` → returns null (no throw).
- Integration (gated): a real `chat`/`grade` call writes exactly one `claude_usage` row with the right source/user/model (or, if live Anthropic is unavailable, a unit test asserting the insert payload shape from a mocked response).
- Error path: a forced usage-insert failure does not change the user-facing response/stream (best-effort).

**Verification:** After a `chat` and a `grade` call, one usage row each exists with correct fields; a simulated insert failure leaves the response intact; `npm test` (core suites) green.

- [ ] **Unit 3: Admin usage-monitoring view (staff area)**

**Goal:** An admin-only panel showing per-user token/call totals with outlier flagging.

**Requirements:** R3, R4

**Dependencies:** Unit 1 (+ Unit 2 for real data).

**Files:**
- Create: `src/lib/usageMonitoring.ts` (pure builders + fetchers), `src/lib/useUsageMonitoring.ts` (hook)
- Create: `src/components/staff/UsageMonitoring.tsx`
- Modify: `src/components/staff/StaffArea.tsx` (admin-only tile/entry) — and `src/App.tsx` only if a new sub-view is needed (prefer in-page state like `LearnerDetail`)
- Test: `src/lib/usageMonitoring.test.ts`, `src/components/staff/UsageMonitoring.test.tsx` (jsdom)

**Approach:**
- `usageMonitoring.ts`: `fetchUsage(windowStart)` reads `claude_usage` under `is_admin()` RLS; pure `buildUsageByUser(rows, threshold)` aggregates per-user totals (calls, input/output tokens), sorts desc by total tokens, flags `overThreshold`; a cohort rollup reusing the roster/name lookup from `dashboard.ts`. Coerce `numeric`/bigint strings via a `toNum` helper (per `dashboard.ts`).
- `UsageMonitoring.tsx`: window selector (e.g. 24h / 7d / 30d), sortable per-user table, flagged rows highlighted, loading/error/empty states. Read-only.
- Gate behind `RoleGuard allow={['admin']}`; add an admin-only tile in `StaffArea` (champions do not see it — usage is admin-scope).

**Patterns to follow:** `src/lib/dashboard.ts` + `src/lib/useDashboard.ts` + `src/components/staff/CohortDashboard.tsx`; `RoleGuard`/`useRole`.

**Test scenarios:**
- Happy path (builder): rows for 2 users → correct per-user totals, sorted desc, threshold flag set only on the over-threshold user.
- Edge (builder): empty rows → empty result; a user with only input tokens → output total 0.
- Edge: bigint/numeric totals arriving as strings are coerced correctly.
- Error path (component): fetch failure → error state; no rows → empty state.
- Integration (jsdom): non-admin does not see the panel (RoleGuard); admin sees the table.

**Verification:** With seeded usage rows, the panel shows accurate per-user totals with the heaviest consumer first and flagged over threshold; hidden from non-admins; `npm test` green.

## System-Wide Impact

- **Interaction graph:** Adds a best-effort write to the two Edge Functions after the model response; no change to request/response contracts or streaming behavior. New admin-only read surface.
- **Error propagation:** Usage-write failures are swallowed (logged) — they must never surface to the learner or abort a stream.
- **State lifecycle risks:** One row per call; a dropped write under-counts (acceptable for monitoring) — never over-counts or blocks.
- **API surface parity:** Both model entry points (`chat`, `grade`) get the same capture; any future model entry point must also record usage.
- **Unchanged invariants:** Learner-facing behavior, existing rate limit, owner-only RLS on other tables — all untouched. The usage table is admin-read-only via the existing `is_admin()` helper (no new privilege path).

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Usage write adds latency / breaks the stream | Best-effort, after response/stream close, try/catch, `console.warn` on failure (R2/R5) |
| Streaming usage not captured (Anthropic omits `message_delta` usage) | Accumulator returns null → skip insert; under-count is acceptable for monitoring |
| Client spoofing usage | Service-role write into a client-write-locked table (no client insert policy) |
| Scope creep into caps/blocking | Explicit non-goal; monitor-only per origin |

## Documentation / Operational Notes

- Note the optional `USAGE_ALERT_TOKENS_PER_WINDOW` in `supabase/functions/.env.example`.
- Admin usage view is the operator surface; a notification channel (email/Slack) is a deferred follow-up.
- Update PROJECT-PLAN P6.2 status on merge.

## Sources & References

- **Origin document:** [docs/brainstorms/p6.2-cost-caps-monitoring-requirements.md](docs/brainstorms/p6.2-cost-caps-monitoring-requirements.md)
- Patterns: `supabase/functions/chat/index.ts`, `supabase/functions/grade/index.ts`, `supabase/functions/admin-content/index.ts`, `supabase/migrations/20260618000000_admin_cms_foundation.sql`, `supabase/migrations/20260612000000_champion_admin_read_policies.sql`, `supabase/migrations/20260613000000_p5_2a_aggregation_layer.sql`, `src/lib/dashboard.ts`, `src/components/staff/CohortDashboard.tsx`

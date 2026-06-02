# Debt & Bug Audit — Hardening Pass

**Date:** 2026-06-02
**Branch:** `chore/hardening-test-and-audit` (audit baseline: `main` @ `95c61dd`)
**Method:** A formalized test suite (vitest unit/component + Playwright E2E) plus a
six-lens, read-only multi-agent code audit. **No application behavior was changed**
in this pass — the only new/changed non-doc code is test files, test config
(vitest/Playwright/deps), and the CI test step. Every bug a test revealed is
recorded here and parked as a skipped/`fixme` test marked `// DOCUMENTS: <id>`
rather than fixed by editing source.

## Baseline note

This audit covers the **shipped state on `main`**. The following feature branches
are **NOT** in this baseline and were intentionally not audited:
`feat/p3.11-stage-gating` *(note: stage gating IS on `main` as of #28 — the branch
is merged; the unmerged remainder is excluded)*, `feat/x.1-claude-tutor`,
`feat/p3.5-scenario-sorter` *(scenario sorter IS on `main` via #24/#25)*. Where a
remote feature branch and `main` overlap, only what is on `main` was read.

---

## Executive summary

The app is in solid shape for an internal learning tool: RLS is correctly
owner-only on every user table, the `@navapbc.com` restriction is real
defense-in-depth (client guard + `SECURITY DEFINER` DB trigger with locked
`search_path`), the Anthropic key is strictly server-side, and there is zero
`any` / zero `TODO`/`@ts-ignore` in production source. The debt clusters in four
places:

1. **The chat Edge Function is effectively open** — authenticated only by the
   public anon key, wildcard CORS, no model allow-list, no `max_tokens` ceiling,
   no rate limit (a cost/abuse cluster the code itself flags as "later").
2. **Two P0 white-screen paths** — no error boundary anywhere, and an empty
   `modules` table crashes `Academy` (the `!phases` guard can't catch it because
   `groupIntoPhases` always returns 3 stages).
3. **Accessibility does not meet WCAG 2.1 AA** — despite the app teaching 508 in
   cell 1.7: quiz/exercise options expose state by color/icon only, modals have
   no focus management, dynamic feedback and streamed chat aren't announced, and
   `gray-400`/`gray-300` text fails contrast.
4. **No `strict` TypeScript and no ESLint** — `lint` is `tsc --noEmit` with strict
   off, so whole bug classes (null-safety, unused code, hook deps) are invisible;
   committed `eslint-disable` directives are enforced by nothing.

### Severity counts

| Lens | P0 | P1 | P2 | P3 | Total |
|------|----|----|----|----|-------|
| Security / auth / RLS / secrets | 0 | 2 | 3 | 2 | 7 |
| Data layer / migrations | 0 | 2 | 3 | 5 | 10 |
| LLM proxy / streaming | 0 | 4 | 4 | 4 | 12 |
| Frontend / state / hooks | 2 | 3 | 2 | 2 | 9 |
| Accessibility (WCAG 2.1 AA) | 0 | 5 | 8 | 4 | 17 |
| Build / types / dead code | 0 | 2 | 4 | 6 | 12 |
| **Total** | **2** | **18** | **24** | **23** | **67** |

P0 = crash / data-loss / unusable for a user group · P1 = serious · P2 = moderate
· P3 = minor. The table above is the **as-found baseline**. Severities are the
auditing agents' assessments; "suggested direction" was guidance for the fix pass.

### Resolution log

Findings are now being fixed in priority order, one PR per coherent group; each
resolved finding is marked **✅ Resolved** inline below.

| PR | Items closed | Status |
|----|--------------|--------|
| `fix/p0-crash-safety` | FE-01, FE-02, FE-07 | ✅ merged |
| `fix/chat-edge-hardening` | SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, LLM-01, LLM-02, LLM-03, LLM-04, LLM-06, LLM-07, LLM-08, LLM-12 + closes the "Edge Function SSE parser untested" coverage gap | ✅ merged |
| `fix/stream-cancellation` | LLM-05 | ✅ merged |

**Open remaining:** P0 **0** · P1 12 · P2 17 · P3 19 *(updated as PRs land).*

---

## Lens 1 — Security / auth / RLS / secrets

> No P0s. The data tables are well-protected; the exposure is the chat proxy.

### P1

**SEC-01 — chat Edge Function is reachable by anyone with the public anon key (no per-user / SSO check)**
`supabase/functions/chat/index.ts:9-11`; no `[functions.chat]` block in `supabase/config.toml` (default `verify_jwt=true`); client falls back to anon key at `src/lib/llm.ts:50-56`.
*Impact:* the gateway only checks that *a* valid JWT is present; the anon key is public by design (shipped in the bundle), so the `@navapbc.com` restriction does **not** protect the function. Anyone can use it as a free Claude relay and burn credits.
*Direction:* in the function, verify the bearer is a real user JWT (`getUser`) and assert the email domain; reject the bare anon key. Pair with SEC-04 rate limiting.

**SEC-02 — Wildcard CORS (`Access-Control-Allow-Origin: *`)**
`supabase/functions/chat/index.ts:24-29`.
*Impact:* any origin can invoke the proxy from a browser; combined with SEC-01 this broadens the abuse surface (not session-CSRF, since auth is a custom header, not a cookie).
*Direction:* echo a single allowed origin from an allow-list (dev localhost + prod domain).
**✅ Resolved** (`fix/chat-edge-hardening`): SEC-01 — the function now `createClient(...).auth.getUser()` and rejects anything that isn't a real user token (anon key → 401) plus a non-`@navapbc.com` user (403). SEC-02 — `buildCorsHeaders` echoes only an allow-listed origin (no `*`). Tested in `supabase/functions/chat/chat-core.test.ts` (`emailDomainAllowed`, `buildCorsHeaders`).

### P2

**SEC-03 — No model allow-list; client controls `model` verbatim** — `chat/index.ts:38,73-74`. A raw POST can request the most expensive model regardless of UI. *Direction:* validate against a server-side allow-list mirroring `CLAUDE_MODELS`.

**SEC-04 — Unbounded `max_tokens`, no message/size/rate limits** — `chat/index.ts:69-79`. Only validation is "messages is a non-empty array." *Direction:* clamp `max_tokens`, cap message count/size, validate `role`/`content` types, add per-user rate limiting.

**SEC-05 — Anthropic upstream error body forwarded verbatim to the client** — `chat/index.ts:101-107,181-183`. Low-grade info disclosure. *Direction:* log server-side, return a generic client message with the status.
**✅ Resolved** (`fix/chat-edge-hardening`): SEC-03 — `validateChatRequest` rejects any model outside `MODEL_ALLOWLIST`. SEC-04 — `clampMaxTokens` (ceiling 4096) + message-count/size caps + per-user `fixedWindowAllow` limiter. SEC-05 — upstream error is logged server-side and a generic message returned. Tested in `chat-core.test.ts`.

### P3

**SEC-06 — Dev email/password path + documented demo creds** — `supabase/config.toml:179-182`, `src/components/Login.tsx:13,130`, `supabase/seed.sql:13`. Acceptable for local-only; ensure email provider + seeding are disabled in any hosted config.

**SEC-07 — `content_versions` lockdown relies on absence of a policy** — `supabase/migrations/20260602130334_modules_content_as_data.sql:64,73-74`. Correct (RLS on, no permissive policy → denied) but implicit; add a regression test asserting denial.

### Passed (good)
RLS enabled + owner-only SELECT/INSERT/UPDATE on `profiles`/`module_progress`/`quiz_attempts`/`lab_submissions` (`20260528221204_init_core.sql:66-125`), DELETE intentionally denied (no policy); `modules` is authenticated read-only; `content_versions` fully locked. Domain trigger is `SECURITY DEFINER` + `set search_path = ''`, `BEFORE INSERT ON auth.users` (`20260601160455...:17-35`); `handle_new_user` likewise. `ANTHROPIC_API_KEY` only via `Deno.env` in the function, never VITE-prefixed, never in client. `git ls-files` tracks only `*.env.example` (placeholders); real `.env` files gitignored. No `service_role` in `src/`.

---

## Lens 2 — Data layer / migrations

### P1

**DATA-01 — Superseded migration (the known drift): Stage-1b content**
`supabase/migrations/20260602141611_stage_1b_content.sql` (superseded) vs `20260602190000_load_curriculum_content.sql` (winner).
*Impact:* `141611` authors cells 1.1/1.2/1.7/1.8/1.11/1.12 (`body_md`, `quiz_json`, `status='in_review'`, `version=version+1`); the later `190000` `UPDATE`s all 28 cells, **overwriting** those six bodies/quizzes with different content. After `db reset`, `141611`'s lesson text/quizzes never reach runtime — only its `in_review` status + inflated `version` survive, leaving inconsistent provenance (190000's content + 141611's status).
*Direction:* make `curriculum-content.json` canonical, regenerate `190000`, and either drop `141611`'s dead body/quiz writes or exclude those six cells from `190000`'s sweep; document the supersession.

**DATA-02 — Optimistic completion can be silently lost — "It will retry later" is false**
`src/lib/useProgress.ts:95-97` (and `61-82`).
*Impact:* `completeModule` updates local state then fires `setModuleStatus(...).catch(...)` with a message promising a retry — but **no retry exists**. The reconcile effect only *reads*, and on next load **replaces** local state with the server snapshot, so a failed write disappears (and with gating, can re-lock passed content).
*Direction:* a real outbox (persist pending writes, flush on reconnect) or a merge-not-replace reconcile; at minimum fix the misleading message.
*Documented by:* `src/lib/useProgress.test.tsx` → `test.skip('… retried/flushed … (DOCUMENTS: DATA-02)')`.

### P2

**DATA-03 — Quiz attempt persisted in a `[showResults]` effect → StrictMode/re-render double-record** — `src/components/Quiz.tsx:43-57`. `quiz_attempts` is append-only with no dedupe; dev StrictMode writes two rows per completion. User-visible scoring is unaffected (best/latest reduce is dupe-safe) but the table accumulates phantom attempts. *Direction:* guard with a `useRef` or move the insert into the explicit "See Results" transition. *Documented by:* `src/components/Quiz.test.tsx` → `test.skip('… exactly one attempt … StrictMode (DOCUMENTS: DATA-03 / FE-04)')`.

**DATA-04 — Exercises set `graded=true` before the auth/save check; retry re-appends rows** — `DataClassifier.tsx:47-78`, `ToolTriage.tsx:40-69`, `ScenarioExercise.tsx:50-79`. Graded-but-unsaved state when signed out; `handleRetry`+resubmit appends another `lab_submissions` row (append-only, no dedupe). Low user impact (practice, not the gate). *Direction:* set `graded` after save resolves, or upsert-by-(user,lab) if only latest should persist.

**DATA-05 — `version = version + 1` is non-idempotent in a migration** — `20260602141611_*.sql:76,…`, `20260602190001_*.sql:67`. Safe on normal `db reset` (run-once) but contradicts "safe to re-run" headers and is a manual-replay footgun. *Direction:* set absolute versions or gate the bump.

### P3

- **DATA-06** — `fetchModuleProgress` `latestInProgressId` relies on DB ordering with no secondary sort key; ties non-deterministic — `src/lib/progress.ts:38-54`. Minor (resume position only).
- **DATA-07** — `fetchQuizSummary` best/latest reduce is correct (strict `>` keeps earliest on ties; ISO timestamps sort lexicographically) — `src/lib/progress.ts:147-150`. Informational, no bug.
- **DATA-08** — `seed.sql` demo progress uses legacy ids `p1-m0`/`p1-m1` that don't exist in `modules`; `resolveCurrentModuleId` ignores them so no crash, but the demo data is meaningless — `supabase/seed.sql:57-67`. *Direction:* use real cell ids.
- **DATA-09** — `seed-data/curriculum-content.json` is generator-input only (no runtime import), so no runtime drift; but hand-editing the generated SQL can silently diverge from it. Informational.
- **DATA-10** — `progressCache` has no version/invalidation and is clobbered by reconcile; `JSON.parse(...) as UserProgress` trusts stale shapes — `src/lib/progressCache.ts:20-39`. *Direction:* version the cached payload.

### Passed (good)
`module_progress` `unique(user_id,module_id)` matches the upsert `onConflict`; insert payloads match columns (`rubric_scores`/`grader` nullable, left null); `sorter_config_json` column added (`160616`) before runtime reads/seeds it; all post-`190000` seeds guard on `… is null` (re-run-safe); `130334` uses `on conflict (cell_id) do nothing`. All `progress.ts` errors `throw`; swallowing is intentional at React call-sites (except the DATA-02 caveat).

---

## Lens 3 — LLM proxy / streaming

### P1 (the cost/abuse cluster — address together)

**LLM-01 — No rate limit, request-size cap, or abuse protection** — `supabase/functions/chat/index.ts:43-158`; none in `config.toml`. Anyone with the anon key can drive unlimited paid calls. *Direction:* per-user token-bucket keyed off the verified JWT `sub`, body byte cap, daily budget.

**LLM-02 — Effectively unauthenticated pre-SSO (anon key is public)** — `chat/index.ts:9-11`, `src/lib/llm.ts:50-63`. The JWT check is satisfied by the public anon fallback. *Direction:* require a real user session; drop the anon fallback for billable calls. (Same root as SEC-01.)

**LLM-03 — No model allow-list** — `chat/index.ts:39,74`, `src/lib/llm.ts:68`. (Same as SEC-03.) *Direction:* server-side allow-list.

**LLM-04 — No `max_tokens` ceiling** — `chat/index.ts:40,75`. Client value forwarded unclamped. *Direction:* `Math.min(requested, CEILING)` + positive-integer validation. (Pairs with SEC-04.)

**✅ Resolved** (`fix/chat-edge-hardening`): LLM-01 per-user `fixedWindowAllow` limiter (30/min) + message-count/size caps; LLM-02 real `getUser()` auth (anon key rejected); LLM-03 `MODEL_ALLOWLIST`; LLM-04 `clampMaxTokens` (ceiling 4096). All in `chat-core.ts`, unit-tested in `chat-core.test.ts`.

### P2

**LLM-05 — Client streaming has no AbortSignal / cancellation** — `src/lib/llm.ts:35-94` (no `signal`; loop only exits on `done`); consumers `Playground.tsx:96`, `PromptLab.tsx:61`. Unmount/new-send leaks the request and keeps billing; `onChunk` can fire after unmount. No "stop generating" control. *Direction:* thread an `AbortSignal` into `StreamOptions`/`fetch`/`reader.cancel()`; abort in a cleanup effect. *Documented by:* `src/lib/llm.test.ts` → `describe.skip('… cancellation (DOCUMENTS: LLM-05)')`.
**✅ Resolved** (`fix/stream-cancellation`): `StreamOptions.signal` threads into `fetch` + the read loop (intentional aborts resolve cleanly, not as errors). `Playground` and `PromptLab` abort on unmount and on a new send; the Playground gains a **Stop** button. Test unskipped → `src/lib/llm.test.ts` "cancellation (LLM-05)". *(The Edge-Function read/idle timeout for a stalled upstream remains a noted sub-item of LLM-07.)*

**LLM-06 — Mid-stream Anthropic `error` events forwarded as inline text** — `chat/index.ts:181-183`. Since 200 was already sent, the client appends `[stream error: …]` as assistant *content*; `try/catch` never fires and bad output can be saved as a lab transcript. *Direction:* `controller.error()` or a sentinel the client converts to an error state.

**LLM-07 — Stream can hang / `isStop` substring-matches** — `chat/index.ts:118-148,191-193`. No read/idle timeout (a stalled upstream blocks `read()` forever); `isStop` uses `String.includes('"type":"message_stop"')` (fragile). *Direction:* idle timeout that aborts upstream; detect stop via parsed JSON `type`.

**LLM-08 — Weak input validation** — `chat/index.ts:62-79`. Item shapes, `role` enum, `content`/`system`/`model`/`max_tokens` types unchecked; forwarded to Anthropic. *Direction:* validate each field, 400 on failure.

**✅ Resolved** (`fix/chat-edge-hardening`): LLM-06 a mid-stream `error` event now `controller.error()`s (no longer rendered as content) — `parseEvent` returns a discriminated `{type:'error'}`. LLM-07 `isStop` parses the event `type` (no substring false-positive). LLM-08 `validateChatRequest` checks every field, 400 on failure. LLM-12 allow-listed CORS (≡ SEC-02). All unit-tested in `chat-core.test.ts`. *(LLM-05 is handled in the next PR; a read/idle timeout for a stalled upstream is noted there as a remaining sub-item.)*

### P3

- **LLM-09** — No Anthropic prompt caching (no `cache_control` breakpoints); the stable system/persona prefix is re-sent uncached every turn — `chat/index.ts:73-79`, `Playground.tsx:58,96`. Cost debt. *Direction:* send `system` as a content-block array with an ephemeral `cache_control` breakpoint.
- **LLM-10** — Models are unpinned aliases, not dated snapshots — `chat/index.ts:16`, `src/lib/models.ts:13-16`. The ids (`claude-haiku-4-5`, `claude-sonnet-4-6`) are plausibly current; the issue is reproducibility/stability of floating aliases (graded lab transcripts become non-reproducible). *Direction:* pin dated snapshots with a deliberate upgrade step.
- **LLM-11** — `anthropic-version` pinned to `2023-06-01` — `chat/index.ts:20,87`. Correct practice; note only (newer beta features may need an `anthropic-beta` header).
- **LLM-12** — Wildcard CORS on the proxy — `chat/index.ts:24-29`. (Same as SEC-02.)

### Passed (good)
Key isolation correct. Pre-stream error handling is thorough (missing key→500, bad JSON→400, empty messages→400, upstream failure→502, non-200 surfaces status+detail; client parses `{error}` and throws). SSE buffering across chunk boundaries is correct (`split('\n\n')` + `events.pop()` retains the partial; multi-line `data:` joined; `[DONE]`/non-JSON ignored). On explicit stop the upstream reader is cancelled and the lock released. Raw-fetch+reader (not `functions.invoke`) is the right call for incremental streaming.

> **Note:** the Edge Function's SSE parsing (`parseEvent`/`isStop`) is a Deno module with a top-level `Deno.serve()` and cannot be imported under vitest without editing source, so it is **not** unit-tested here (see Coverage gaps). It is exercised indirectly by the E2E stub.

---

## Lens 4 — Frontend / state / hooks

### P0 — crash / white-screen

**FE-01 — No error boundary anywhere; any render throw white-screens the app** — `src/main.tsx:6-13` (and absence across `src/`). The carefully-built loading/error states only cover the curriculum *fetch*, not render-time throws. *Direction:* a top-level `ErrorBoundary` wrapping `<App/>` with a reload/contact fallback.
**✅ Resolved** (`fix/p0-crash-safety`): added `src/components/ErrorBoundary.tsx` (class boundary with `getDerivedStateFromError`/`componentDidCatch` + reload fallback), wrapping `<App/>` in `main.tsx`. Tests: `src/components/ErrorBoundary.test.tsx`.

**FE-02 — Empty curriculum crashes `Academy` (the `!phases` guard never fires)** — `src/App.tsx:54,90-91`; root cause `src/lib/modules.ts:89-94`. `groupIntoPhases` always returns 3 Phase objects, so `phases` is never `null`/`[]`; with an empty `modules` table `allModules[0]` is `undefined` and `currentModule.phaseId` throws (white-screen, compounded by FE-01). *Direction:* treat an empty curriculum as the error/empty state; guard `currentModule` before dereferencing. *Documented by:* `src/lib/modules.extra.test.ts` (the "always 3 stages" test pins the precondition).
**✅ Resolved** (`fix/p0-crash-safety`): `AcademyApp` now computes `isEmpty = phases.every(p => p.modules.length === 0)` and renders the friendly empty-state instead of mounting `Academy`. Tests: `src/App.empty.test.tsx`.

### P1

**FE-03 — `completeModule` can advance the cursor into a locked Stage-2 module** — `src/lib/useProgress.ts:84-100` × `gating.ts:32`. Advance is `allModuleIds[index+1]` with no gating awareness; completing a Stage-1b cell that precedes a Stage-2 cell (while Stage 1a is incomplete) bounces the learner to `LockedNotice` on a normal "Continue." *Direction:* skip locked modules when advancing (pass a selectable predicate into `useProgress`). *Documented by:* `src/lib/gating.extra.test.ts` → `test.skip('… must not land on a locked Stage-2 module (DOCUMENTS: FE-03)')`.

**FE-04 — Quiz double-records under StrictMode (suppressed exhaustive-deps is load-bearing)** — `src/components/Quiz.tsx:43-57`. (Same defect as DATA-03, frontend framing.) *Documented by:* the same `Quiz.test.tsx` skip marked `DOCUMENTS: DATA-03 / FE-04`.

**FE-05 — Quiz `score` accumulated imperatively, decoupled from the recorded `answers`** — `src/components/Quiz.tsx:62,75-79`. Safe today (post-submit options disabled; `selected!` guarded by disabled Submit) but fragile: the pass-gate and recorded score have no relationship to the `answers` map. *Direction:* derive `score` from `answers` vs `correctIndex` at results time.

### P2

**FE-06 — `ModuleRenderer` renders nothing for `type:'lab'` with no/unhandled config** — `src/components/ModuleRenderer.tsx:63-110,189`. No `case 'lab'`; a lab module with missing `labConfig` (or a kind not in the switch) shows the video + maybe content and **no exercise, no quiz, no complete button** — a silent dead-end blocking downstream gated content. *Direction:* a visible "not configured / contact support" fallback. *Documented by:* `src/components/ModuleRenderer.dispatch.test.tsx` → `test.skip('… fallback instead of a silent dead-end (DOCUMENTS: FE-06)')`. (Note: `PromptLab` itself *does* degrade gracefully when reached — the gap is unhandled kinds / missing config at the dispatch.)

**FE-07 — `useCurriculum` `loading` derivation can't represent "loaded but empty"; double-fetch in dev** — `src/lib/useCurriculum.ts:39`. Ties to FE-02; the `cancelled` flag prevents the unmount warning but two fetches fire in StrictMode dev. *Direction:* explicit `loading`/`empty` states.
**✅ Resolved** (`fix/p0-crash-safety`): the "loaded but empty" case is now represented and handled at the `App` boundary (FE-02 fix). The dev-only double-fetch is a benign StrictMode artifact (already cancelled), left as-is by design.

### P3

- **FE-09** — Array-index `key`s on dynamic lists — `Quiz.tsx:165`, `ModuleRenderer.tsx:175,217`, `UseCaseLib.tsx:74`, `Playground.tsx:266`, exercises. Benign for fixed-order/append-only lists today; fragile if they become reorderable. *Direction:* key on stable ids where available.
- **FE-10** — `PrivacySimulator` `setInterval` not cleared on unmount — `src/components/PrivacySimulator.tsx:10-23`. Dev warning + brief timer leak. *Direction:* store the id in a ref and clear in cleanup.

### Passed (good)
`App.tsx:77-99` `useMemo`s `allModules`/`allModuleIds`/`stage1a`, giving `useProgress`'s reconcile effect a stable array dep (no re-run-per-render). All async effects use a `cancelled` cleanup flag. `gating.ts:28` guards `total>0` so an empty/loading curriculum can't wrongly unlock Stage 2; `App.tsx:104-107` double-guards locked selection. `useProgress` keeps optimistic state on write failure with a dismissible error. Rules-of-Hooks: clean across all audited files (`Quiz`/`PromptLab` early-return *after* all hooks). Empty quiz handled (`Quiz.tsx:59`).

---

## Lens 5 — Accessibility (WCAG 2.1 AA / Section 508)

> The app teaches 508 in cell 1.7 but does **not** currently pass AA.

### P1

- **A11Y-01 — Quiz/exercise option buttons expose state by color/icon only (no radio semantics, no `aria-pressed`)** — `Quiz.tsx:163-181`; `DataClassifier.tsx:129-178`, `ToolTriage.tsx:114-134`, `FailureSpotter.tsx:102-122`, `ScenarioExercise.tsx:124-144`. SC 4.1.2, 1.4.1, 4.1.3. *Direction:* radiogroup pattern (`role=radiogroup`/`radio`+`aria-checked`) or `aria-pressed`; add visually-hidden "correct/your answer" after grading.
- **A11Y-02 — Modals have no focus trap, no Escape, no focus move-in/restore, no dialog role** — `SupportModal.tsx:19-108`, `LocalTutorFAB.tsx:16-55`. SC 2.4.3, 4.1.2, 2.1.1. *Direction:* `role=dialog`/`aria-modal`, focus management, trap, Escape, restore (consider a headless dialog primitive).
- **A11Y-03 — Graded feedback / score / "saved" confirmations not announced** — `Quiz.tsx:94-100,185-217`, all exercises, `ReflectionCapture.tsx:82-102`. SC 4.1.3. *Direction:* `role=status`/`aria-live=polite` or move focus to the feedback.
- **A11Y-04 — Streaming chat responses not in a live region** — `Playground.tsx:263-307`, `PromptLab.tsx:218-234`. SC 4.1.3. *Direction:* `aria-live=polite` + `aria-busy`; announce on completion to avoid token chatter.
- **A11Y-05 — Low-contrast `text-gray-400`/`text-gray-300` on white (~2.6:1 / ~1.6:1)** — widespread (`Quiz.tsx:96`, `Login.tsx:85,128`, `Sidebar.tsx:108,164,169,201`, `Header.tsx:49`, `PromptLab.tsx:149,208,225`, `Playground.tsx:242,248,332`). SC 1.4.3. *Direction:* `gray-500`+ for normal text; reserve `gray-400`/`300` for decorative icons/large text.

### P2

- **A11Y-06** — Icon-only buttons missing accessible names — `SupportModal.tsx:49`, `LocalTutorFAB.tsx:37,59`, `Sidebar.tsx:56`, `Header.tsx:40`, `Playground.tsx:42`. (Header sign-out at `:96` is a good counter-example.) SC 4.1.2. *Direction:* `aria-label` + `aria-hidden` on the icon.
- **A11Y-07** — Loading spinners have no accessible text / `aria-busy` — `App.tsx:29,50`, `Login.tsx:74,124`, submit spinners across exercises. SC 4.1.3/1.1.1.
- **A11Y-08** — Progress bars are non-semantic divs (no `role=progressbar`/values) — `Quiz.tsx:151-156`, `Sidebar.tsx:188-194`. SC 1.1.1/4.1.2.
- **A11Y-09** — Heading hierarchy skips/duplicates (`<h3>` cards with no parent `<h2>`; brand `<h1>` in sidebar + markdown `<h1>`) — `Sidebar.tsx:54,110`, `Quiz.tsx:93,147`, `ModuleRenderer.tsx:155`. SC 1.3.1.
- **A11Y-10** — Module nav isn't list/`<nav>` semantic; no skip link — `Sidebar.tsx:119-176`. SC 1.3.1/2.4.1.
- **A11Y-11** — SupportModal disabled action is `<a href="#">` (focusable, no disabled state); validation msg not `role=alert`/associated — `SupportModal.tsx:83-97`. SC 4.1.2/3.3.1.
- **A11Y-12** — Several inputs labelled by placeholder/unlinked label — `SupportModal.tsx:67-72`, `ReflectionCapture.tsx:105`, `PromptLab.tsx:174`, `Playground.tsx:312`, `Header.tsx:61` select. (Login email/password are correct.) SC 1.3.1/3.3.2.
- **A11Y-13** — App error/status banners not announced (`role=alert`) — `App.tsx:153-163`, `Login.tsx:60-65`, exercise `saveError` lines. SC 4.1.3/3.3.1.

### P3

- **A11Y-14** — `prefers-reduced-motion` honored for only one custom class; framer-motion entrances, infinite spinners, blinking cursor not gated — `src/styles/globals.css:592-597` + components. SC 2.3.3/2.2.2. *Direction:* `MotionConfig reducedMotion="user"` + extend the media query.
- **A11Y-15** — Disabled buttons rely on `opacity-50` (may drop white-on-color text below contrast) — `Quiz.tsx:224`, `LockedNotice.tsx:38`, etc. (Disabled controls are 1.4.3-exempt; readability nit.)
- **A11Y-16** — Persona tooltip is hover-only / `pointer-events-none` (not keyboard/SR reachable) — `Header.tsx:71-80`. SC 1.4.13.

### Passed (good)
`<html lang="en">` + title; Login inputs use `<label htmlFor>`+`autoComplete`; Header sign-out has `aria-label`; Google `<svg>` is `aria-hidden`; almost all controls are real `<button>`/`<a>`/`<select>` (no clickable-div traps); locked sidebar rows are non-interactive `<div aria-disabled>`; `<main>`/`<nav>`/`<aside>` landmarks present; iframe has a `title`; ⌘/Ctrl+Enter send shortcut. *(`src/base.css` is leftover coverage-report CSS, not app UI.)*

---

## Lens 6 — Build / types / dead code

### P1

**TYPE-01 — `tsconfig.json` does not enable `strict` (or any strict sub-flag)** — `tsconfig.json:2-25`. Missing `strict`/`strictNullChecks`/`noImplicitAny`/`noUnusedLocals`/… Since `lint`==`tsc --noEmit` is the only gate, null-deref, implicit-any, and dead-code classes are invisible (and the `as`/`!` patterns below are only "safe" because nothing checks them). *Direction:* enable `strict` and triage incrementally.

**TYPE-02 — No ESLint configured, but `eslint-disable` directives are committed** — no `.eslintrc*`/`eslint.config.*`; disables at `Quiz.tsx:56`, `modules.test.ts:26,33`. The `react-hooks/exhaustive-deps` suppression hides the real DATA-03/FE-04 effect-deps gap; nothing enforces hook/a11y/unused rules. *Direction:* add ESLint (`@typescript-eslint`, `eslint-plugin-react-hooks`) wired into `lint`, or remove the misleading directives.

### P2

- **DEAD-01** — `src/data/quiz.ts` (`QUIZ_DATA`) orphaned (superseded by DB `quiz_json`); its own header says so — `src/data/quiz.ts:8,11`. *Direction:* move to a labeled `seed/` outside `src`, or delete.
- **DEAD-02** — `src/data/phases.ts` + `src/content/1.4.md` + `2.1.md` orphaned cluster (superseded by content-as-data DB fetch) — `phases.ts:2-3,36,93`. The `.md?raw` imports look live but aren't. *Direction:* relocate/delete.
- **DEAD-03** — `RECOMMENDED_RESOURCES` exported but never consumed — `src/data/resources.ts:1`, `src/constants.ts:3`. *Direction:* remove or wire into a resources view.
- **TYPE-03** — Unchecked `as` casts of Supabase rows can hide schema drift — `modules.ts:119` (`as ModuleRow[]` blesses 3 JSON columns), `progress.ts:50-54,142-149`. *Direction:* `supabase gen types` or zod-validate JSON columns at the mapping boundary.

### P3

- **BUILD-01** — `vite` in BOTH `dependencies` and `devDependencies` — `package.json` (both `^8.0.10`). *Direction:* keep only in devDependencies.
- **BUILD-02** — `tsconfig` declares `paths` without `baseUrl`; the `@/*` alias is effectively unused (all imports relative) — `tsconfig.json:18-22`. *Direction:* add `baseUrl` or drop the alias.
- **TYPE-04** — `selected!` non-null assertion — `Quiz.tsx:77` (UI-guarded). *Direction:* early-return instead.
- **TYPE-05** — `module.quiz!` — `ModuleRenderer.tsx:164` (guarded; `:68` does it safely with `?? []`). *Direction:* use `?? []`.
- **TYPE-06** — `JSON.parse(raw) as UserProgress` unvalidated — `progressCache.ts:28`. (Same as DATA-10.)
- **TYPE-07** — `e.target.value as AIPersona` — `Header.tsx:63` (options generated from the union; very low risk).

### Inventories (complete)
- **`any` in production source:** none. (`modules.test.ts:26-33` use `as any` deliberately to test the fallback; `quiz.ts:31` and `progress.test.ts:35` are false positives in strings/comments.)
- **`TODO`/`FIXME`/`HACK`/`XXX`/`@ts-ignore`/`@ts-expect-error`:** none in `src`/`supabase`. `eslint-disable`: `Quiz.tsx:56`, `modules.test.ts:26,33` only.

### Passed (good)
Zero `any`/`@ts-ignore`/`TODO` in production code. Supabase access layer is well-isolated and documented; `mapRowToModule` uses safe `?? ''`/`?? undefined` fallbacks. The flagged "orphan" *components* (LocalTutorFAB, PrivacySimulator, UseCaseLib, Playground) and `lib/models.ts` are all actually used. `npm run lint` (tsc) and `npm run build` both pass clean on `main` + this branch.

---

## Test coverage baseline

New suite added this pass (all green): **`npm run test` → 92 passed, 9 skipped (101 total) across 18 files**; **E2E → 7 passed**; **RLS integration → 4 passed with `RUN_DB_TESTS=1`**.

### Covered

**Unit (mocked supabase/fetch — always run, incl. CI):**
- `src/lib/progress.unit.test.ts` — payload shape + error propagation for `recordQuizAttempt`/`recordLabSubmission`/`setModuleStatus`/`fetchModuleProgress`/`fetchQuizSummary` (mapping incl. best/latest).
- `src/lib/modules.extra.test.ts` + existing `modules.test.ts` — `mapRowToModule` field mapping & null-body→`''`; `groupIntoPhases` stage order/empty stages (pins the FE-02 precondition); `isModuleLive` stub-vs-real; sorter config mapping.
- `src/lib/llm.test.ts` — `streamChat` happy path (chunk forwarding, request body), non-200 `{error}`, no-body, non-JSON-error, not-configured.
- `src/lib/gating.test.ts` + `gating.extra.test.ts` — Stage-1a progress/done, lock rules, first-incomplete, Stage-2 lock interaction.
- `src/lib/resolveCurrentModuleId.test.ts` — cursor/in-progress/first-incomplete/all-done/none edge cases.
- `src/lib/progressCache.test.ts` — round-trip / absent / corrupt-JSON.
- `src/components/scenarioSorter.grade.test.ts` — sorter grading.

**Component (jsdom + RTL):**
- `Quiz.test.tsx` — renders options, computes score, 100% pass gate, records the attempt, `onComplete` only on pass (and not on a sub-100% run).
- `exercises/exercises.test.tsx` — DataClassifier / ToolTriage / FailureSpotter / ScenarioExercise grade + `recordLabSubmission` + (structurally) no `onComplete`; ReflectionCapture word-floor gate + save.
- `ModuleRenderer.dispatch.test.tsx` — every `module.type` and every `labConfig.kind` routes to the right child; complete-button suppression when an inline quiz exists.
- `Login.test.tsx` — domain-restriction message + auth-guard message precedence.
- `LockedNotice.test.tsx` — progress copy + go-to-Stage-1a button enabled/disabled.
- `auth.test.tsx` — AuthProvider `@navapbc.com` allow / reject-and-sign-out / case-insensitive.
- `useProgress.test.tsx` — `completeModule` advance + sync, no-overrun, `selectModule` in_progress, optimistic-keep-on-failure.

**Integration (gated `RUN_DB_TESTS=1` + live stack; SKIP otherwise):**
- `progress.test.ts` (pre-existing) — module/quiz write + read-back for the owning user.
- `rls.integration.test.ts` (new) — domain trigger rejects non-nava signup; profile trigger creates the row; owner write/read-back for progress/quiz/lab; **second user cannot read the first user's rows** (RLS isolation).

**E2E (Playwright, stubbed Claude; local-only, not in CI):** sign-in as dev nava user + non-nava rejected; quiz pass at 100% persists across reload; data-classifier exercise end-to-end; 2.1 prompt lab returns the stubbed completion; Stage gating locked→unlocked; reflection saves.

### Gaps (not yet covered)
- ~~**Edge Function SSE parsing**~~ — **✅ Closed** (`fix/chat-edge-hardening`): the pure logic was extracted to `supabase/functions/chat/chat-core.ts` and is now unit-tested in `chat-core.test.ts` (`parseEvent`/`isStop` + request validation, model allow-list, max_tokens clamp, CORS, limiter). The Deno-only glue in `index.ts` (auth via `getUser`, the real `fetch`, the in-memory limiter instance) is still verified by inspection + the E2E stub for the client path; a read/idle timeout for a stalled upstream remains a noted sub-item of LLM-07.
- **`Playground`, `Header`, `Sidebar`, `SupportModal`, `LocalTutorFAB`, `PrivacySimulator`, `UseCaseLib`** — no component tests yet.
- **`App.tsx` empty-curriculum crash (FE-02)** — pinned at the unit level (`groupIntoPhases` always returns 3 stages) but no full-App render test reproducing the white-screen.
- **Accessibility** — no automated a11y assertions (e.g. axe) wired in; the WCAG findings above are from manual audit.
- **E2E is not in CI** — needs a provisioned Supabase stack + seeded user; a commented job + local instructions are in `.github/workflows/ci.yml`. E2E also assumes a freshly reset DB (no DELETE policy → no per-test cleanup) and runs serially.

---

## Bugs documented as skipped tests

Every skipped/`fixme` test below maps to a finding id and is marked in-code with
`// DOCUMENTS: <id>`. These intentionally fail-if-unskipped against current source
and should be un-skipped by the fix that resolves the finding.

| Test (file → name) | Documents | What it asserts (the desired contract) |
|---|---|---|
| ~~`src/lib/llm.test.ts` → `describe.skip('streamChat — cancellation …')`~~ | **LLM-05** | ✅ **Resolved & unskipped** (`fix/stream-cancellation`) — now an active passing test |
| `src/lib/useProgress.test.tsx` → `test.skip('… retried/flushed …')` | **DATA-02** | a failed completion write is retried/flushed, not silently lost |
| `src/lib/gating.extra.test.ts` → `test.skip('… not land on a locked Stage-2 module')` | **FE-03** | advancing past a Stage-1b cell never lands on a locked Stage-2 cell |
| `src/components/Quiz.test.tsx` → `test.skip('… exactly one attempt … StrictMode')` | **DATA-03 / FE-04** | one completed run records exactly one `quiz_attempts` row under StrictMode |
| `src/components/ModuleRenderer.dispatch.test.tsx` → `test.skip('… fallback instead of a silent dead-end')` | **FE-06** | a `type:'lab'` module with no config shows a fallback, not nothing |

*(The 4 RLS integration tests also report as "skipped" in a default `npm run test`
run, but they are environment-gated infrastructure — they PASS with `RUN_DB_TESTS=1`
— not documented bugs.)*

---

## How to run

```bash
npm run lint        # tsc --noEmit (passes clean)
npm run build       # vite build (passes clean)
npm run test        # vitest run — unit + component (92 passed, 9 skipped)

# Integration (RLS + triggers) — needs a local stack:
npx supabase start
RUN_DB_TESTS=1 npm run test            # +4 RLS/trigger tests

# E2E (local only) — needs the stack + a fresh DB; Claude is stubbed:
npx supabase db reset                  # clean slate (gating asserts locked-before)
npx playwright install chromium
npm run test:e2e                       # 7 passed; runs serially in file order
```

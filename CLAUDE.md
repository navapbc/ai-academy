# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Nava AI Academy — an internal AI-literacy training platform: a champion-led cohort
course program (Course 1, Weeks 0–4) plus ungated supplemental coursework (the Nava AI
Literacy Skills Matrix cells) and standalone resources. A React 19 + Vite SPA backed by
Claude (via API) and a Supabase data layer. Runs fully locally in development.

## Commands

```bash
npm run dev            # Vite dev server on :3000 (e2e uses :5173)
npm run build          # vite build -> dist/
npm run lint           # tsc --noEmit && eslint .  (lint:types / lint:eslint run each half)
npm test               # vitest run (unit + component + Edge-Function pure-logic)
npm run test:watch     # vitest watch
npm run test:e2e       # Playwright (needs live stack; see below)
```

Run a single test: `npx vitest run src/lib/modules.test.ts` or filter by name with `-t "substring"`.

### Full local stack (three terminals; Docker Desktop must be running)

```bash
npx supabase start                                            # Postgres + Auth + Studio (:54323)
npx supabase functions serve --env-file supabase/functions/.env  # the chat/grade proxies — AI 503s without this
npm run dev
```

`npx supabase status` (URLs + keys), `npx supabase stop` (preserves data), `npx supabase db reset`
(re-runs migrations + seed — **required before an e2e run**). One-time: `cp .env.example .env` and
`cp supabase/functions/.env.example supabase/functions/.env` (set `ANTHROPIC_API_KEY` in the latter).

Sign-in is Google SSO restricted to `@navapbc.com`; for local work use the dev-only
email/password fallback with the seeded `demo@navapbc.com` / `demo-password`.

## Architecture

### The Claude key never reaches the browser
The `ANTHROPIC_API_KEY` lives only in the Deno runtime of two Supabase Edge Functions; the
client always calls those, never Anthropic directly.
- **`supabase/functions/chat`** — streaming text proxy. `src/lib/llm.ts` reads it with raw
  `fetch` + a stream reader (not `supabase.functions.invoke`, which buffers) so tokens render
  incrementally.
- **`supabase/functions/grade`** — LLM-as-judge returning one structured anchor-scored JSON
  verdict. Called from `src/lib/grading.ts` (`requestLlmGrade`).

Both functions enforce real auth (signed-in `@navapbc.com` user — the public anon key alone is
rejected), an allow-listed CORS origin, input validation/model allow-list, and a per-user rate
limit. Each Edge Function keeps its **pure logic in a sibling file** (`chat/chat-core.ts`,
`grade/verdict.ts`) so it's Deno-agnostic and unit-testable under node/vitest.

### Content-as-data (important — older docs are stale here)
The curriculum is **not** static source. It lives in the Supabase `modules` table, one row per
lesson (`origin` = matrix cell / course lesson / custom lesson), and is fetched at runtime
(`src/lib/useCurriculum.ts` → `src/lib/modules.ts`, which maps rows to the
`Module`/`CurriculumSection` types in `src/types.ts`). Quizzes come from each row's
`quiz_json`, lab config from `lab_config_json`, sorter config from `sorter_config_json`. Editing a
row changes a lesson with no rebuild. New/changed curriculum is seeded via
`supabase/migrations/*seed*.sql` + `supabase/seed-data/curriculum-content.json` (matrix) and
`course1-content.json` (course); see `docs/content-guide.md` for the authoring workflow.

### App flow
`App.tsx`: `useAuth` → (Login | `Academy`). `Academy` flattens the curriculum sections and owns
`useProgress`. An empty `modules` table is treated as an error state (not a crash — guard added
for audit FE-02).

### Progress & sync (`src/lib/`)
Supabase is the source of truth; localStorage is a read-through cache + offline fallback.
`progress.ts` = pure async Supabase data-access (RLS owner-only). `useProgress.ts` = optimistic
React state: hydrate from `progressCache` → reconcile with Supabase → persist both. Failed
completion writes park in a per-user durable outbox (`pendingWrites.ts`) and replay on next
reconcile, so a completion is never lost.

### Curriculum structure & visibility
Sections come from the `courses`/`course_weeks`/`course_week_modules` tables: course weeks first,
then "Supplemental coursework" (unassigned matrix cells), then "Resources & additional lessons"
(custom lessons) — see `groupCurriculum` in `src/lib/modules.ts`. Navigation is fully
**unlocked** (stage gating was deleted in the cohort restructure); what a learner *sees* is the
`modules.visibility` RLS rule: `visibility = 'public' OR has_program_access() OR is_staff()`, so
`'program'` rows never reach an unenrolled browser. Completion is participation-based: a recorded
lab submission / finished quiz attempt auto-completes its module through the `progress.ts`
participation seam, and every module also offers a "Mark as explored" footer (`completed_via` is
stamped truthfully). Publish-with-reset uses an epoch protocol: `modules.progress_reset_at` +
a DB trigger reject completion writes echoing a stale epoch, so caches/outboxes can never
resurrect reset progress.

### Exercises & grading
`ModuleRenderer.tsx` dispatches on the module's `labConfig.kind` (a discriminated union in
`types.ts`) to one of the `src/components/exercises/*` components — including the restructure's
`chat-compare` (N-pane live Claude comparison) and `decision-scenario` (checkpointed workflow
walkthrough) kinds. **Add new exercise types additively** as new union members + a new switch
case, so parallel PRs merge cleanly. Quizzes never gate completion (finishing at any score
records the attempt and completes via the participation seam). Two graders produce the same
`GradeResult` shape: the LLM judge and a pure auto-key grader (`src/lib/grading/autoGrade.ts`).
`useLabGrading.ts` is the shared judge-grading hook (state + in-place retry of an already-saved
submission) used by all judge-graded labs.

### Branding
`src/branding.ts` exposes `BRANDING` + `injectBranding()`, which replaces `{{COMPANY}}` /
`{{FULL_COMPANY}}` / `{{TAGLINE}}` placeholders in markdown content at render time.

## Testing layout

- **vitest** default environment is `node`. Component tests opt into jsdom **per file** with a
  docblock: `// @vitest-environment jsdom`. The suite includes `src/**/*.test.{ts,tsx}` and the
  Edge Functions' pure-logic tests (`supabase/functions/**/*.test.ts`); `e2e/` is excluded.
- **DB-gated suites** (`rls.integration.test.ts`, `progress.test.ts`) need a live local stack and
  `RUN_DB_TESTS=1`; they **skip automatically** when no stack is reachable, so plain `npm test`
  stays green without a database.
- **Playwright** (`e2e/`) runs serially against `:5173` + a live Supabase stack on a **freshly
  reset DB**, sharing one seeded demo user (no per-test cleanup; specs are order-dependent). The
  Claude call is **stubbed at the network layer** (`POST **/functions/v1/chat`), so no API key is
  needed. Not wired into CI yet.
- **CI** (`.github/workflows/ci.yml`): `lint` + `build` + `test`, plus a separate `db-tests` job
  that runs `supabase start` and the gated suites with `RUN_DB_TESTS=1`.

## Conventions

- Strict TypeScript (`noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`,
  `noFallthroughCasesInSwitch`). Production source has zero `any` / `@ts-ignore`. `tsconfig.json`
  **excludes `supabase/`** (Edge Functions are Deno).
- Path alias `@/*` → repo root (configured in `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`).
- Code comments and commits reference audit IDs (e.g. `D-08`, `LB-5`, `FE-02`, `SEC-01`,
  `LLM-05`) and plan task IDs (`P3.2`, `W2-3`). `docs/DEBT-REPORT.md` is the audit ledger;
  `PROJECT-PLAN.md` is the source of truth for sequencing (supersedes `ROADMAP.md`/`PROPOSAL.md`).
- DB schema: every user table has RLS enabled with **owner-only** policies; a trigger on
  `auth.users` provisions a `profiles` row; the `@navapbc.com` restriction is enforced both
  client-side and by a `SECURITY DEFINER` DB trigger.

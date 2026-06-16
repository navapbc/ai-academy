# AGENTS.md

## Local Development Stack
Requires Docker Desktop. Start in order:
1. `npx supabase start`
2. `npx supabase functions serve --env-file supabase/functions/.env` (Required for AI chat/grading)
3. `npm run dev` (Vite server on :3000; e2e uses :5173)

**Env Setup:** `ANTHROPIC_API_KEY` must be set in `supabase/functions/.env`.

## Verification Commands
- **Lint & Typecheck:** `npm run lint` (runs tsc and eslint)
- **Unit/Integration Tests:** `npm test`
  - DB-gated tests: Set `RUN_DB_TESTS=1`.
  - Single test: `npx vitest run src/lib/file.test.ts`.

## High-Signal Architecture
- **Curriculum Truth:** Content is in Supabase `modules` table, NOT static files. Seeded via `supabase/migrations/*seed*.sql` and `supabase/seed-data/curriculum-content.json`.
- **Claude Proxy:** Browser $\rightarrow$ Supabase Edge Functions $\rightarrow$ Anthropic API. Key never hits browser.
  - **Chat Function (`chat`)**: Routes browser requests through Supabase Edge Functions to Anthropic API for streaming text responses (in `supabase/functions/chat/`)
  - **Grade Function (`grade`)**: Routes browser requests through Supabase Edge Functions to Anthropic API for structured grading verdicts (in `supabase/functions/grade/`)
- **Edge Function Tests:** Pure logic is in sibling files (`chat-core.ts`, `verdict.ts`) to enable Node/Vitest testing since Deno runtime isn't used for tests.
- **Gating Logic:** Stage 2 depends on completion of all Stage 1a. Logic in `src/lib/gating.ts`.
- **Grading System**: 
  - Auto-grader: Deterministic grading based on answer keys (in `src/lib/grading/autoGrade.ts`)
  - LLM Judge: AI-powered grading via Anthropic API calls through Supabase Edge Functions (in `src/lib/grading` and `supabase/functions/grade/`)

## Conventions & Constraints
- **Strict TS:** Zero `any` or `@ts-ignore` in production source.
- **Deno vs Node:** `supabase/` directory is Deno; excluded from root `tsconfig.json`.
- **Audit Traceability:** Use audit IDs (e.g., `D-08`, `FE-02`) and plan IDs (e.g., `P3.2`) in comments and commits.
- **Exercise Types:** Add new exercise types additively to the discriminated union in `types.ts` and switch cases in `ModuleRenderer.tsx`.
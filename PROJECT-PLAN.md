# Nava AI Academy — Master Project Plan

**Role of this doc:** the single source of truth for sequencing and execution. It **supersedes `ROADMAP.md` and `PROPOSAL.md`** wherever they differ (those predate the decisions below).
**Strategy:** build and test the **entire app locally** (local Supabase + Claude API), demo a slice for approval (**GATE A**), keep building locally, and **deploy to the cloud last**.
**Key decisions baked in:**
- **No local AI.** Ollama/LM Studio are removed. The model layer is **Claude via an API token** (called through an Edge Function so the token stays server-side).
- **Local-first data layer.** Supabase runs **locally** (CLI + Docker: Postgres + Auth + Edge Functions) for dev/testing; the same schema/functions deploy to Supabase cloud at the end.
- **Deploy is the final phase** (Vercel + `*.navapbc.com` subdomain).
**Scope:** Stages 1–2 universal of the Nava AI Literacy Skills Matrix + the platform features discussed (Google SSO + tracking, hands-on Claude labs/workshops, admin portal/CMS).

---

## How we work this plan

This Cowork session is the **product + project manager**. Per task: (1) PM presents the task → (2) you ask *"give me the prompt and agents for P-x"* → (3) PM returns a paste-ready prompt + agent(s) → (4) you run it in **Claude Design / Claude Code** → (5) you return here for PM approval against the Definition of Done → (6) approve → next.

**Agent legend** — **Design** = Claude Design (UI/UX, components, a11y); **Code** = Claude Code (implementation, backend, integrations, tests); **PM** = this session (prompts, content drafting from the matrix, approvals); **SME** = human Nava reviewer. "Design → Code" = design first, then build.
**Status values:** `Not started` · `Prompt ready` · `In build` · `PM review` · `Done`

---

## Open decisions

- **D1 — Model & key handling. ✓ Resolved → Claude via org API token through a proxy.** Token in a local `.env`/Supabase local secret during dev (never committed, never in the browser); Supabase secret in prod. Personal BYOK and local-model fallback are dropped. (Affects P1.2, P6.1.)
- **D2 — Which labs are LLM-graded (Claude) vs. Champion-reviewed?** (Affects P4.2 and each P4.x lab.)
- **D4 — Subdomain path.** `*.navapbc.com`: attach to **Vercel** via one DNS record (least process) vs. delegate to **AWS Route 53** (`grants.navapbc.com` pattern + Eden ticket). Leaning Vercel. Now in Phase 7. (Affects P7.1, P7.3.)
- **D5 — Backend platform. ✓ Resolved → Supabase**, run **locally first** (CLI/Docker), deployed to Supabase cloud in Phase 7. Free tier in cloud → Pro (~$25/mo) at rollout.
- **D6 — RAG study-buddy embeddings. ✓ Resolved → Option 1: long-context grounding, no embeddings.** The Claude API has no embeddings endpoint (Anthropic recommends Voyage); rather than add a vendor, the tutor drops the vector index entirely and grounds answers by feeding relevant curriculum text into Claude's context (prompt-cached). Retrieval stays swappable — can graduate to in-browser (Transformers.js) or hosted (Voyage/`pgvector`) embeddings later if cross-curriculum semantic recall becomes a bottleneck. (Drives X.1.)
- ~~D3 — cloud-only vs hybrid deploy mode~~ — **retired** (no local models; the app is always Claude-backed).

> **GATE A — ✓ PASSED (2026-06-02).** The laptop MVP was demoed (per DEMO-SCRIPT.md) and approved; full build-out (Phases 3+) is underway. Cloud deploy still doesn't happen until Phase 7.

> **Prereq for local dev:** Docker Desktop (for the local Supabase stack) + a Claude API token in a local env file. The token is set by you; it is never committed and never sent to the browser.

---

## Status board

**Next up: A-2026-06-09 — audit remediation, W2-6 (PairedCalibration cluster D-09/14/18).** ✓ **W2-1 done (#59)** — D-01/LB-2 closed. ✓ **W2-4 done (#60)** — error-path cluster D-03/04/05/13/15 closed. ✓ **W2-5 done (#61)** — DATA-01 invariant reconciled, 1.12 provenance restored (D-07/D-24), **DB-gated suites now run in CI** (`db-tests` job). **Note: SME backlog is now truthfully 14 cells** (1.12 joined — its harm-rubric config was never reviewed). **Flagged for human (auto-build loop skips these): W2-2** (D-06 role-escalation guard — access-control), **W2-3** (2.1 single-gate — needs a product call on which gate wins), **W3-1** (SME review pass, 13 cells), **W5-1** (subdomain request — people-latency, start it!). The 2026-06-09 full audit verified the repo end-to-end: **P4.5c (#55) AND P4.6 (#56) are MERGED** — P4.5+P4.6 complete, 10 lab kinds wired incl. paired-calibration — and **P4.7 is built, sitting in open PR #57** awaiting PM validation/merge. After the W2 bug clusters: merge #57, then P4.8–P4.10, P4.11 SME review, Phase 5 admin. **Corrected: SME `in_review` backlog is 13 cells (1.2/1.3/1.13/2.1/2.2/2.3/2.4/2.5/2.6/2.7/2.8/2.10/2.15), not 8** — and `modules.status` has no runtime effect, so unreviewed content already renders to learners. Still tracked: e2e test-isolation; delete stale branches (`feat/p3.7-failure-spotter`, `feat/p4.3b-clean-critique`) + #21 migration; optional `.nvmrc`. GATE A ✓ PASSED.
Phase 0 ▣▣▣▣ · Phase 1 ▣▣▣▣▣ · Phase 2 ▣▣▣▣ ✓ · **— GATE A ✓ PASSED —** · Phase 3 ▣▣▣▣▣▣▣▣▣▣▣ ✓ *(all merged incl. P3.5, P3.9, P3.11)* · Phase 4 ▣▣▣▣▣▣▣▣▣▣▣▣▢▢▢▢ *(P4.1–4.6 all merged; P4.7 in PR #57; P4.8–4.10 + P4.11 SME remaining)* · Phase 5 ▢▢▢▢▢▢ · Phase 6 ▢▢▢▢▢▢ · Phase 7 ▢▢▢▢▢ · Cross-cutting ▣▢▢▣ *(X.1 ✓, X.4 ✓)*
(▣ = Done, ▢ = Not started.)

> **Live Claude tests UNBLOCKED:** the org `ANTHROPIC_API_KEY` is now available. Store it ONLY in the gitignored `supabase/functions/.env` — never in `.env.example` or client code. The previously-deferred live smoke tests — **P1.2** (Claude proxy), **X.1** (tutor), **P2.3** (lab 2.1) — can now run; do them as each lands.

> **Full audit — 2026-06-02, `main` @ `6e63446` (through PR #22).** Reconciled against the live repo: `npm ci`/lint/build pass; vitest = 8 passed / 4 skipped (integration tests skip when unconfigured). Findings folded into the tables below: (1) the `progress.test.ts` cleanup is **DONE (#18)**; (2) **vitest is still not wired into CI** — workflow runs ci/lint/build only; (3) a redundant migration `20260602141611_stage_1b_content.sql` (PR #21) is **superseded by the #22 curriculum load** — #22 is canonical for the six Stage-1b cells; #21 is harmless dead weight (optional cleanup); (4) X.1 tutor still a placeholder. Phases 0–2 + GATE A, P3.1, P3.2 (all substeps), and the P3.3/P3.4/P4.11 lesson+quiz content are all confirmed merged and live.
>
> **Re-baselined 2026-06-03, `main` @ `17d982a` (through PR #46).** A lot has landed since the note above: **P3.5, P3.9, P3.11, X.1** merged; **X.4 hardening (#30)** shipped a vitest+Playwright suite, a CI test step, and a 67-finding `docs/DEBT-REPORT.md` — and **all 67 P0–P3 findings are now resolved or explicitly accepted** across 13 fix PRs (#31–#46), so lint/build/unit/component/integration/E2E are green on `main`. **P4.1 (#34)** and **P4.2 (#45)** are merged → the config-driven `Lab` + the `grade` LLM-judge Edge Function exist, so **P4.3 is unblocked**. Only stale branch: `feat/p3.7-failure-spotter` (delete). Redundant #21 migration still present (optional cleanup).

---

## ★ NEXT UP — A-2026-06-09: Full audit findings + remediation (work this before resuming P4.x)

> **Full audit — 2026-06-09, `main` @ `bbcc4c9` (through PR #56; PR #57 open).** Assessment-only pass, everything verified by *running* the app (not inferred from docs): `npm ci`/lint/build green (bundle 861.86 kB, known >500 kB warning); **vitest 206 passed / 6 skipped**; **Playwright E2E 15/15** (local Supabase, Claude stubbed); **all 25 migrations apply cleanly twice**; chat+grade Edge Functions **live-smoked with the real key** (stream ✓, per-anchor verdict ✓, 401 unauthenticated ✓); the 2.15 lab + tutor smoked in a real browser, zero console errors (tutor cold TTFB ~14s). Full reports: **repo `docs/audit/AUDIT-REPORT-2026-06-09.md` + `REMEDIATION-PLAN-2026-06-09.md` (PR #58)**.

**Compliance: 100% of done-claims verified real (31/31; artifact-strict 29/31 = 94%) — zero false-done.** All 13 discrepancies (5 P2, 8 P3) are the *plan lagging the repo*: P4.5c (#55), P4.6 (#56), P3.5 (#24), P3.9 (#29), P3.11 (#28), X.1 (#14) all merged despite stale rows above; P4.7 fully built in **open PR #57** (untracked); `DEMO-SCRIPT.md` cited by P2.4/GATE A never existed in any commit; `docs/local-ai-setup.md` still ships Ollama instructions vs the P1.1 DoD; "vitest-in-CI pending" note stale (in CI since #30). *The six stale table rows (P3.5, P3.9, P3.11, X.1, P4.5c, P4.6) and the P1.4 note have been reconciled in place as part of adding this section.*

**Defects: 0 P0 · 1 P1 · 11 P2 · ~20 P3** (ids = audit report; DEBT-REPORT overlaps de-duplicated):
- **D-01 (P1)** — progress cache + pending-writes outbox (`sprint_progress`, `sprint_pending_completions`) are not keyed by user and survive sign-out: on a shared browser user B inherits user A's completions (reconcile *unions* them in; Stage 2 can unlock unearned) and A's parked offline completion is **written into B's `module_progress` rows**. `progressCache.ts:8`, `pendingWrites.ts:7`, `useProgress.ts:82-121`, `auth.tsx:103-105`.
- **D-02 (P2)** — cell 2.1 has two independent completion gates: the inline quiz completes the module with no lab submission ever made (the only hands-on Stage-2 gate is skippable).
- **D-06 (P2)** — latent privilege escalation: owner UPDATE policy on `profiles` has no column restriction, so any learner can `UPDATE profiles SET role='admin'` on their own row. Inert today; **must close before P5.1**.
- **D-07 (P2)** — the `RUN_DB_TESTS`-gated RLS suite has **1 failing test** (DATA-01: cell 1.2 now `in_review`/v2 after the P4.3a seed, breaking the Stage-1b invariant) — invisible because CI never runs that suite.
- **D-08 (P2)** — `modules.status` has **zero runtime effect** (never selected, never filtered): all 13 `in_review` cells render to learners identically to published.
- Other P2s: D-03 VoiceEdit mid-stream draft failure = silent dead end (no error, no regenerate, no prefill); D-04 Lab saves stream-error text as the gradeable response; D-05 `streamChat` abort during fetch phase throws (Playground Stop shows "Error"); D-09 PairedCalibration regressed 4 resolved a11y patterns (alerts/live regions/contrast/announcements); D-10 no focus/scroll management on module change; D-11 861.86 kB single bundle, zero code-splitting; D-12 Playground re-parses all markdown every streamed chunk.
- P3 highlights: D-13 stale grade card on re-run; D-14 PairedCalibration stop/reset don't abort the stream (post-stop tokens enter the saved transcript); D-15 IterationLab loses the typed turn on failure; D-16 malformed `quiz_json`/`lab_config_json` white-screens the app; D-17 grading failure is a dead end in all 5 judge-graded labs; D-24 reconcile migration clobbered 1.12's provenance; D-25 two seed migrations not strictly re-runnable; D-26 2.15 has no E2E/component test; D-28 no jsx-a11y lint (why D-09 regressed); plus rate-limit/in-memory (D-21), seed demo credential (D-22), model-alias pinning (D-23), terminology drift (D-30), tutor cold-start (D-32).

**Matrix coverage:** 28/28 lessons (all cited, non-stub) · 27/28 quizzes (1.3 sorter-gated by design) · 20/28 interactive instruments. Quiz-only cells: 1.1 (by design), 1.6, **2.9, 2.11 (portfolio instruments missing = P4.9/P4.8)**, 2.12, **2.13 (in PR #57)**, **2.14 (GLAT gate missing = P4.10; schema can't even express Stage 3)**.

**Missing vs roadmap (confirmed absent):** champion-review UI while `status='reviewable'` graded rows already queue unreadably behind owner-only RLS; all of P5.1–P5.6, P6.1–P6.6 (incl. **no PII guard before model calls**), P7.1–P7.5; X.2 has substrate only (`content_versions`: 0 rows, no writer); X.3 absent.

### Launch blockers (LB)

| # | Blocker | Closed by |
|---|---|---|
| LB-1 | 13 cells `in_review`, no SME sign-off — and unreviewed content already ships (D-08) | W3-1 + W3-2 |
| LB-2 | D-01 cross-user progress leak/write | W2-1 |
| LB-3 | D-06 role self-escalation (before any P5.1 work) | W2-2 |
| LB-4 | P7.1 subdomain never requested (people-latency item) | W5-1 — start now |
| LB-5 | D-02 2.1 dual gate (Stage-2 evidence validity) | W2-3 |

### Remediation workstreams (full detail: `docs/audit/REMEDIATION-PLAN-2026-06-09.md`)

| ID | Task | Definition of done | Pri | Effort | Status |
|---|---|---|---|---|---|
| W1 | Compliance & hygiene | **W1-1 plan re-baselined ✓ (this section + reconciled rows, 2026-06-09)**; remaining: stale branches deleted; `.nvmrc`; `local-ai-setup.md` removed; #21 migration decision; seed-guard fixes (D-25); DEMO-SCRIPT reference corrected | P1–P3 | S each | **W1-1 done**; rest not started |
| W2 | Bug fixes | **W2-1 DONE (#59)** ✓ user-keyed cache+outbox, legacy keys dropped, sign-out hygiene, 2-user regression test (D-01 closed); **W2-2** role-escalation guard migration + RLS test (D-06) — *needs human: access-control*; **W2-3** 2.1 single-gate (D-02) — *needs human: which gate wins*; **W2-4 DONE (#60)** ✓ error-path cluster D-03/04/05/13/15 (Lab runError + no-save-on-failure, VoiceEdit regenerate-on-failure, streamChat fetch-phase abort, stale-grade clear, IterationLab input restore; +8 regression tests); **W2-5 DONE (#61)** ✓ DATA-01 invariant reconciled (deterministic provenance split), 1.12 restored to in_review/v2, ci.yml `db-tests` job runs the gated suites (D-07/24); **W2-6** PairedCalibration cluster (D-09/14/18) ← **next**; **W2-7** config shape-guards (D-16); **W2-8** retry-grading (D-17); **W2-9** a11y parity (D-10/19/20) | P1–P3 | S–M each | W2-1, W2-4, W2-5 done; W2-6 next |
| W3 | Content & SME workflow | **W3-1** SME review pass over all 13 `in_review` cells scheduled + executed (longest pole — start now); **W3-2** make `status` real (select + filter or badge); **W3-3** sign-offs recorded via migration, `content_versions` writer (X.2) | **P1** | L (people) | Not started |
| W4 | Missing features | **W4-1 merge PR #57** (P4.7, ready); W4-2 failure log 2.9 (P4.9, M); W4-3 portfolio/Diligence 2.11 (P4.8, L); W4-4 GLAT gate 2.14 (P4.10, L, needs W3-1); W4-5 champion review queue (needs W2-2, L); W4-6 Phase 5 portal (P5.1→5.6) | P1–P2 | S→L | Not started |
| W5 | Hardening & deploy | **W5-1 kick off subdomain request today** (P7.1); W5-2 durable cost caps (P6.2); W5-3 pre-call PII guardrail (P6.3/6.6); W5-4 jsx-a11y lint + axe smoke now, formal pass later (P6.4); W5-5 key mgmt/model pinning (P6.1, D-23); W5-6 deploy (P7.2–7.4; exclude seed demo user, D-22) | P1–P3 | S→L | Not started |
| W6 | Quality improvements | W6-1 code-splitting (D-11); W6-2 markdown memoization (D-12/31); W6-3 2.15 E2E + component tests, e2e-isolation, E2E-in-CI (D-26/27, C-13); W6-4 tutor cold-start (D-32); W6-5 terminology/UX pass (D-30); W6-6 dead dispatch removal (D-29) | P2–P3 | S–M each | Not started |

**Sequencing:** Week 1 — W5-1 (DNS, people-latency first) + W3-1 (schedule SMEs) + W2-1/W2-2 (P1 bugs) + W1-1 + W4-1 (merge #57). Week 2 — W2-3/4/5/6 + W3-2. Weeks 3–4 — W4-2/3/4 + W6. Weeks 5+ — W4-5/6 → W5 → deploy. **Hard dependency: W2-2 strictly precedes any P5.1 work; W3-2 before any pilot user touches the app.**

---

## Phase 0 — Local foundation

| ID | Task | Definition of done | Depends | Agent | Status |
|---|---|---|---|---|---|
| P0.1 | Fork & rename & license | Nava-owned fork; package renamed `nava-ai-academy`; PolyForm OK for internal use | — | Code | **Done** — `github.com/navapbc/ai-academy` (pkg name + LICENSE resolved in P0.3; license choice pending Nava legal) |
| P0.2 | Run locally + sanity | `npm install` + dev server runs on localhost; app loads | P0.1 | Code | **Done** |
| P0.3 | Repo cleanup | Remove unused `express`/`@types/express` (+ `dotenv` if unused), drop one lockfile, delete stale `.env.example`, light docs de-local-first pass; **also resolves P0.1 carryovers** (set pkg name `nava-ai-academy`, populate `LICENSE`). No code changes (local-AI code removal is P1.1) | P0.1 | Code | **Done** ✓ verified in public repo |
| P0.4 | Lightweight CI | Typecheck + build run on push (no deploy) | P0.1 | Code | **Done** ✓ verified (ci.yml: Node 22, npm ci → lint → build) |

## Phase 1 — Claude-only model + local data layer  ★ early foundation

*This is the "rip out local AI + stand up a local DB" work you asked to bring forward.*

> **Build order:** do **P1.3 (local Supabase)** before **P1.2 (Claude proxy)** — the Claude proxy is a Supabase Edge Function that runs on the local stack, so the stack must exist first.

| ID | Task | Definition of done | Depends | Agent | Status |
|---|---|---|---|---|---|
| P1.1 | **Rip out local AI** | Remove Ollama/LM Studio discovery, local streaming, the `local-setup` module + `OllamaGuide`, and the Ollama embedding backend; remove hybrid/local toggles. No references to local model servers remain. *Removing the embedding backend disables the tutor — temporarily disable the FAB here, then X.1 re-grounds it on Claude right after P1.2* | P0.2 | Code | **Done** ✓ verified (files gone, sweep clean, lint+build pass; PR #4) |
| P1.2 | **Claude via API token** | A Claude provider behind a thin seam; calls go through a (locally-served) Edge Function that reads the token from env/secret — token never in the browser. Streaming works in the UI; rewire Playground/PromptLab off their P1.1 placeholders | P0.2, P1.3 | Code | **Merged to main (#7)** ✓ files verified, key-leak clean, lint+build pass — live Claude smoke test PASSED via the P2.3 lab (real end-to-end stream) |
| P1.3 | **Local Supabase stack** | `supabase start` runs Postgres + Auth + Edge Functions + Studio locally; migrations + seed script committed to the repo | P0.2 | Code | **Done** ✓ verified (4 tables + owner RLS + secure new-user trigger; PR #5) |
| P1.4 | **Data layer on Supabase** | Progress + quiz scores read/write to local Supabase; localStorage demoted to optional cache | P1.3 | Code | **Done (#8)** ✓ wired (App/Quiz/main), build+lint+unit-tests green. Follow-ups: `progress.test.ts` fix **DONE (#18)**; vitest-in-CI **DONE (#30)** (ci.yml runs `npm run test`). Audit 2026-06-09 caveat: the `RUN_DB_TESTS`-gated suite never runs in CI and has 1 failing test (D-07) |
| P1.5 | **Google SSO (local)** | Add Google OAuth + `navapbc.com` domain restriction (hd hint + server-side check) onto the AuthProvider/Login **already built in P1.4** (which added minimal email/password); keep email/password for local dev only; profile + role on first sign-in | P1.4 | Code | **Done (#9)** ✓ two-layer enforcement verified (DB trigger + client guard), merged to main; live Google round-trip = human prereq (Google OAuth client) |

## Phase 2 — Local MVP slice (demo on the real local stack)  ★ the slice to sell

| ID | Task | Definition of done | Depends | Agent | Status |
|---|---|---|---|---|---|
| P2.1 | Matrix-aligned curriculum shell | Replace Crawl/Walk/Run with **Stage 1a / 1b / Stage 2** nav; all 28 cells listed (stubs OK) so structure + ambition are visible. Also clears the 3 residual local-AI content strings left from P1.1 (`phases.ts` resource link, `quiz.ts` option, `glossary.ts` def) | P0.2 | Design → Code | **Done (PR #10)** ✓ 28 cells in 3 stages verified, local-AI strings gone, build green |
| P2.2 | Module 1.4 (Data Classification) | Real lesson + quiz, end to end; score saved to Supabase | P2.1, P1.4 | PM + SME → Code | **Done (#11)** ✓ lesson + 4-q quiz; quiz_attempts row written (4/4); ModuleRenderer gates completion on the quiz; SME copy review pending |
| P2.3 | Lab 2.1 (Prompt Construction) | Live hands-on lab calling **Claude** via the local proxy; transcript saved to Supabase | P1.2, P2.1 | Design → Code | **Done (#12)** ✓ live Claude stream + lab_submissions row verified; key absent from dist bundle; no auto-grading; SME copy review pending |
| P2.4 | Demo polish + script | Progress/score view + UI polish + 1-page demo script to present the slice | P2.2, P2.3 | Design + PM | **Done (#13)** ✓ header email+signout, sidebar progress counts, quiz-score badge; demo script = DEMO-SCRIPT.md |

> **▶ GATE A — ✓ PASSED: demoed + approved (2026-06-02). Full build-out underway.**

## Phase 3 — Stage 1 complete (13 cells) + content-as-data

| ID | Task | Definition of done | Depends | Agent | Status |
|---|---|---|---|---|---|
| P3.1 | Module schema + matrix metadata | Module carries `cellId`/`stage`/`dimension`/`evidenceType`/anchors/`selfReportValidity` | GATE A | Code | **Done (#15)** ✓ all 28 cells verified vs matrix; tsc-enforced |
| P3.2 | Content-as-data | Content served from Supabase; edit row → lesson changes, no rebuild | P3.1 | Code | **✓ COMPLETE** — 3.2.1 (#16) · 3.2.2 (#17) · 3.2.3a (#19) · 3.2.3b (#20). Lessons + quizzes + lab config all DB-driven, edit-no-rebuild verified || P3.3 | Stage 1a content + quizzes | Cells 1.3, 1.4*, 1.5, 1.6, 1.9, 1.10, 1.13 lessons + quizzes; SME-reviewed. **Content now DB-backed → author as files, then a migration upserts module rows (body_md/quiz_json), until the CMS (P6) exists** | P3.2 | PM + SME → Code | **Loaded ✓ (#22)** — cited, QA-passed, in DB; pending SME review |
| P3.4 | Stage 1b content + quizzes | Cells 1.1, 1.2, 1.7, 1.8, 1.11, 1.12 lessons + quizzes; SME-reviewed | P3.2 | PM + SME | **Loaded ✓ (#22)** — in DB; pending SME review |
| P3.5 | Interactive: scenario-sorter (1.3) | 8-scenario delegate/assist/human-only/refuse sorter + key + rationale | P3.2 | Design → Code | **Done & merged (#24)** ✓ audit-verified 2026-06-09: `ScenarioSorter.tsx` + grade helper + seed `20260602190001`; sorter is 1.3's completion gate (quiz intentionally cleared); E2E exercises it via `completeSorter` |
| P3.6 | Interactive: classifier + tool-triage (1.4, 1.5) | Data-class → approved-tool classifier; tool-triage over Nava tool inventory | P3.2 | Design → Code | **Done (#23)** ✓ DataClassifier+ToolTriage, additive dispatch (P3.5-safe), grades + records submission; 1.3 untouched. Notional tool labels (SME to replace); no read-back of past attempts (optional follow-up) |
| P3.7 | Interactive: bias/a11y spotter (1.7) | Failure-spotter over seeded outputs + a generated UI snippet | P3.2 | Design → Code | **Done (#25)** ✓ FailureSpotter (4 items, markdown artifacts), additive `failure-spotter` case, grades + records; quiz still the gate. (No live click-through — structural mirror of P3.6; E2E deferred.) |
| P3.8 | Interactive: disclosure + regulatory (1.9, 1.10) | Disclosure-language builder + regulatory open-book response | P3.2 | Design → Code | **Done (#26)** ✓ shared ScenarioExercise (additive), 1.9 cheat-sheet (5) + 1.10 model-response (5); 1.10 items verified accurate vs the regulatory checklist (dates, voluntary/binding, EO 14319 with 14179 as the corrected distractor); db reset clean |
| P3.9 | Interactive: harm scenario + sign-off (1.12, 1.13) | Civic-tech harm rubric + role self-classification & sign-off checklist | P3.2 | Design → Code | **Done & merged (#29)** ✓ audit-verified 2026-06-09: `HarmRubric.tsx` + `SignoffChecklist.tsx` + seed `20260602240000`. Note: reconcile migration clobbered 1.12's provenance marker (audit D-24); 1.13 still in_review |
| P3.10 | Reflection capture (1.8, 1.11) | Reflections stored; Champion-visible; ungraded | P3.2 | Code | **Done (#27, merged)** ✓ ReflectionCapture (250/300 word targets), `kind:'reflection'` tag, ungraded, no onComplete |
| P3.11 | Stage gating | Stage 1a completion gates Stage 2; 1b runs alongside | P3.3 | Code | **Done & merged (#28)** ✓ audit-verified 2026-06-09: `src/lib/gating.ts` + `LockedNotice.tsx`; E2E 02-stage-gating passes (lock @0/7 → unlock @7/7). Caveat: gating is bypassable cross-user via the un-keyed progress cache (audit D-01/LB-2) |

## Phase 4 — Stage 2 complete (15 cells) + lab framework

| ID | Task | Definition of done | Depends | Agent | Status |
|---|---|---|---|---|---|
| P4.1 | Generalize Lab component | The MVP's 2.1 lab refactored into a config-driven `Lab` + `LabConfig` (all labs call Claude) | P2.3, P3.2 | Design + Code | **Done (#34)** ✓ PromptLab→config-driven `Lab` (labId + header from config); 2.1 renders identically from DB |
| P4.2 | Grading engine | Auto (keys) + LLM-as-judge via Claude (anchor-scored, labeled reviewable) + champion-review | P4.1, P1.2 | Code | **Done (#45)** ✓ `grade` Edge Fn (Claude judge → strict-JSON verdict, 0/1/2 per anchor); `requestLlmGrade`+`saveGrade`; 2.1 rubric seeded; champion-review UI deferred to P5.1 |
| P4.3a | Lab: error-seeding (cell 1.2) | "Spot the confabulation" — audit a polished civic-tech artifact with planted fabrications; auto-graded. New `output-audit` config kind + component. No LLM. | P4.1 | Design → Code | **Done (#49)** ✓ PM-validated: additive-only (no shared code), no onComplete (ts-expect-error-guarded), seed `in_review`+idempotent, migration `20260603010000` (no collision w/ #48), HCV/§982.555 claims verified vs eCFR/HUD; lint+build+test green. **Merged ✓** (main HEAD region); content pending SME. |
| P4.3b | Labs: clean-critique (cells 2.2, 2.3) | Free-text validation/critique of a polished AI artifact, **LLM-judged via the P4.2 `grade` fn**. New `critique` config kind + component + rubrics; generalize the judge's submission labels (back-compat for 2.1). | P4.1, P4.2 | Design → Code | **Done (#48)** ✓ PM-validated: byte-equiv judge (test-locked), no onComplete, `GradeResultCard` extracted, seed `in_review`+idempotent (real 7 CFR 273.10 / 42 CFR 435.916), lint+build+154 tests green. **Done & merged (#48)** ✓ conflicts resolved keeping all 4 kinds/cases (verified on main); judge byte-equiv intact. Content pending SME. |
| P4.3c | Lab: confidence-calibration (cell 2.8) | Rate the verification posture for several AI outputs (same tool, varying reliability/stakes); auto-graded with an **over-/under-reliance** calibration summary. New `calibration` config kind + component. No LLM. | P4.1 | Design → Code | **Done & merged (#50)** ✓ PM-validated on merged main (lint/build + 162 tests green): 6 items / 5 postures, gap-based over/under summary, additive-only, no onComplete (ts-expect-error-guarded), seed `in_review`. Content pending SME. |
| P4.4a | Lab: synthesis (cell 2.7 "AI for synthesis") | Minority-voice synthesis — synthesize source excerpts that contain a dissenting voice without flattening it; free-text, **LLM-judged (reuses #48 judge + `GradeResultCard`)**. New `synthesis` kind + component. | P4.1, P4.2, #48 | Design → Code | **Done & merged (#51)** ✓ PM-validated on main: shared `SourcedFreeTextLab` backs critique+synthesis (Critique byte-stable), 10-interview synthetic set w/ 2 minority voices (P7/P9) + paraphrase trap, in_review; lint+build+175 tests green. Content pending SME. |
| P4.4b | Lab: voice-edit (cell 2.6 "AI for writing tasks") | AI first draft → "AI-off" voice/accuracy edit → LLM-judged on the *revision* (reuses `streamChat` + #48 judge + `GradeResultCard`). New `voice-edit` kind + component. | P4.1, P4.2, #48 | Design → Code | **Done & merged (#52)** ✓ PM-validated on main: focused `VoiceEdit` (live `streamChat` draft → AI-off revision → 3-section judge), no onComplete, CCS-redetermination seed w/ 5 must-preserve specifics (copay illustrative), in_review; lint+build+182 tests green. Content pending SME. |
| P4.5a | Lab: context-window diagnostic (cell 2.5) | Symptom→remedy diagnostic scenarios (drift, contradiction, what to paste, fresh-thread). Auto-graded — **reuses `ScenarioExercise`** (add `context-diagnostic` kind + dispatch + seed). No LLM. | P4.1 | Design → Code | **Done & merged (#53)** ✓ PM-validated on main: reuses `ScenarioExercise` (kind+KIND_COPY+dispatch; 1.9/1.10 byte-stable), 5 scenarios (correct idx varied), in_review; lint+build+184 tests green. Content pending SME. |
| P4.5b | Lab: reusable-prompt eval (cell 2.10) | Learner writes a constraint-first prompt, runs it on seeded test cases incl. an edge case (`streamChat`), **LLM-judged** on constraint-first design + edge-case robustness. New `prompt-eval` kind + component. | P4.1, P4.2 | Design → Code | **Done & merged (#54)** ✓ PM-validated on main: `PromptEval` (one streamChat/case → multi-section judge), no onComplete, seed 3 cases incl. CCAP-3902 income-blank edge, in_review; lint+build+191 tests green. Content pending SME. |
| P4.5c | Lab: iteration-log scorer (cell 2.4) | **Multi-turn** refinement loop with Claude toward a goal; **LLM-judged** on iteration quality (specific, targeted steering; catches a wrong assumption). New `iteration` kind + multi-turn component. | P4.1, P4.2 | Design → Code | **Done & merged (#55)** ✓ audit-verified 2026-06-09 on main: `IterationLab.tsx` + `kind:'iteration'` dispatch + seed `20260603070000`; E2E 12-iteration passes |
| P4.6 | Lab: paired AI-on/AI-off (2.15) | Paired timed tasks (with/without Claude); capture subjective vs actual time + defects → calibration number | P4.1 | Design → Code | **Done & merged (#56)** ✓ audit-verified 2026-06-09: `PairedCalibration.tsx` + compute helper(+test) + dispatch + seed `20260603080000` (in_review/DRAFT); live-browser smoke passed (real Claude stream, calibration math correct, zero console errors). Gaps tracked in audit: no E2E/component test (D-26), a11y parity (D-09), stream-abort on stop/reset (D-14) |
| P4.7 | Productivity-illusion critique (2.13) | Dashboard-critique exercise naming missing rework/quality signals | P4.1 | Design → Code | **In review — open PR #57** (built: DashboardCritique + scoring + dispatch + DRAFT seed). Audit W4-1: validate + merge |
| P4.8 | Portfolio: use-case lib + Diligence Statement (2.11) | Extend `UseCaseLib` into portfolio builder + 4D Diligence Statement (exit artifact) | P4.1 | Design → Code | Not started |
| P4.9 | Portfolio: failure-mode log (2.9) | Dated failure-log portfolio, ≥6 entries over time | P3.2 | Code | Not started |
| P4.10 | GLAT-style objective gate (2.14) | Objective bank from Stage 1–2 items; ≥80% computes the Stage 2→3 gate | P3.3, P3.4, P4.11 | Code | Not started |
| P4.11 | Stage 2 content + quizzes + lab-configs | Cells 2.1*–2.15 lessons + quizzes + lab configs; SME-reviewed | P3.2, P4.1 | PM + SME | **Lessons+quizzes loaded ✓ (#22)** — in DB; pending SME review; interactive lab configs separate (P4.x) |

## Phase 5 — Admin portal (live dashboard + CMS)

| ID | Task | Definition of done | Depends | Agent | Status |
|---|---|---|---|---|---|
| P5.1 | Roles & RLS | RLS: learner = own, champion = cohort, admin = all; verified | P1.5 | Code | Not started |
| P5.2 | Live dashboard (all users) | Realtime completion %, score distributions, review queue, GLAT pass rates, cohort filters, per-user drill-down | P5.1, P1.4 | Design → Code | Not started |
| P5.3 | Learner dashboard | Own progress, scores, lab status, calibration number, portfolio | P5.1, P1.4 | Design → Code | Not started |
| P5.4 | CMS | Markdown editor + live preview, quiz/lab/metadata editors, draft→review→publish + versioned rollback; change reaches learners w/o redeploy | P3.2, P5.1 | Design → Code | Not started |
| P5.5 | Cohorts + review queue | Cohort/enrollment mgmt, Champion assignment, open-ended/portfolio review queue | P5.1 | Design → Code | Not started |
| P5.6 | Evidence exports | CSV/PDF cohort reports mapped to DOL / EU AI Act Art. 4 / M-25-21 cross-walk | P5.2 | Code | Not started |

## Phase 6 — Hardening (before deploy)

| ID | Task | Definition of done | Depends | Agent | Status |
|---|---|---|---|---|---|
| P6.1 | Key mgmt + (optional) more providers | Org Claude token rotation/secret handling; optional OpenAI/Google behind the same seam | P1.2 | Code | Not started |
| P6.2 | Cost caps + monitoring | Per-user/cohort caps; cheap default (Haiku); admin usage/spend view | P1.2 | Code | Not started |
| P6.3 | Data-classification guardrail | Confirmation/guard before model calls; "don't paste real PII" enforced (all calls now go to Claude) | P2.3 | Design → Code | Not started |
| P6.4 | Accessibility pass | Automated a11y checks pass; keyboard/screen-reader spot-checks pass (508/WCAG) | P3.x, P4.x, P5.x | Design → Code | Not started |
| P6.5 | SME content review + workflow | All modules SME-reviewed + versioned; review workflow operational | P3.3, P3.4, P4.11 | PM + SME | Not started |
| P6.6 | Privacy guardrails | Submissions/reflections free of real client PII — enforced + taught | P1.4 | Code + PM | Not started |

## Phase 7 — Deploy (cloud Supabase + Vercel + subdomain) + pilot  ← final phase

| ID | Task | Definition of done | Depends | Agent | Status |
|---|---|---|---|---|---|
| P7.1 | Provision `*.navapbc.com` subdomain | Subdomain reserved + routed (Vercel DNS record via Marques, or Route 53 + Eden ticket). **Start the request early** — it has people-latency | D4 path | PM + Nava IT (Marques/Caitlin) | Not started |
| P7.2 | Provision cloud Supabase | Cloud project live; migrations + Edge Functions pushed; secrets (Claude token) moved server-side | Phases 3–6 | Code | Not started |
| P7.3 | Deploy to Vercel | SPA + functions deployed; all config via env vars; custom domain attached | P7.1, P7.2, P0.4 | Code | Not started |
| P7.4 | Production validation + IaC | Zero-install sign-in works at the subdomain; `vercel.json`/Dockerfile + 1-page runbook | P7.3 | Code + PM | Not started |
| P7.5 | Feedback + pilot | "Report an issue" link; pilot cohort completes Stage 1a gate; rubrics/quiz difficulty tuned | P7.4, P5.2 | PM | Not started |

## Cross-cutting

| ID | Task | Definition of done | Depends | Agent | Status |
|---|---|---|---|---|---|
| X.1 | RAG tutor → Claude long-context grounding | Rework `LocalTutorFAB` to drop the vector index/embeddings and ground answers by sending relevant curriculum text into Claude's context (prompt-cached). Per **D6 = Option 1**; sequence right after P1.2 | P1.2 | Code | **Done & merged (#14)** ✓ audit-verified 2026-06-09 incl. live smoke: grounds from DB curriculum, prompt-cached, zero embedding/vector code; answered correctly in-browser. Cold TTFB ~14s (audit D-32, W6-4) |
| X.2 | Content versioning discipline | `modules.version` + content changelog as the matrix evolves (v2 →) | P3.2 | PM | Not started |
| X.3 | Workshop mode | Multi-step guided/facilitated lab flow (optionally cohort-paced) | P4.1 | Design → Code | Not started |
| X.4 | **Hardening pass: full test suite + debt audit** | vitest unit/component + Playwright E2E + CI test step + 6-lens read-only audit → `docs/DEBT-REPORT.md` (67 findings, severity-ranked). | main | Code (+ subagents) | **Done (#30)** ✓ audit shipped no-fix; **all 67 findings since resolved/accepted across 13 fix PRs (#31–#46)** — lint/build/test green on `main` |

---

## Coverage check (so nothing is dropped)

- **Rip out local AI → Claude via API token (brought forward)** → P1.1, P1.2.
- **Local data layer for testing before deploy** → P1.3, P1.4 (local Supabase; deployed in P7.2).
- **Presentable local MVP** → Phase 2 (P2.1–P2.4) + GATE A.
- **Google SSO + tracking** → P1.5, P1.4, P5.1, P5.2, P5.3.
- **Full Stage 1–2 coverage (28 cells) + quizzes** → P3.3, P3.4 (Stage 1: 13), P4.11 (Stage 2: 15), GLAT bank P4.10.
- **Hands-on Claude labs / workshops** → P2.3, P4.1–P4.8, X.3.
- **Admin portal: CMS + live dashboard** → P3.1, P3.2 (prereq), P5.2, P5.4, P5.5, P5.6.
- **Deploy (pushed to the end)** → Phase 7.

**Totals:** 4 + 5 + 4 + 11 + 11 + 6 + 6 + 5 + 3 = **55 tasks** across 9 tracks. All 28 universal cells get lesson + quiz content (P3.3/P3.4/P4.11); cell **2.12** (tool/model/mode switching) is taught via content + the Claude model/mode picker + triage items in P4.11.

---

## Cost model (rough, May 2026 pricing)

**Supabase** — free while local; in cloud (Phase 7) the Free tier covers 750 learners on every dimension (50K MAU, 500 MB DB, 500K edge-fn/mo). Upgrade reasons are operational (7-day inactivity pause, no daily backups) → **Pro $25/mo (~$300/yr)** at rollout.

**Claude API is the cost driver — and now there is no free local fallback, so every model call (including local dev/testing) is billed.** Dev/testing volume is tiny (just the team). For 750 learners at ~200 calls each (~2,000 in / 800 out tokens):

| Default model | Rate (in / out per M) | All-750 total | Per learner |
|---|---|---|---|
| Haiku 4.5 | $1 / $5 | **~$900** | ~$1.20 |
| Sonnet 4.6 | $3 / $15 | **~$2,700** | ~$3.60 |

Levers (in the plan): Haiku default, prompt caching (−90% cached input), Batch API (−50% grading), per-user spend caps (P6.2). Keep a **small dev token budget** since there's no local fallback. **All-in for 750: ~$1k–$3k over the program.** Order-of-magnitude; sensitive to calls/learner and model mix.

---

## Recommended execution order

Phase 0 (local prep) → Phase 1 (**rip out local AI + Claude API + local Supabase**) → Phase 2 (**localhost MVP**) → **GATE A demo + approval** → Phase 3 (Stage 1 + content-as-data) → Phase 4 (Stage 2 + lab framework) → Phase 5 (admin) → Phase 6 (hardening) → **Phase 7 (deploy + pilot)**. Start the **P7.1 subdomain request early** (people-latency) even though deploy is last. Cross-cutting slots in as dependencies land.

When you're ready, say **"give me the prompt and agents for P0.2"** — or jump to **P1.1** (rip out local AI) since that's the change you most want to see land.

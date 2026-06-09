# Full Repository Audit — Roadmap Compliance, Defects & Gaps

**Date:** 2026-06-09 · **Repo:** `navapbc/ai-academy`, `main` @ `bbcc4c9` · **Baseline roadmap:** `PROJECT-PLAN.md` (master plan, supersedes ROADMAP/PROPOSAL)
**Method:** assessment-only (no code changed). Everything below was *verified by running the app* — `npm ci`/lint/build/test, two `supabase db reset` cycles, the full Playwright E2E suite, live Edge-Function smokes with the real Anthropic key, and real-browser smokes of the newest lab (2.15) and the tutor — plus six parallel read-only audit lenses (roadmap compliance, matrix coverage, bugs, missing functionality, data/security, frontend/a11y/perf).
**Companion document:** [REMEDIATION-PLAN-2026-06-09.md](REMEDIATION-PLAN-2026-06-09.md)

---

## 1. Executive summary

**The codebase is in excellent shape and materially *ahead* of its own plan.** Every one of the 31 roadmap tasks claimed "Done" is real, merged, and working — **zero false-done claims (100% claim compliance; 94% artifact-strict** — two doc-level caveats). All drift runs the other way: the plan's status board is frozen at "P4.6 next" while P4.5c and P4.6 are merged and P4.7 sits complete in open PR #57, untracked.

**Verification is green across the board:** lint + build pass; vitest **206 passed / 6 skipped**; Playwright E2E **15/15 passed**; all 25 migrations apply cleanly twice in a row; both Edge Functions (chat, grade) verified live end-to-end with real Claude; the 2.15 paired-calibration lab and the curriculum-grounded tutor work in a real browser with zero console errors. Security fundamentals hold: owner-only RLS on every user table, the @navapbc.com restriction enforced at all three layers (client, DB trigger, both Edge Functions), and the Anthropic key strictly server-side (clean in `src/`, `dist/`, and git history).

**Defect picture: 0 × P0 · 1 × P1 · 11 × P2 · ~20 × P3.** The single P1 (BUG-01): the localStorage progress cache and pending-writes outbox are not keyed by user and survive sign-out, so on a shared browser one user's completions leak into — and a parked offline completion is *written into* — the next user's account. The P2s cluster in the newest, post-DEBT-REPORT code (the 2.1 dual completion gate, error-path dead-ends in VoiceEdit/Lab, a11y regressions in PairedCalibration) plus one latent privilege escalation (any learner can `UPDATE profiles SET role='admin'` on their own row — harmless today, a real escalation the moment P5.1 role-gated policies land).

**The real launch blockers are not bugs:**
1. **13 of 28 cells are `in_review`** awaiting SME sign-off (the plan undercounts this backlog at 8) — and `modules.status` has **zero runtime effect** (never selected, never filtered), so unreviewed/draft content already renders to learners identically to published content.
2. **Missing roadmap features:** 2.9 and 2.11 (both *portfolio* evidence types) have no instrument; 2.14's "GLAT-style objective gate" is a 4-question quiz with no gate computation (and the schema cannot express Stage 3); the champion-review UI is absent while LLM-graded submissions queue up as `status='reviewable'` rows that owner-only RLS makes unreadable to any champion; all of Phases 5 (admin/CMS), 6 (hardening), and 7 (deploy) are not started — including P7.1 subdomain provisioning, which the plan itself says to start early due to people-latency.

**Headline numbers:** compliance 100% (claims) / 94% (artifact-strict) · 13 plan-vs-repo discrepancies (5 P2, 8 P3 — all stale-plan, none false-done) · defects 0 P0 / 1 P1 / 11 P2 · 13 cells blocked on SME review · 4 Phase-4 features remaining (1 already in PR) + 17 Phase 5–7 tasks + 2 cross-cutting.

---

## 2. Build / test / run evidence

All commands run 2026-06-09 on `main` @ `bbcc4c9` (audit branch is content-identical), Node v24.14.0, npm 11.9.0, supabase CLI 2.102.0, Docker running.

### 2.1 Install, lint, build

```
$ npm ci                 # clean, no errors (audit advisories only)
$ npm run lint           # tsc --noEmit && eslint .  → PASS (no output)
$ npm run build          # vite build → PASS
dist/assets/index-4QKCiRYn.css   73.91 kB │ gzip:  11.67 kB
dist/assets/index-BZHXnbe_.js   861.86 kB │ gzip: 238.22 kB
(!) Some chunks are larger than 500 kB after minification.
```

### 2.2 Unit / component tests

```
$ npm run test           # vitest run
 Test Files  33 passed | 1 skipped (34)
      Tests  206 passed | 6 skipped (212)
```
The 6 skips are the env-gated live-stack suite (`src/lib/rls.integration.test.ts`, skips without `RUN_DB_TESTS=1`). Run against the live local stack it is **5 passed / 1 FAILED**:

```
$ RUN_DB_TESTS=1 npx vitest run src/lib/rls.integration.test.ts
 × Curriculum provenance (DATA-01) > the six Stage-1b cells are reconciled to published / version 1
   → expected 'in_review' to be 'published'    (rls.integration.test.ts:142)
 Tests  1 failed | 5 passed (6)
```
Cause: the P4.3a seed (`20260603010000_seed_lab_config_1_2.sql`) sets cell 1.2 to `in_review`/v2, breaking the Stage-1b invariant the test encodes. CI never runs this suite, so the failure is invisible (defect D-07). The 5 passing tests confirm the domain trigger and cross-user RLS denial live.

### 2.3 Migrations (clean + idempotent)

```
$ npx supabase db reset   # run TWICE back-to-back
Applying migration 20260528221204_init_core.sql ... 20260603080000_seed_paired_calibration_2_15.sql
Seeding data from supabase/seed.sql...
Finished supabase db reset.   # both runs: all 25 migrations, zero errors
```
The known-redundant `20260602141611_stage_1b_content.sql` (PR #21) is still in the chain; it is deterministic dead weight — the #22 curriculum load (`20260602190000`) overwrites it every replay (verified: body_md md5 matches seed JSON for all 28 cells).

### 2.4 Playwright E2E (local Supabase, Claude stubbed at network layer)

```
$ npm run test:e2e        # fresh DB, dev server auto-started
 15 passed (1.7m)
```
Coverage: @navapbc.com sign-in gate (accept + reject), stage gating (locked → 7/7 unlock), 2.1 prompt lab, quiz persistence across reload, 1.4 data-classifier, 1.8 reflection, 2.2 critique, 1.2 output-audit, 2.8 calibration, 2.7 synthesis, 2.6 voice-edit, 2.5 context-diagnostic, 2.10 prompt-eval, 2.4 iteration. **No E2E exists for 2.15 paired-calibration** (newest lab) or the tutor — both smoked manually below. E2E is intentionally not in CI (commented job, `ci.yml`).

### 2.5 Edge Functions — live smokes (real `ANTHROPIC_API_KEY` from `supabase/functions/.env`)

```
chat,  authed @navapbc.com user  →  streams real Claude completion ("OK")
chat,  no auth                   →  401 {"error":"Sign in to use this feature."}
grade, seeded 2.1 rubric + valid submission → per-anchor JSON verdict
       (4 anchors × score/max/rationale, 8/8 on the test submission)
grade, malformed submission      →  400 {"error":"Invalid or missing submission."}
```

### 2.6 Real-browser smokes (live functions, no stubs)

- **2.15 paired-calibration (no E2E coverage):** full flow — timed AI-off task → timed AI-on task with a **live Claude stream** → estimate + defect report → reveal ("You felt 50% faster. You were actually −548% (AI was slower). Calibration gap: 598 points" — math correct for the timings used). Submission saved, **zero console errors**.
- **Tutor (X.1):** opens, answers "what is cell 1.4 about?" correctly from curriculum grounding. **Time-to-first-byte ≈ 14s** on a cold prompt cache (large grounding corpus) — works, but the wait is long (D-32).

---

## 3. Roadmap compliance matrix

Reconciliation of every PROJECT-PLAN.md task against the verified repo state. *Match* = claim accurate · *STALE* = repo ahead of plan · *CAVEAT* = done, but a DoD artifact is off.

### Phase 0 — Local foundation

| ID | Claimed | Verified | Evidence |
|---|---|---|---|
| P0.1 fork/rename/license | Done | **Done — match** | pkg `nava-ai-academy` (package.json:2); PolyForm LICENSE |
| P0.2 run locally | Done | **Done — match** | dev server + build verified this audit |
| P0.3 repo cleanup | Done | **Done — match** | PR #2 |
| P0.4 lightweight CI | Done | **Done — match (exceeded)** | `ci.yml`: npm ci → lint → build → **test** |

### Phase 1 — Claude-only model + local data layer

| ID | Claimed | Verified | Evidence |
|---|---|---|---|
| P1.1 rip out local AI | Done | **Done — CAVEAT** | src/supabase clean (grep); **`docs/local-ai-setup.md` still ships full Ollama instructions**, vs DoD "no references remain" |
| P1.2 Claude via API token | Done (#7) | **Done — match** | `supabase/functions/chat/index.ts` (server-side key); live stream verified §2.5 |
| P1.3 local Supabase stack | Done (#5) | **Done — match** | 25 migrations apply ×2, §2.3 |
| P1.4 data layer on Supabase | Done (#8) | **Done — match; note stale** | `src/lib/progress.ts` etc.; plan's "vitest-in-CI pending" note is stale — CI runs tests since #30 |
| P1.5 Google SSO + domain restriction | Done (#9) | **Done — match** | trigger `20260601160455`; client guard `src/lib/auth.tsx:58-64`; E2E 01 passes both ways |

### Phase 2 — Local MVP slice + GATE A

| ID | Claimed | Verified | Evidence |
|---|---|---|---|
| P2.1 curriculum shell (28 cells) | Done (#10) | **Done — match** | all 28 cell ids in `20260602190000` + live DB |
| P2.2 module 1.4 | Done (#11) | **Done — match** | E2E 05 passes |
| P2.3 lab 2.1 live Claude | Done (#12) | **Done — match** | E2E 03 + live smoke |
| P2.4 demo polish + script | Done (#13) | **Done — CAVEAT** | UI shipped; **`DEMO-SCRIPT.md` does not exist in any commit** (`git log --all -- '*DEMO*'` empty) though plan/GATE A cite it |
| GATE A | Passed 2026-06-02 | **Accepted** (process gate) | — |

### Phase 3 — Stage 1 complete

| ID | Claimed | Verified | Evidence |
|---|---|---|---|
| P3.1 module schema/metadata | Done (#15) | **Done — match** | `src/types.ts` |
| P3.2 content-as-data | Complete (#16/17/19/20) | **Done — match** | modules + content_versions tables; `useCurriculum.ts` |
| P3.3 Stage 1a content | Loaded (#22), SME pending | **Done — match** | in DB, verified non-stub (§4) |
| P3.4 Stage 1b content | Loaded (#22), SME pending | **Done — match** | in DB |
| P3.5 scenario-sorter 1.3 | *table:* "In build (colleague)" | **MERGED — row STALE** | PR #24; `ScenarioSorter.tsx`; E2E exercises it via `completeSorter` |
| P3.6 classifier + tool-triage | Done (#23) | **Done — match** | components + seed `20260602200000` |
| P3.7 failure-spotter 1.7 | Done (#25) | **Done — match** | `FailureSpotter.tsx` + seed |
| P3.8 disclosure + regulatory | Done (#26) | **Done — match** | `ScenarioExercise.tsx` + seed |
| P3.9 harm + sign-off 1.12/1.13 | *table:* "Not started" | **MERGED — row STALE** | PR #29; `HarmRubric.tsx`, `SignoffChecklist.tsx`, seed `20260602240000` |
| P3.10 reflection 1.8/1.11 | Done (#27) | **Done — match** | `ReflectionCapture.tsx`; E2E 06 passes |
| P3.11 stage gating | "ready to merge, NOT merged" | **MERGED — STALE** | PR #28; `src/lib/gating.ts`; E2E 02 passes |

### Phase 4 — Stage 2 + lab framework

| ID | Claimed | Verified | Evidence |
|---|---|---|---|
| P4.1 generalize Lab | Done (#34) | **Done — match** | `src/components/Lab.tsx` |
| P4.2 grading engine | Done (#45) | **Done — match** | `grade` fn live-verified §2.5; champion-review UI deferred to P5.1 as stated |
| P4.3a output-audit 1.2 | Done (#49) | **Done — match** | `OutputAudit.tsx`; E2E 07 passes |
| P4.3b critique 2.2/2.3 | Done (#48) | **Done — match** | `Critique.tsx`/`SourcedFreeTextLab.tsx`; E2E 07 passes |
| P4.3c calibration 2.8 | Done (#50) | **Done — match** | `Calibration.tsx`; E2E 08 passes |
| P4.4a synthesis 2.7 | Done (#51) | **Done — match** | `Synthesis.tsx`; E2E 08 passes |
| P4.4b voice-edit 2.6 | Done (#52) | **Done — match** | `VoiceEdit.tsx`; E2E 09 passes |
| P4.5a context-diagnostic 2.5 | Done (#53) | **Done — match** | seed `20260603050000`; E2E 10 passes |
| P4.5b prompt-eval 2.10 | Done (#54) | **Done — match** | `PromptEval.tsx`; E2E 11 passes |
| P4.5c iteration 2.4 | "cleared to merge, **not merged**" | **MERGED — STALE** | PR #55 merged 2026-06-03; E2E 12 passes |
| P4.6 paired-calibration 2.15 | **"Not started"** | **MERGED — STALE (untracked)** | PR #56 merged 2026-06-03; live-smoked §2.6; no E2E, no component test |
| P4.7 productivity-illusion 2.13 | Not started | **IN FLIGHT — untracked** | **open PR #57** (2026-06-05, `feat/p4.7-productivity-critique`: DashboardCritique + dispatch + scoring + DRAFT seed). Not on main |
| P4.8 portfolio/Diligence 2.11 | Not started | **Absent — match** | no lab config; legacy `UseCaseLib.tsx` exists but is dead code (no DB row has type `use-case`) |
| P4.9 failure-mode log 2.9 | Not started | **Absent — match** | no component/kind/seed |
| P4.10 GLAT gate 2.14 | Not started | **Absent — match** | only a comment (`types.ts:6`); no Stage 2→3 gate; `modules_stage_check` allows only `1a/1b/2` |
| P4.11 Stage 2 content | lessons+quizzes loaded; SME pending | **Match (partial as claimed)** | but SME backlog = **13 cells, not the 8 the plan tracks** (§4) |

### Phases 5–7 (all "Not started" — confirmed absent, matching plan)

| Phase | Verified |
|---|---|
| P5.1–P5.6 admin portal | **Absent — match.** Substrate only: `profiles.role` check (learner/champion/admin) exists, all 13 live profiles are `learner`, role never read in app code; no dashboards/CMS/cohorts/exports; `content_versions` table exists with **0 rows and no writer** |
| P6.1–P6.6 hardening | **Absent — match.** Only adjacent substrate: in-memory per-isolate rate limits (chat 30/min, grade 20/min), Haiku default + model allowlist. No rotation, no spend caps/usage table, **no PII guard before model calls**, no automated a11y gate, no submission-PII enforcement |
| P7.1–P7.5 deploy | **Absent — match.** No vercel.json/Dockerfile/runbook; CI has no deploy. **P7.1 subdomain (people-latency, plan says start early) not started** |

### Cross-cutting

| ID | Claimed | Verified | Evidence |
|---|---|---|---|
| X.1 Claude tutor | *table:* "branch pushed, pending merge" | **MERGED — row STALE; compliant** | PR #14; `LocalTutorFAB.tsx` grounds from DB curriculum, prompt-cached, zero embedding/vector code; live-smoked §2.6 |
| X.2 content versioning | Not started | **Match (substrate only)** | `modules.version` bumps exist; `content_versions` never written |
| X.3 workshop mode | Not started | **Absent — match** | zero hits |
| X.4 hardening pass | Done (#30) + 67 findings fixed | **Done — match** | DEBT-REPORT.md present; fix PRs #31–#46 on main; CI test step live; E2E-in-CI deliberately deferred |

### Compliance discrepancy list

| # | Sev | Item | Discrepancy |
|---|---|---|---|
| C-1 | P2 | P4.6 | Plan "Not started" → actually merged (#56). Plan a full task behind on the critical path |
| C-2 | P2 | P4.7 | Plan "Not started" → complete implementation in open PR #57, untracked |
| C-3 | P2 | P4.5c | Plan "cleared to merge, not merged" → merged (#55) |
| C-4 | P2 | P2.4 | `DEMO-SCRIPT.md` cited by plan + GATE A never existed in any commit |
| C-5 | P2 | P1.1 | `docs/local-ai-setup.md` contradicts the verified DoD (full Ollama setup doc remains) |
| C-6 | P3 | P3.11 | Table row "not yet merged" vs merged (#28) — plan self-contradicts its own status board |
| C-7 | P3 | P3.5 | Table row "In build" vs merged (#24) |
| C-8 | P3 | P3.9 | Table row "Not started" vs merged (#29) |
| C-9 | P3 | X.1 | Table row "pending review/merge" vs merged (#14) |
| C-10 | P3 | P1.4 | "vitest-in-CI still pending" note stale (in CI since #30) |
| C-11 | P3 | cleanup backlog | Plan-tracked items still open: stale branches `feat/p3.7-failure-spotter`, `feat/p4.3b-clean-critique`; redundant #21 migration; no `.nvmrc` |
| C-12 | P3 | SME backlog count | Plan says 8 `in_review` cells; live DB has **13** (misses 1.3, 1.13, 2.1, 2.8, 2.15) |
| C-13 | P3 | E2E-in-CI | "full test suite + CI" covers unit/component only in CI; Playwright job commented out (documented) |

**Compliance summary:** 31/31 done-claims verified real (**100%**); artifact-strict 29/31 (**94%**); "Not started" spot-checks 24/26 accurate (exceptions: P4.7 in flight; benign substrates). **0 P0, 0 P1 discrepancies.**

---

## 4. Matrix coverage — all 28 cells

Live-DB verified (post-reset). Lesson = body_md chars (all cited prose with `## Sources`; zero stubs; min 2,473). Dispatch = case in `ModuleRenderer.tsx` `renderExercise`/`renderInteractive`.

| Cell | Lesson | Quiz | Expected instrument | Actual kind | Dispatch | Status | Gap |
|---|---|---|---|---|---|---|---|
| 1.1 | ✅ 2,921 | ✅ 3 | quiz only | — | n/a | published | — |
| 1.2 | ✅ 3,030 | ✅ 4 | output-audit | ✅ output-audit | ✅ :133 | **in_review** | SME |
| 1.3 | ✅ 2,966 | — (intentional: sorter is the gate) | scenario-sorter | ✅ sorter | ✅ :81 | **in_review** | SME |
| 1.4 | ✅ 3,015 | ✅ 3 | data-classifier | ✅ | ✅ :107 | published | — |
| 1.5 | ✅ 3,347 | ✅ 3 | tool-triage | ✅ | ✅ :109 | published | — |
| 1.6 | ✅ 2,765 | ✅ 3 | observation | — | n/a | published | P3: no observation instrument |
| 1.7 | ✅ 3,523 | ✅ 3 | failure-spotter | ✅ | ✅ :111 | published | — |
| 1.8 | ✅ 3,084 | ✅ 3 | reflection | ✅ | ✅ :119 | published | — |
| 1.9 | ✅ 3,131 | ✅ 3 | scenario | ✅ disclosure-builder | ✅ :113 | published | — |
| 1.10 | ✅ 4,348 | ✅ 3 | scenario | ✅ regulatory-check | ✅ :114 | published | — |
| 1.11 | ✅ 3,423 | ✅ 3 | reflection | ✅ | ✅ :119 | published | — |
| 1.12 | ✅ 3,679 | ✅ 4 | harm-scenario | ✅ harm-rubric | ✅ :121 | published | provenance: status clobbered to published/v1 by reconcile migration (D-24) |
| 1.13 | ✅ 3,297 | ✅ 3 | sign-off | ✅ signoff-checklist | ✅ :123 | **in_review** | SME |
| 2.1 | ✅ 2,605 | ✅ 3 | prompt-construction | ✅ (type `lab`) | ✅ :98 | **in_review** | SME; **dual gate bug D-02** |
| 2.2 | ✅ 2,816 | ✅ 3 | critique | ✅ | ✅ :125 | **in_review** | SME |
| 2.3 | ✅ 2,843 | ✅ 3 | critique | ✅ | ✅ :125 | **in_review** | SME |
| 2.4 | ✅ 2,473 | ✅ 3 | iteration | ✅ | ✅ :151 | **in_review** | SME |
| 2.5 | ✅ 2,480 | ✅ 3 | context-diagnostic | ✅ | ✅ :115 | **in_review** | SME |
| 2.6 | ✅ 2,684 | ✅ 3 | voice-edit | ✅ | ✅ :141 | **in_review** | SME |
| 2.7 | ✅ 2,888 | ✅ 3 | synthesis | ✅ | ✅ :129 | **in_review** | SME |
| 2.8 | ✅ 2,922 | ✅ 3 | calibration | ✅ | ✅ :137 | **in_review** | SME |
| 2.9 | ✅ 2,685 | ✅ 3 | **portfolio (failure log)** | ❌ none | n/a | published | **P1 gap: P4.9 missing** |
| 2.10 | ✅ 2,579 | ✅ 3 | prompt-eval | ✅ | ✅ :146 | **in_review** | SME |
| 2.11 | ✅ 2,670 | ✅ 3 | **portfolio (Diligence Stmt)** | ❌ none | n/a | published | **P1 gap: P4.8 missing**; legacy UseCaseLib dead-wired |
| 2.12 | ✅ 2,677 | ✅ 3 | performance-task | ❌ none | n/a | published | P2: quiz-only (plan: taught via content + model picker) |
| 2.13 | ✅ 2,866 | ✅ 4 | performance-task | ❌ on main | (in PR #57) | published | **P4.7 awaiting merge** |
| 2.14 | ✅ 2,513 | ✅ 4 | **objective gate ≥80%** | ❌ none | n/a | published | **P2 gap: P4.10 missing**; 4 questions ≠ GLAT bank; no gate computation |
| 2.15 | ✅ 3,036 | ✅ 3 | paired-calibration | ✅ | ✅ :157 | **in_review** | SME (seeded DRAFT); no E2E/component test |

**Coverage counts:** lessons 28/28 · quizzes 27/28 (1.3 by design) · interactive instruments 20/28 (8 quiz-only: 1.1 by design, 1.6, 2.9, 2.11, 2.12, 2.13†, 2.14) · status: 15 published, **13 in_review**, 0 draft. †2.13 resolves on merging PR #57.

**Cross-cutting matrix finding (D-08):** `modules.status` is cosmetic — `MODULE_COLUMNS` (`src/lib/modules.ts:64`) never selects it, `fetchCurriculum` never filters, and the RLS SELECT policy is unconditional for authenticated users. All 13 unreviewed cells (incl. the DRAFT-seeded 2.15) render to learners exactly like published content.

**Dispatch hygiene:** every seeded kind has a case (18 kinds + sorter + lab); dead cases `simulator`/`use-case`/`quiz`/`glossary` in `renderInteractive` have no DB rows (D-29).

---

## 5. Defect inventory (severity-ranked)

Deduplicated across lenses; cross-referenced against `docs/DEBT-REPORT.md` (67 findings, all resolved/accepted via #31–#46) — items below are **NEW** unless marked. "Repro" abbreviated; full repro steps in the lens evidence where cited.

### P1

| ID | Area | Where | Finding |
|---|---|---|---|
| **D-01** | Data integrity / auth | `src/lib/progressCache.ts:8`, `pendingWrites.ts:7`, `useProgress.ts:82-121`, `auth.tsx:103-105` | **Progress cache + pending-writes outbox not keyed by user; not cleared on sign-out.** On a shared browser, user B inherits user A's `completedModuleIds` (reconcile *unions* them in — Stage 2 can unlock for B without completing Stage 1a), and a parked offline completion of A's is replayed as a **DB write into B's `module_progress`**. Repro: sign in as A, go offline, complete a module (parks in outbox), sign out; sign in as B → A's progress appears and the parked completion upserts under B's id. |

### P2

| ID | Area | Where | Finding |
|---|---|---|---|
| D-02 | Gating | `ModuleRenderer.tsx:49,227` + `Lab.tsx:130,315-324`; DB: 2.1 has both quiz_json and lab config | **Cell 2.1 has two independent completion gates.** Passing the 3-question quiz completes the module with **no lab submission ever made** (and vice versa), contradicting the documented single-gate contract (ModuleRenderer.tsx:93-94). The only hands-on Stage-2 gate is skippable. |
| D-03 | Lab UX / error path | `VoiceEdit.tsx:84,113-115,230-253` | **Mid-stream draft failure = silent dead end.** Error + regenerate button render only when `!draftReady`; a partial draft (stream errored after first chunks) shows as the finished draft with no error, no regenerate, no revision prefill — and gets judged against the truncated draft. |
| D-04 | Lab error path | `Lab.tsx:81,61` (overlaps lens-6 ERR-N2 / lens-3 BUG-04) | **Stream-error text becomes the saveable response.** `setResponse('Error: …')` flips `hasRun`, enabling "Save & complete"; the error string is recorded as the transcript and sent to the LLM judge. |
| D-05 | Streaming contract | `src/lib/llm.ts:67-81 vs 27-31`; `Playground.tsx:132-134,346-353` | **Abort during the fetch phase throws `AbortError`,** violating the documented "abort resolves cleanly" contract — Playground's Stop pressed before first token renders "Error: …" in the bubble. |
| D-06 | Security (latent) | `20260528221204_init_core.sql:80-83`; column grants verified live | **Privilege escalation via `profiles.role` self-update.** Owner UPDATE policy has no column restriction; `authenticated` holds UPDATE on `role`; CHECK allows `champion/admin`. Inert today (role never read), but every existing user is pre-escalatable the moment P5.1 role-gated policies land. Must close **before** P5.1. |
| D-07 | Tests / data contract | `rls.integration.test.ts:142`; `20260603010000_seed_lab_config_1_2.sql` | **DATA-01 invariant test fails against current migrations** (1.2 now `in_review`/v2). Suite is `RUN_DB_TESTS`-gated and never runs in CI, so the break is silent. Evidence §2.2. |
| D-08 | Content workflow | `src/lib/modules.ts:64,141-145`; RLS policy on modules | **`modules.status` has zero runtime effect** — `in_review`/`draft` content ships to learners identically to published. Combined with the 13-cell backlog this is the launch-blocking pair. |
| D-09 | A11y regression | `PairedCalibration.tsx:279,340` (alerts), `:280-286` (no live region), `:173,178,283` (text-gray-400 contrast), phase swaps silent | **PairedCalibration regressed four resolved a11y patterns** (role="alert", aria-live on streams, contrast, focus/announcement) that all its sibling labs implement — it postdates the a11y pass and nothing machine-enforces the patterns (see D-28). |
| D-10 | A11y | `App.tsx:192-213`; `ModuleRenderer.tsx:264-272` | **No focus or scroll management on module/view change** — content region swaps wholesale, focus drops to `<body>` on auto-advance, learner lands mid-page in the next module (SC 2.4.3). DEBT-REPORT's focus work covered modals only. |
| D-11 | Performance | `dist/` output; no `React.lazy` in src; `vite.config.ts` | **861.86 kB single bundle, zero code-splitting.** Natural split points: Playground, the 16-component exercise dispatch, the react-markdown pipeline; unused `RealtimeClient` ships via supabase-js. |
| D-12 | Performance | `Playground.tsx:108-115,289-329` | **Full markdown re-parse of the whole conversation on every streamed chunk** (no memoized message row) — degrades on long sessions. |

### P3

| ID | Area | Where | Finding |
|---|---|---|---|
| D-13 | Lab UX | `Lab.tsx:63-68,326` | Stale grade card persists across re-runs (siblings clear grade state; Lab doesn't). |
| D-14 | PairedCalibration | `:74-78,137-151` (merges lens-3 BUG-06 + lens-6 ERR-N5) | Neither "Done — stop timer" nor "Start over" aborts an in-flight stream: post-stop tokens silently accrue into the saved transcript; after reset, ghost text resurfaces and Run stays disabled until the orphan stream ends. |
| D-15 | IterationLab | `:75,102-107` | Failed turn discards the learner's typed message (rollback restores `messages` but not `input`) — in the lab whose graded artifact *is* those turns. |
| D-16 | Robustness | `modules.ts:74-113`; consumers `Quiz.tsx:178`, `PairedCalibration.tsx:30,174`, `Calibration.tsx:24` | `quiz_json`/`lab_config_json` shape-unvalidated; one malformed authored row white-screens the whole app via the top-level ErrorBoundary (unknown kinds are handled; malformed known-kinds are not). |
| D-17 | Grading UX | `Lab.tsx:123-124`, `SourcedFreeTextLab.tsx:109-110`, `VoiceEdit.tsx:162-163`, `PromptEval.tsx:148-149`, `IterationLab.tsx:159-160` | Grading failure is a dead end in all five judge-graded labs: `saved=true` permanently disables resubmit, no "retry grading"; a grade computed after a failed `saveGrade` is discarded. |
| D-18 | PairedCalibration | `:130-134,340-349` | Save failure offers only "Start over", which wipes both timed runs — no save retry. |
| D-19 | A11y | `Lab.tsx:306-314` | Grading status/error not announced (all five newer judge-graded labs have role="status"; Lab predates the pattern). |
| D-20 | A11y | `HarmRubric.tsx:113-157` | Graded feedback lacks live region; correct/wrong conveyed by color+icon only (no sr-only text). |
| D-21 | Security ops | `chat/index.ts:46-49`, `grade/index.ts:37-50` | Rate limiting is in-memory per-isolate (resets on cold start, not shared) — best-effort only; durable store is the production path (feeds P6.2). |
| D-22 | Security hygiene | `supabase/seed.sql:13` | Committed local-dev credential (`demo@navapbc.com`/`demo-password`) inserted directly into `auth.users` — LOCAL ONLY by design; ensure it can never reach a hosted DB (P7.2 checklist). |
| D-23 | Security nit | `chat/index.ts:31`, `grade/index.ts:12`, `chat-core.ts:11` | Model ids are aliases not dated snapshots; `ANTHROPIC_MODEL` env override bypasses the allowlist. |
| D-24 | Data provenance | `20260602260000_reconcile_stage_1b_provenance.sql:17-20` vs `20260602240000:50-53` | Reconcile migration clobbered 1.12's intentional `in_review`/v2 marker back to published/v1 (1.13 kept it) — provenance now inconsistent between the two same-vintage cells. |
| D-25 | Migration hygiene | `20260602270000:20-23` (re-bumps version on re-apply), `20260602240000` (no `is null` guard) | Two seed migrations aren't strictly re-runnable (manual replay would drift rows); all 8 sibling seeds are guarded. Reset-path is fully deterministic (verified ×2). |
| D-26 | Tests | no `e2e/*paired*`, no component test (only `pairedCalibration.compute.test.ts`) | 2.15 has no E2E and no component test — six-phase timer flow, stop-while-streaming, save path untested. |
| D-27 | E2E isolation | `playwright.config.ts:17-24`; `02-stage-gating.spec.ts` | Known/plan-tracked: suite requires a freshly reset DB (02 asserts locked-before state; second consecutive run fails it); no per-test cleanup possible (no DELETE policies). |
| D-28 | Tooling | `eslint.config.js` | No `eslint-plugin-jsx-a11y` — exactly why D-09 regressed unnoticed; cheap guardrail before P6.4. |
| D-29 | Dead code | `ModuleRenderer.tsx:75-84`; `UseCaseLib.tsx`, `PrivacySimulator.tsx` | Dispatch cases `simulator`/`use-case`/`quiz`/`glossary` have no DB rows; legacy components kept alive only by tests. |
| D-30 | UX consistency | `Quiz.tsx:117-158` vs rest | Mixed terminology ("Sprint Checkpoint"/"Next Sprint" vs Stage/cell/section; "AI off" vs "Without AI"); Lab's model selector uniquely not disabled mid-stream; Playground Export copies to clipboard with a Download icon and no feedback. |
| D-31 | Perf | `SourcedFreeTextLab.tsx:139,151-158`; `VoiceEdit.tsx:208` | Source markdown re-parses on every keystroke (un-memoized) — cheap today, foot-gun as sources grow. |
| D-32 | Tutor UX | `LocalTutorFAB.tsx` + live smoke §2.6 | ~14s time-to-first-byte on cold prompt cache (large grounding corpus); works, but no expectation-setting beyond "Thinking…". |
| D-33 | Docs/debt | `docs/local-ai-setup.md`; `llm.ts:38` comment; stale branches; #21 migration; no `.nvmrc` | Plan-tracked cleanup backlog still open (= C-5, C-11). |

**DEBT-REPORT overlaps deliberately not re-reported:** index keys on append-only lists (FE-09, accepted), silent best-score read-back catches (accepted), append-only resubmits (DATA-04, resolved), in-memory rate-limit *acknowledgement* (the D-21 note adds the production-path requirement only).

---

## 6. Missing functionality (vs roadmap)

| Item | Phase | State | What's missing |
|---|---|---|---|
| Productivity-illusion critique (2.13) | P4.7 | **Built, in open PR #57** | merge + PM validation; until then 2.13 is quiz-only on main |
| Portfolio: use-case lib + Diligence Statement (2.11) | P4.8 | Missing | portfolio rework of dead-wired `UseCaseLib`, 4D Diligence Statement exit artifact, persistence (no portfolio table), seed |
| Portfolio: failure-mode log (2.9) | P4.9 | Missing | component, kind, dispatch, seed, dated-entry storage (≥6 entries over time) |
| GLAT objective gate (2.14) | P4.10 | Missing | objective bank, ≥80% computation, Stage 2→3 gate — schema can't express Stage 3 (`modules_stage_check` = '1a','1b','2') |
| SME sign-off | P4.11/P6.5 | **13 cells `in_review`** | review pass + a mechanism that makes `status` mean something (D-08) |
| Champion-review UI | P4.2→P5.1 | Missing, **data already queuing** | LLM-graded rows sit at `status='reviewable'` (live DB has them) but owner-only RLS means no champion can read them; no reviewer columns; no queue UI |
| Admin portal (roles/RLS, dashboards, CMS, cohorts, exports) | P5.1–P5.6 | Missing | everything; `content_versions` has no writer; `role` never read; close D-06 first |
| Hardening | P6.1–P6.6 | Missing | key rotation, durable cost caps/usage view (D-21), **pre-call PII guardrail** (no "don't paste PII" gate anywhere), automated a11y checks (D-28), submission-PII enforcement |
| Deploy + pilot | P7.1–P7.5 | Missing | **start P7.1 subdomain request now** (people-latency); cloud Supabase, Vercel, runbook, pilot |
| Content versioning discipline | X.2 | Substrate only | snapshot writer (trigger or CMS), rollback, changelog |
| Workshop mode | X.3 | Missing | entire feature |

---

## 7. Improvements (non-roadmap, from verification)

1. Wire the `RUN_DB_TESTS` suite (and eventually E2E) into a CI job with `supabase start` — D-07 proved a real failure can hide there.
2. Code-split Playground + exercise dispatch + markdown pipeline (D-11) and memoize markdown rendering (D-12, D-31).
3. Add `eslint-plugin-jsx-a11y` + an axe smoke to stop a11y pattern regressions (D-09, D-28); cheap precursor to P6.4.
4. Add E2E + component coverage for 2.15 (D-26) and a `db reset` precondition note/guard for the E2E suite (D-27).
5. Warm the tutor's prompt cache (or stream a first-token heartbeat) to cut the ~14s cold TTFB (D-32).
6. Terminology/UX consistency pass (D-30); remove dead dispatch paths (D-29).
7. Keep PROJECT-PLAN.md's status board current (C-1..C-10) — this audit's biggest source of noise was a plan two days behind its repo.

---

*Audit verified before publication: lint/build green; vitest 206/6 skipped (1 hidden failure in the gated suite, reported as D-07); E2E 15/15; every compliance status and defect above carries file:line, command output, SQL, or PR evidence; no non-doc files changed on this branch.*

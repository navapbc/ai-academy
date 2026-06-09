# Remediation Plan — 2026-06-09

Companion to [AUDIT-REPORT-2026-06-09.md](AUDIT-REPORT-2026-06-09.md) (defect ids D-xx, compliance ids C-xx refer to it). Items are grouped by theme, each with **priority**, **effort** (S ≤ ½ day · M ≈ 1–2 days · L ≈ 3+ days), **dependencies**, and a suggested execution order. Roadmap mapping uses PROJECT-PLAN.md phase ids.

## Launch-blocker summary (do these or don't launch)

| # | Blocker | Why | Closed by |
|---|---|---|---|
| LB-1 | **13 cells `in_review` with no SME sign-off** — and `status` has no runtime effect, so unreviewed content already ships | P4.11/P6.5 DoD; content liability | W3-1 + W3-2 |
| LB-2 | **BUG D-01 cross-user progress leak/write** | data integrity on any shared machine | W2-1 |
| LB-3 | **D-06 role self-escalation** | must close *before* any role-gated feature (P5.1) | W2-2 |
| LB-4 | **P7.1 subdomain not requested** — plan's own "start early, people-latency" item | deploy critical path | W5-1 (start now, zero code) |
| LB-5 | 2.1 dual completion gate (D-02) — the only hands-on Stage-2 gate is skippable | evidence validity | W2-3 |

---

## Workstream 1 — Compliance & repo hygiene (fast, mostly docs/ops)

| Item | Pri | Effort | Deps | Maps to |
|---|---|---|---|---|
| W1-1 Re-baseline PROJECT-PLAN.md status board + table rows (P3.5/P3.9/P3.11/X.1/P4.5c/P4.6 merged; P4.7 = PR #57; SME backlog = 13 cells) — fixes C-1..C-10, C-12 | P1 | S | — | plan upkeep |
| W1-2 Delete stale branches (`feat/p3.7-failure-spotter`, `feat/p4.3b-clean-critique` + merged-feature leftovers); add `.nvmrc` (Node 22 to match CI) | P3 | S | — | C-11 |
| W1-3 Remove or rewrite `docs/local-ai-setup.md` (P1.1 DoD violation, C-5); fix stale `generateLocalStream` comment (`llm.ts:38`, D-33) | P3 | S | — | P1.1 |
| W1-4 Decide on redundant migration `20260602141611` (#21): keep-documented or squash at the P7.2 cloud-push boundary; add `is null` guards to `20260602240000`/`20260602270000` (D-25) | P3 | S | — | P7.2 prep |
| W1-5 Commit a real `DEMO-SCRIPT.md` or correct the P2.4/GATE A reference (C-4) | P3 | S | — | P2.4 |

## Workstream 2 — Bugs (defect ids from the audit report)

Suggested order: W2-1 → W2-2 → W2-3 first (launch blockers), then the error-path cluster as one PR, then polish.

| Item | Pri | Effort | Deps | Maps to |
|---|---|---|---|---|
| W2-1 **D-01:** key `sprint_progress` + `sprint_pending_completions` by user id; clear both on `SIGNED_OUT`; ignore foreign-owner cache in `useProgress` reconcile. Add a two-user regression test | **P1** | S–M | — | P1.4 hardening |
| W2-2 **D-06:** migration to revoke column UPDATE on `profiles.role` (or trigger forbidding self-role-change); extend `rls.integration.test.ts` | **P1** (before P5.1) | S | — | P5.1 prereq |
| W2-3 **D-02:** make 2.1 single-gate (recommended: lab gates, quiz renders ungated — matches every other lab's "quiz is the gate" inverse pattern; pick one and document) | P2 | S | SME input on which gate | P4.1/2.1 |
| W2-4 Error-path cluster, one PR: **D-04** (Lab: separate `runError` state, never save error text), **D-03** (VoiceEdit: surface `draftError` + regenerate outside `!draftReady`), **D-05** (`llm.ts`: swallow fetch-phase `AbortError` per contract), **D-13** (clear stale grade on re-run), **D-15** (IterationLab: restore `input` on failure) | P2 | M | — | P4.x quality |
| W2-5 **D-07:** reconcile the DATA-01 test with the post-P4.3a world (test the *invariant that's actually intended* — e.g. provenance fields — not `status='published'`); fix D-24's 1.12/1.13 provenance inconsistency in the same change; add a CI job that runs `supabase start` + `RUN_DB_TESTS=1` | P2 | M | — | X.4 |
| W2-6 PairedCalibration cluster: **D-14** (abort stream in `finishOn` + `reset`), **D-18** (save-retry button), **D-09** (role="alert"/aria-live/contrast/phase announcements to sibling-lab parity) | P2 | S–M | — | P4.6 quality |
| W2-7 **D-16:** per-kind config shape guards (or a per-module ErrorBoundary) so one malformed authored row can't white-screen the app | P3 | M | — | P5.4 prereq (CMS will increase malformed-content risk) |
| W2-8 **D-17:** "Retry grading" affordance in the five judge-graded labs; don't discard a computed grade when `saveGrade` fails | P3 | S | — | P4.2 |
| W2-9 A11y parity: **D-10** (focus/scroll reset on module change), **D-19** (Lab grading live region), **D-20** (HarmRubric sr-only + live region) | P2/P3 | S–M | — | P6.4 head-start |

## Workstream 3 — Content & SME workflow (launch-critical)

| Item | Pri | Effort | Deps | Maps to |
|---|---|---|---|---|
| W3-1 **Schedule the SME review pass over all 13 `in_review` cells** (1.2, 1.3, 1.13, 2.1–2.8 in_review set, 2.10, 2.15; +2.13 when PR #57 merges). Human-gated — start scheduling now, it's the longest pole | **P1** | L (people-time) | SME availability | P4.11, P6.5, LB-1 |
| W3-2 **D-08:** make `status` real — select it in `MODULE_COLUMNS`, and either filter `in_review` from learner fetches or render a visible "draft — under review" badge (badge recommended pre-pilot so content stays testable) | P1 | S | decision: hide vs badge | P3.2/P6.5 |
| W3-3 Record SME outcomes by flipping rows to `published` via migration (until the P5.4 CMS exists); wire `content_versions` snapshot writing (X.2 substrate → actual) | P2 | M | W3-1 | X.2 |

## Workstream 4 — Missing features (roadmap Phase 4 remainder → Phase 5)

| Item | Pri | Effort | Deps | Maps to |
|---|---|---|---|---|
| W4-1 **Merge PR #57** (P4.7, 2.13 dashboard-critique) after PM validation — it's done and waiting | P1 | S | review | P4.7 |
| W4-2 P4.9 failure-mode log (2.9): dated multi-entry portfolio component + storage (new table or `lab_submissions` rows), ≥6 entries over time | P2 | M | — | P4.9 |
| W4-3 P4.8 portfolio builder + 4D Diligence Statement (2.11): rework dead `UseCaseLib`, exit artifact, persistence | P2 | L | W4-2 pattern | P4.8 |
| W4-4 P4.10 GLAT objective gate (2.14): question bank from Stage 1–2 items, ≥80% scoring, Stage 2→3 gate concept (needs `modules_stage_check` extension or a gate outside the stage enum) | P2 | L | P4.11 content (W3-1) | P4.10 |
| W4-5 Champion-review queue (deferred P4.2 → P5.1): reviewer columns (`reviewed_by/at`, override), champion RLS read paths, queue UI — `reviewable` rows are already accumulating | P2 | L | **W2-2 first** (D-06), P5.1 roles | P5.1/P5.5 |
| W4-6 Phase 5 admin portal: P5.1 roles & RLS → P5.2 live dashboard → P5.3 learner dashboard → P5.4 CMS (gets SME workflow off SQL migrations) → P5.5 cohorts → P5.6 exports | P2 | L×6 | W2-2, W4-5 | P5.x |

## Workstream 5 — Hardening & deploy (Phases 6–7)

| Item | Pri | Effort | Deps | Maps to |
|---|---|---|---|---|
| W5-1 **Kick off the `*.navapbc.com` subdomain request today** (Vercel DNS via Marques per D4 lean) — zero code, pure people-latency | **P1 (start now)** | S elapsed-long | Nava IT | P7.1, LB-4 |
| W5-2 P6.2 durable cost caps: usage table + per-user/cohort caps (replaces in-memory limiter, D-21); admin spend view | P2 | M | P5.1 for the view | P6.2 |
| W5-3 P6.3 pre-call PII guardrail (confirmation gate before `streamChat`; "don't paste real PII" enforced + taught) — currently nothing exists | P2 | M | — | P6.3, P6.6 |
| W5-4 P6.4 a11y pass: add `eslint-plugin-jsx-a11y` + axe E2E smoke now (D-28, cheap), formal keyboard/SR spot-checks after W2-6/W2-9 land | P2 | M | W2-6, W2-9 | P6.4 |
| W5-5 P6.1 key mgmt (rotation runbook; pin dated model snapshots, allowlist the env override — D-23) | P3 | S | — | P6.1 |
| W5-6 P7.2–P7.4 deploy: cloud Supabase (exclude `seed.sql` demo user — D-22; decide #21 squash — W1-4), Vercel, prod validation + runbook | P1 at phase-time | L | Phases 3–6, W5-1 | P7.x |

## Workstream 6 — Quality improvements (non-blocking)

| Item | Pri | Effort | Deps | Maps to |
|---|---|---|---|---|
| W6-1 Code-split Playground + exercise dispatch + markdown pipeline; drop unused supabase Realtime (D-11) | P2 | M | — | perf |
| W6-2 Memoize markdown rendering (Playground per-message, sourced-lab source blocks) (D-12, D-31) | P2 | S | — | perf |
| W6-3 E2E + component tests for 2.15; E2E for tutor; document/automate the fresh-reset precondition (D-26, D-27); E2E-in-CI when a supabase service container is added (C-13) | P2 | M | — | X.4 |
| W6-4 Tutor cold-start: warm the prompt cache on app load or set expectations in UI (~14s TTFB, D-32) | P3 | S–M | — | X.1 |
| W6-5 Terminology/UX pass ("Sprint" → Stage/section, "AI off" naming, Export feedback + icon, disable Lab model picker mid-stream) (D-30) | P3 | S | SME copy | UX |
| W6-6 Remove dead dispatch paths + legacy components (`simulator`, `use-case`, `quiz`, `glossary`; `PrivacySimulator`, old `UseCaseLib`) — or leave `use-case` until W4-3 decides its fate (D-29) | P3 | S | W4-3 decision | hygiene |

---

## Suggested sequencing

```
Week 1  (unblock + stop the bleeding)
  W5-1 subdomain request (people-latency — literally first)
  W3-1 schedule SME review pass (second-longest pole)
  W2-1 user-keyed cache (P1 bug) · W2-2 role-escalation guard
  W1-1 plan re-baseline · W4-1 merge PR #57
Week 2  (correctness + content workflow)
  W2-3 2.1 single gate · W2-4 error-path cluster · W2-5 CI for DB tests
  W3-2 status enforcement/badging · W2-6 PairedCalibration cluster
Weeks 3–4  (Phase-4 completion)
  W4-2 failure log (2.9) · W4-3 portfolio/Diligence (2.11) · W4-4 GLAT gate (2.14)
  W6-1/W6-2 perf · W6-3 test coverage · W2-9/W5-4 a11y guardrails
Weeks 5+  (Phase 5 → 6 → 7 per roadmap)
  W4-5 champion review → W4-6 admin portal → W5-2/W5-3 hardening → W5-6 deploy
  (W3-1 SME sign-off and W5-1 DNS should be resolving in parallel throughout)
```

**Dependency callouts:** W2-2 (role guard) strictly precedes any P5.1 work · W3-2 should land before any pilot user touches the app · W4-4 (GLAT) needs the Stage-2 content SME-signed (W3-1) for a defensible bank · W5-6 inherits W1-4 and D-22 as pre-push checklist items.

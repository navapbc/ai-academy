---
title: "feat: Workshop mode v1 — admin-authored guided module sequences (X.3)"
type: feat
status: active
date: 2026-07-02
origin: docs/brainstorms/x3-workshop-mode-requirements.md
---

# feat: Workshop mode v1 — admin-authored guided module sequences (X.3)

## Overview

A **workshop** is an admin-authored ordered path through existing published modules. Admins create/edit workshops in the staff area; learners browse available workshops and walk one via a guided **stepper** (each step renders the underlying module via `ModuleRenderer`), with progress derived from their existing `module_progress`. Bounded v1 (direction A) — **no** live/facilitated/real-time mode and **no** cohort scoping/pacing (both deferred; see origin: `docs/brainstorms/x3-workshop-mode-requirements.md`).

## Problem Frame

The curriculum is a flat set of cells with no way to package a curated, ordered multi-step path (e.g. "AI-for-writing: 2.6 → 2.7 → 2.10"). X.3 v1 adds guided workshop paths. The full facilitator-led/cohort-synchronized "live" mode is a separate, deferred initiative (overlaps the unannounced live-sessions roadmap).

## Requirements Trace
- R1. Admin can create/edit a workshop: title, optional intro, ordered list of existing **published** module `cell_id`s (add/remove/reorder). Admin-only.
- R2. Workshop definitions persist durably; writes are server-authoritative + admin-only.
- R3. Learners can list available workshops and launch one.
- R4. Launching shows a guided stepper: current step's module (via `ModuleRenderer`), position ("Step N of M"), next/prev; completing a step's module advances the path.
- R5. Workshop progress (completed/total) derives from the learner's existing `module_progress` — the workshop writes no completion state.
- R6. Guided view only — no change to module gating/completion; a module completed in a workshop == completed standalone (shared `module_progress`).

## Scope Boundaries
- No live/facilitated/real-time/lockstep mode (deferred — direction B / live-sessions).
- No cohort scoping/assignment or pacing (v1 workshops visible to all learners).
- No new lesson content; steps reference existing published modules only.
- No workshop analytics beyond the learner's own progress.

## Context & Research

### Relevant Code and Patterns
- **Admin-managed config table + admin-write Edge Function**: `cohorts`/`enrollments` (`supabase/migrations/20260611010000_cohort_substrate.sql`) + `admin-cohorts` Edge Function (`supabase/functions/admin-cohorts/{index.ts,admin-cohorts-core.ts}`) + client `src/lib/adminCohorts.ts`. Mirror this exactly for `workshops` + `admin-workshops`.
- **Content writes are server-authoritative** via service_role Edge Functions (`admin-content`) — same rationale here (validate step `cell_id`s exist + are published server-side).
- **Learner read** of admin config: authenticated-read RLS (like `cohorts` authenticated read) — workshops are non-sensitive; a simple authenticated `select` policy.
- **Rendering a module**: `src/components/ModuleRenderer.tsx` (dispatches on `labConfig.kind`); `src/lib/modules.ts` (`fetchCurriculum`, `mapRowToModule`, published/archived filtering). The stepper composes `ModuleRenderer` per step — reuse it verbatim so gating/completion are identical (R6).
- **Progress**: `module_progress` via `src/lib/progress.ts`/`useProgress.ts`; workshop progress = count of the workshop's `cell_id`s the learner has `completed`. Read-only over existing progress.
- **Learner nav**: `src/App.tsx` (`View` union + routing) + `src/components/Sidebar.tsx` — add a "Workshops" entry/View. Staff authoring: `src/components/StaffArea.tsx` in-page admin pattern (like CohortManagement).
- **Admin gating**: `useRole`/`RoleGuard` (`allow={['admin']}` for authoring).

### Institutional Learnings
- `admin-cohorts` (P5.5a) is the closest precedent: admin-only service_role write function + locked-down table + audit; reuse its shape. Keep the cohort tables/patterns as the template.

## Key Technical Decisions
- **Workshop = ordered `cell_id` list over existing modules** (not copied content) — reuses content-as-data; unpublishing/editing a module flows through automatically.
- **Reuse `ModuleRenderer` + `module_progress`** — the workshop is orchestration only; no new progress/gating (R5/R6), avoiding divergence.
- **Server-authoritative admin writes** via an `admin-workshops` Edge Function (mirrors `admin-cohorts`/`admin-content`), validating steps reference existing published cells; learner read via authenticated `select` RLS.
- **Storage:** a `workshops` table with an ordered `step_cell_ids text[]` column (simplest; ordering is the array order) — vs. a separate `workshop_steps` table (deferred unless per-step metadata is needed). Decide in Unit 1 (lean array).

## Open Questions

### Resolved During Planning
- Direction (A bounded), reuse ModuleRenderer/module_progress, defer live+cohort — from brainstorm.
- Write path — server-authoritative `admin-workshops` function (consistent with admin-cohorts/admin-content).

### Deferred to Implementation
- [Affects Unit 1] `step_cell_ids text[]` vs `workshop_steps` table — lean array for v1; revisit if per-step notes/overrides are wanted.
- [Affects R4/R6] Behavior when a step references a module the learner can't access yet (Stage-2 gating) or that was later unpublished/archived: v1 default — show a "locked/unavailable" step state (don't crash, don't bypass gating), skippable by next/prev. Confirm during implementation against `fetchCurriculum` filtering.
- [Affects R4] Stepper composition: whether "next" auto-advances on completion or is manual; where the stepper `View` mounts.

## Implementation Units

- [ ] **Unit 1: `workshops` table + RLS**
**Goal:** Durable workshop definitions; learner-read, no client write.
**Requirements:** R1, R2
**Dependencies:** None.
**Files:** Create `supabase/migrations/2026XXXXXXXXXX_workshops.sql`; Test `src/lib/workshopsRls.integration.test.ts` (DB-gated).
**Approach:** `workshops(id uuid pk, title text, intro text null, step_cell_ids text[] not null default '{}', created_by uuid, created_at, updated_at)`. RLS: authenticated `select` (workshops are non-sensitive, visible to all learners in v1); **no** client insert/update/delete policy (writes via service_role). Idempotent migration guards.
**Patterns to follow:** `cohort_substrate.sql` (authenticated read + no client write); idempotency guards from `admin_cms_foundation.sql`.
**Test scenarios:** Happy: service-role insert + authenticated learner select returns it. Edge: empty `step_cell_ids` allowed. Error/security: authenticated client insert/update/delete rejected.
**Verification:** RLS matrix green under `RUN_DB_TESTS=1`; `db reset` clean twice.

- [ ] **Unit 2: `admin-workshops` Edge Function + client wrapper**
**Goal:** Server-authoritative admin CRUD for workshops.
**Requirements:** R1, R2
**Dependencies:** Unit 1.
**Files:** Create `supabase/functions/admin-workshops/{index.ts,admin-workshops-core.ts,admin-workshops-core.test.ts}`; Create `src/lib/adminWorkshops.ts`; Test via core + gated integration.
**Approach:** Mirror `admin-cohorts`: authn (@navapbc.com) + admin authz (allowlist or `profiles.role='admin'`), CORS/rate-limit, action-dispatched body parsed in the node-testable core. Actions: `create`, `update` (title/intro/steps), `delete`. Core validates: title non-empty; `step_cell_ids` are strings referencing **existing published** modules (server-side check against `modules`), no dupes. Service-role client performs the write; optional audit row.
**Patterns to follow:** `supabase/functions/admin-cohorts/*`, `admin-content` validation style.
**Test scenarios:** Happy (core): valid create/update payloads parse+validate. Edge: empty title rejected; duplicate/unknown/unpublished cell_id rejected; reorder = update with new array order. Error/security: non-admin → 403; unknown workshop id on update/delete → 404. Integration (gated): service-role create/update/delete round-trips; client write blocked by RLS.
**Verification:** served-function smoke (admin create/update/delete 200; non-admin 403; bad step 400); core tests green.

- [ ] **Unit 3: Admin authoring UI (staff area)**
**Goal:** Admins build/edit workshops.
**Requirements:** R1
**Dependencies:** Unit 2.
**Files:** Create `src/components/staff/WorkshopManagement.tsx` (+ `src/lib/workshops.ts` read shaping if shared); Modify `src/components/StaffArea.tsx` (admin-only tile); Test component + `workshops.ts`.
**Approach:** Admin-only in-page panel (mirror `CohortManagement`): list workshops; create/edit form (title, intro, and a module-step picker that lets you add existing published modules and reorder them); calls `adminWorkshops`. Reuse the module list (published cells) for the picker.
**Patterns to follow:** `src/components/staff/CohortManagement`/`CohortDashboard`; `StaffArea` in-page admin tile + `RoleGuard allow={['admin']}`.
**Test scenarios:** Happy: renders workshop list; create/edit calls the correct action; reorder updates order. Edge: empty title disabled/blocked; empty step list allowed with a hint. Error: write failure surfaces an error. Integration (jsdom): non-admin doesn't see the tile.
**Verification:** An admin can create a workshop with ordered steps and see it listed.

- [ ] **Unit 4: Learner workshop list + guided stepper**
**Goal:** Learners walk a workshop step-by-step with progress.
**Requirements:** R3, R4, R5, R6
**Dependencies:** Units 1, 3 (data to walk).
**Files:** Create `src/components/WorkshopList.tsx`, `src/components/WorkshopRunner.tsx` (+ `src/lib/useWorkshops.ts`); Modify `src/App.tsx` (new `View` + routing), `src/components/Sidebar.tsx` (Workshops entry); Test components + progress derivation.
**Approach:** "Workshops" nav entry (all users) → `WorkshopList` (available workshops + per-workshop progress) → `WorkshopRunner`: renders the current step's module via `ModuleRenderer` (reused verbatim so gating/completion are identical), shows "Step N of M" + next/prev, and computes progress = count of the workshop's `cell_id`s with `module_progress.status='completed'`. Read-only over progress (no writes from the runner). Handle a step whose module is unavailable (unpublished/archived or gated) with a clear locked/unavailable state (per deferred decision).
**Patterns to follow:** `ModuleRenderer` usage in `Academy`/`App`; `LearnerDashboard` read-only self-view; `src/lib/modules.ts` published filtering; `useProgress`.
**Test scenarios:** Happy: runner renders step 1's module; next advances; progress shows completed/total from module_progress. Edge: single-step workshop; a step module unpublished → locked/unavailable state, no crash, next/prev still work; empty workshop → graceful empty state. Integration: completing a step's module (standalone completion) reflects in workshop progress (shared module_progress, R6); workshop writes no new progress rows. Error: unknown/removed workshop → not-found state.
**Verification:** A learner launches a workshop, walks steps via `ModuleRenderer`, sees accurate progress; standalone module completion and workshop progress stay consistent; no new completion writes originate from the runner.

## System-Wide Impact
- **Interaction graph:** New admin write path (`admin-workshops`) + new learner read/nav; the runner *reuses* `ModuleRenderer` (so all existing module callbacks/gating fire exactly as standalone). No change to `module_progress` writes.
- **State lifecycle risks:** Workshop progress is derived, not stored — no divergence from `module_progress`. A workshop referencing a later-unpublished/archived module must degrade gracefully (locked step), not crash or bypass gating.
- **API surface parity:** Completion semantics are the module's, unchanged; the workshop adds ordering only (R6).
- **Unchanged invariants:** `module_progress` writes, module gating (Stage-1a→2 lock), standalone module UX, RLS on user tables — all untouched. Workshops are additive admin config + a learner view.

## Risks & Dependencies
| Risk | Mitigation |
|------|------------|
| Workshop step references an unpublished/archived or gated module | Runner shows a locked/unavailable step (reuse `fetchCurriculum` published filtering + gating); never bypass gating (R6) |
| Divergent progress state | Progress derived from `module_progress`; runner writes nothing (R5) |
| Scope creep toward live/facilitated/cohort | Explicit non-goals; v1 is self-serve, no realtime, no cohort scoping |
| Admin write security | Server-authoritative `admin-workshops` (admin authz, service_role write, client-write-locked table) mirroring `admin-cohorts` |

## Documentation / Operational Notes
- Update PROJECT-PLAN X.3 on merge; note v1 = guided sequence, live/facilitated (B) + cohort scoping/pacing deferred to the live-sessions effort.

## Sources & References
- **Origin document:** [docs/brainstorms/x3-workshop-mode-requirements.md](docs/brainstorms/x3-workshop-mode-requirements.md)
- Patterns: `supabase/migrations/20260611010000_cohort_substrate.sql`, `supabase/functions/admin-cohorts/*`, `src/lib/adminCohorts.ts`, `src/components/staff/CohortManagement*`, `src/components/ModuleRenderer.tsx`, `src/lib/modules.ts`, `src/lib/useProgress.ts`, `src/App.tsx`, `src/components/Sidebar.tsx`

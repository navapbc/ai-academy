---
date: 2026-07-02
topic: x3-workshop-mode
---

# X.3 — Workshop mode (v1: guided sequence)

## Problem Frame

The curriculum is a flat set of 28 matrix cells; there's no way to package an **ordered, guided path** through a subset of them (e.g. "AI-for-writing workshop: 2.6 → 2.7 → 2.10"). A facilitator can't hand learners a curated multi-step flow. X.3 adds a **self-serve guided workshop path**: an admin authors an ordered sequence of existing modules; a learner walks it step-by-step with a progress stepper.

## Decisions (resolved in brainstorm)

- **Direction A (bounded), chosen over live/facilitated (B).** v1 is a **self-serve guided sequence**. The full facilitator-led, cohort-synchronized, real-time "live" mode (B) is **deferred** — it overlaps the (unannounced) live-sessions roadmap and is a dedicated product/design effort, not an autonomous build.
- **A workshop is an admin-authored ordered list of existing published modules** (a "path") with a title + optional intro/description. Reuses content-as-data; no new lesson content.
- **Learner walks it via a guided stepper**; each step renders the underlying module through the existing `ModuleRenderer`.
- **Step completion reuses `module_progress`** — a step is "done" when its underlying module is complete; workshop progress = completed steps / total. No duplicate progress state.
- **v1 excludes**: real-time/facilitator/lockstep pacing (B); cohort scoping/assignment + cohort pacing (a later slice — v1 workshops are available to all learners); analytics beyond the learner's own progress.

## Requirements

**Authoring (admin)**
- R1. An admin can create/edit a workshop: a title, optional intro, and an **ordered list of existing published module `cell_id`s** (add/remove/reorder). Admin-only, in the staff/CMS area.
- R2. Workshop definitions persist durably (new table[s]); writes are admin-only (service-role or admin-gated, consistent with the CMS write pattern).

**Learner experience**
- R3. A learner can see the list of available workshops and launch one.
- R4. Launching a workshop shows a **guided stepper**: the current step's module (via `ModuleRenderer`), step position (e.g. "Step 2 of 5"), and next/prev navigation; completing a step's module advances the path.
- R5. Workshop progress is shown (completed steps / total), derived from the learner's existing `module_progress` — no new completion writes from the workshop itself.

**Boundaries / integrity**
- R6. The workshop is a **guided view over existing modules** — it must not change module gating, completion semantics, or the standalone module experience. A module completed in a workshop is the same completion as completing it directly, and vice versa.

## Success Criteria
- An admin can author an ordered workshop path from existing modules.
- A learner can launch a workshop and walk its steps with visible progress; completing the underlying modules advances/completes the workshop.
- No change to standalone module gating/completion; a workshop step and its standalone module share the same `module_progress`.
- No real-time/facilitator/cohort machinery introduced (v1 boundary honored).

## Scope Boundaries
- **No live/facilitated/real-time/lockstep mode** (deferred to the live-sessions effort — direction B).
- **No cohort scoping/assignment or cohort pacing** in v1 (workshops available to all learners; cohort-assignment is a later slice).
- No new lesson content (reuses existing published modules only).
- No workshop-level analytics/dashboards beyond the learner's own progress.
- No reordering/versioning of the underlying modules (that's the CMS/X.2).

## Key Decisions
- Reuse `ModuleRenderer` + `module_progress` — the workshop is orchestration/ordering, not a new content or progress system. Keeps v1 small and avoids progress divergence (R6).
- Defer everything real-time/facilitated/cohort to protect against overbuilding an unannounced strategic feature (live sessions) inside a loop.

## Open Questions

### Deferred to Planning
- [Affects R2][Technical] Storage shape: a `workshops` table + a `workshop_steps` table (ordered rows) vs. a `workshops` table with an ordered `cell_ids` array column. Include a read policy for learners + admin write path (mirror cohorts/CMS patterns).
- [Affects R1][Technical] Where authoring lives (extend the CMS/StaffArea admin area) and how steps are validated (only existing published `cell_id`s; handle a referenced module later unpublished/archived).
- [Affects R3/R4][Technical] How workshops surface to learners (a new nav section/`View`) and how the stepper composes `ModuleRenderer` without duplicating gating.
- [Affects R4/R6][Technical] Behavior when a workshop references a module the learner can't yet access (Stage-2 gating) or that's been unpublished — skip / lock / warn.

## Next Steps
-> `/ce:plan` (direction + v1 scope decided; live/facilitated + cohort scoping explicitly deferred).

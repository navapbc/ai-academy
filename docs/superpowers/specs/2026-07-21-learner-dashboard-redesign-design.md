# Design — Learner Dashboard (My Progress) redesign for Course 1

- **Date:** 2026-07-21
- **Branch:** `fix/bug-fixs`
- **Scope:** Redesign `LearnerDashboard.tsx`'s summary cards and add a Course-1
  week-by-week view. No changes to `ModuleProgressTable`/`LabSubmissionsList` or their
  data. No new DB migrations or queries.

## Problem

`LearnerDashboard` ("My progress") shows four summary cards: Completion, Avg quiz
score, GLAT, Labs in review. Since the cohort restructure, Course 1 (the primary
content now) has **zero quizzes**, and its lab exercises (chat-compare,
decision-scenario, prediction-sort, delegation-sort, etc.) are all ungraded/
participation-based — they save a `lab_submissions` row with `status: 'submitted'`,
never `'reviewable'`. GLAT (`2.14`) is a matrix-only cell, not part of Course 1 at all.
So for a learner doing Course 1, Avg quiz score / GLAT / Labs in review are
structurally always empty — not occasionally, always. The page reads as broken or
low-value for the primary audience.

Verified via the seed content: `supabase/seed-data/course1-content.json`'s 17 modules
have no `quiz` field and their lab kinds never reach `'reviewable'` status (confirmed
by reading `ModuleRenderer.tsx`'s dispatch and each exercise component). Meanwhile
`supabase/seed-data/curriculum-content.json` (the Supplemental/matrix content) has a
quiz on all 28 modules, and GLAT (`2.14`) and judge-graded labs (e.g. cell `2.1` via
`20260602250000_lab_2_1_header.sql`) are real, still-used matrix features.

## Approach (decided in brainstorming)

Split the page into two blocks:

1. **Course 1** (primary) — completion scoped to `origin === 'course'` only, a
   "current week" indicator, a count of labs completed, and a per-week progress list
   (Week 0 → Week 5).
2. **Supplemental & resources** (secondary, visually subordinate) — completion scoped
   to `origin === 'matrix' || 'custom'` combined, plus Avg quiz score / GLAT / Labs in
   review — relocated here since those are real, matrix-only metrics, not dropped.

The existing `Module progress` table and `Your lab submissions` list are untouched —
they already group by section and already render "submitted"/no-quiz gracefully.

Per-week data is derived **client-side, with no new DB query**: `LearnerDashboard`
receives the already-fetched `sections: CurriculumSection[]` as a new prop (the same
data `Sidebar` already receives from `App.tsx`), and cross-references it against
`detail.modules`' completed flags (already fetched by `fetchLearnerDetail`).
Completion truth stays solely in `detail` (DB-fresh); `sections` supplies only week
membership/labels — so the two data sources can never disagree on *which* modules are
done.

## Data layer

### 1. `src/lib/learnerSelf.ts` — restructure `summarizeOwnProgress`

Replace the flat `OwnProgressSummary` with a two-tier shape:

```ts
export interface OwnProgressSummary {
  course: {
    completedCount: number;
    totalCount: number;
    completionPct: number | null; // null when totalCount === 0
    labsCompleted: number;        // distinct labId submitted among course-origin modules
  };
  supplemental: {
    completedCount: number;
    totalCount: number;
    completionPct: number | null;
    avgQuizPct: number | null;    // over supplemental-origin modules with a usable attempt
    glatPassed: boolean;          // unchanged: cellId === '2.14' && quizPassed === true
    reviewableLabs: number;       // detail.labs with status 'reviewable', scoped to
                                   // supplemental-origin cellIds (via detail.modules)
  };
}
```

- `course.*`: filter `detail.modules` to `origin === 'course'`. Completion = completed
  / total over that slice. `labsCompleted` = `new Set(detail.labs.filter(l =>
  courseCellIds.has(l.labId)).map(l => l.labId)).size` — distinct, so a resubmit
  doesn't inflate the count.
- `supplemental.*`: filter `detail.modules` to `origin === 'matrix' || origin ===
  'custom'`. `avgQuizPct`/`glatPassed` computed only over this slice (unchanged logic,
  narrower input). `reviewableLabs`: build a `Set` of supplemental-origin cellIds from
  `detail.modules`, then `detail.labs.filter(l => l.status === 'reviewable' &&
  supplementalCellIds.has(l.labId)).length`.
- `totalCount === 0` → `completionPct: null` for either tier (unenrolled learner with
  no visible Course 1 weeks, or a curriculum with no supplemental content).

This supersedes the single-tier `origin !== 'matrix'` exclusion added in the prior
fix — that fix is folded into this redesign (course-only for the primary number,
matrix+custom together for the secondary number).

### 2. New file `src/lib/courseWeekProgress.ts` (pure, no DB access)

```ts
import type { CurriculumSection } from '../types';

export interface WeekProgress {
  id: string;      // section.id
  week: string;     // section.week, e.g. 'Week 2'
  title: string;    // section.title, e.g. 'Ground & Scope for Improvement'
  completedCount: number;
  totalCount: number;
}

/** One row per course-week section, in curriculum order. */
export function buildWeekProgress(
  sections: CurriculumSection[],
  completedCellIds: ReadonlySet<string>,
): WeekProgress[] {
  return sections
    .filter((s) => s.kind === 'week')
    .map((s) => ({
      id: s.id,
      week: s.week,
      title: s.title,
      completedCount: s.modules.filter((m) => completedCellIds.has(m.id)).length,
      totalCount: s.modules.length,
    }));
}

export interface CurrentWeek {
  week: string;
  title: string;
  complete: boolean; // true when every week is fully done (this is the last week)
}

/** The first not-fully-complete week, else the last week marked complete. Null if
 *  there are no weeks (unenrolled learner — Course 1 not visible). */
export function currentWeek(weeks: WeekProgress[]): CurrentWeek | null {
  if (weeks.length === 0) return null;
  const inProgress = weeks.find((w) => w.completedCount < w.totalCount);
  if (inProgress) return { week: inProgress.week, title: inProgress.title, complete: false };
  const last = weeks[weeks.length - 1];
  return { week: last.week, title: last.title, complete: true };
}
```

`completedCellIds` is built by the caller from `detail.modules.filter(m =>
m.completed).map(m => m.cellId)` — one Set, reused for both `buildWeekProgress` and
anything else that needs it.

## Component & layout — `src/components/LearnerDashboard.tsx`

```text
Your progress
├── Course 1                                          (hidden if buildWeekProgress → [])
│   ├── StatCard "Completion"      — {course.completionPct} / "{completedCount} of {totalCount} modules"
│   ├── StatCard "Current week"    — currentWeek().week / currentWeek().title;
│   │                                 when currentWeek().complete, value is "Complete"
│   │                                 and the note is the last week's title (e.g.
│   │                                 "Complete" / "Spot the Pattern: Four Ways AI
│   │                                 Fails in Civic Tech") — never shows a stale
│   │                                 "current" week once the learner is done
│   └── StatCard "Labs completed"  — course.labsCompleted
│   └── Week-by-week list: one row per WeekProgress — week label, subtitle, "X/Y" +
│       a small progress bar (same visual language as Sidebar's per-section count)
│
├── Supplemental & resources                          (hidden if supplemental.totalCount === 0)
│   ├── StatCard "Explored"        — supplemental.completionPct / "X of Y"
│   ├── StatCard "Avg quiz score"  — supplemental.avgQuizPct
│   ├── StatCard "GLAT"            — supplemental.glatPassed
│   └── StatCard "Labs in review"  — supplemental.reviewableLabs
│
├── Module progress (unchanged — ModuleProgressTable, still section-grouped)
└── Your lab submissions (unchanged — LabSubmissionsList)
```

`LearnerDashboard` signature becomes `{ userId: string; sections: CurriculumSection[] }`.
`App.tsx` passes `sections` (already in scope in `Academy`) into the existing
`<LearnerDashboard userId={userId} />` call.

**Edge cases:**

- No visible Course 1 weeks (RLS hides `program`-visibility rows for an unenrolled
  learner): render a short "You're not enrolled in Course 1 yet" note instead of the
  block. Detected via `buildWeekProgress(sections, ...).length === 0`.
- No supplemental/resources content visible: omit that block entirely (not an empty
  shell) — detected via `supplemental.totalCount === 0`.
- Both blocks reuse the existing `StatCard`/`formatPct` empty-state rendering (em
  dash) for any individual null metric — no new empty-state code needed there.

## Testing plan

- **`src/lib/courseWeekProgress.test.ts`** (new): per-week counts correct; `currentWeek`
  picks the first incomplete week; falls back to the last week marked complete when
  all are done; returns `null` for zero weeks.
- **`src/lib/learnerSelf.test.ts`** (rewritten around the two-tier shape): course-only
  completion excludes both matrix and custom; supplemental completion combines
  matrix+custom; quiz/GLAT/reviewable-labs scoped correctly; null-safe empty cases for
  each tier independently.
- **`src/components/LearnerDashboard.test.tsx`** (rewritten): renders both blocks with
  correct numbers from a mixed fixture including weeks; hides the Course 1 block when
  `sections` has no week entries; omits the Supplemental block when there's no
  matrix/custom content; existing module-table/lab-list assertions carry over.
- Update `src/App.tsx`'s `<LearnerDashboard>` call site to pass `sections`; update any
  test that renders `App` and asserts on the Progress view.
- Also touch (type-only, no behavior change): `src/test/a11y.axe.test.tsx` and
  `src/components/staff/LearnerDetail.test.tsx` if they construct `OwnProgressSummary`
  or call `summarizeOwnProgress` directly — check during implementation.
- Full suite (`npm test`) + `npm run lint` clean at the end, per repo convention (Node
  22 required — see `nvm use 22`).

## Out of scope

- No changes to `ModuleProgressTable`, `LabSubmissionsList`, or their existing tests.
- No changes to the staff `LearnerDetail`/`CohortDashboard` views or the
  `learner_progress_summary` DB view (U13 invariant: learner surfaces never read it).
- No new DB migrations, columns, or RLS policies — `sections` is client-side data
  already fetched by `useCurriculum` for the whole app; no new query is added.
- Sidebar's own "Your Training" percentage (fixed in a prior change) is not touched
  here — it already excludes matrix from its denominator; this redesign doesn't
  change what Sidebar shows.

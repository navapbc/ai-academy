# Learner Dashboard (My Progress) Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the "My Progress" / `LearnerDashboard` page so its summary cards
reflect content that actually exists in Course 1 (no quizzes, no judge-graded labs),
while keeping Avg quiz score / GLAT / Labs in review visible where they still apply
(the Supplemental coursework + Resources content).

**Architecture:** Split `summarizeOwnProgress`'s output into two tiers (`course` vs
`supplemental`, filtered by `origin`). Add a new pure `courseWeekProgress.ts` module
that derives a per-week breakdown from the `sections` curriculum structure the app
already fetches (no new DB query — `LearnerDashboard` gains a `sections` prop, passed
down from `App.tsx`, the same data `Sidebar` already receives). Restructure
`LearnerDashboard.tsx`'s JSX into a primary "Course 1" block and a secondary
"Supplemental & resources" block; the existing module table and lab list are
untouched.

**Tech Stack:** React 19 + TypeScript, Vitest + Testing Library (jsdom), existing
`StatCard`/`formatPct` primitives from `src/components/progress/ProgressPanels.tsx`.

## Global Constraints

- Node 22 required for tests/lint/build (`nvm use 22` — jsdom errors on Node 20).
- Strict TypeScript: no `any`, no `@ts-ignore`, `noUnusedLocals`/`noUnusedParameters`.
- Full suite is `npm test` (vitest run); lint is `npm run lint` (`tsc --noEmit && eslint .`).
- Every task ends with the full suite green and lint clean before committing — this is
  a small, single-branch feature; don't skip verification "to save time."
- Do NOT touch `src/components/progress/ProgressPanels.tsx`, the staff
  `LearnerDetail.tsx`/`CohortDashboard.tsx`, or the `learner_progress_summary` DB view
  (U13 invariant — learner surfaces never read it).
- Reference spec: `docs/superpowers/specs/2026-07-21-learner-dashboard-redesign-design.md`.

---

### Task 1: `courseWeekProgress.ts` — per-week progress derivation

**Files:**
- Create: `src/lib/courseWeekProgress.ts`
- Test: `src/lib/courseWeekProgress.test.ts`

**Interfaces:**
- Produces: `WeekProgress { id: string; week: string; title: string; completedCount:
  number; totalCount: number }`, `CurrentWeek { week: string; title: string; complete:
  boolean }`, `buildWeekProgress(sections: CurriculumSection[], completedCellIds:
  ReadonlySet<string>): WeekProgress[]`, `currentWeek(weeks: WeekProgress[]):
  CurrentWeek | null`. Task 3 imports both functions and both types from this file.

- [ ] **Step 1: Write the failing test**

Create `src/lib/courseWeekProgress.test.ts`:

```ts
import { describe, test, expect } from 'vitest';
import { buildWeekProgress, currentWeek } from './courseWeekProgress';
import type { CurriculumSection, Module } from '../types';

function mod(id: string): Module {
  return {
    id,
    cellId: id,
    title: `Module ${id}`,
    type: 'content',
    content: '# Lesson',
    phaseId: 'week-a',
    origin: 'course',
    stage: null,
    visibility: 'public',
    status: 'published',
    dimension: ['Diligence'],
    evidenceType: 'quiz',
    selfReportValidity: 'medium',
    progressResetAt: null,
  };
}

function week(id: string, weekLabel: string, title: string, moduleIds: string[]): CurriculumSection {
  return {
    kind: 'week',
    id,
    week: weekLabel,
    title,
    description: '',
    modules: moduleIds.map(mod),
  };
}

const supplemental: CurriculumSection = {
  kind: 'supplemental',
  id: 'supplemental',
  week: 'Supplemental',
  title: 'Supplemental coursework',
  description: '',
  modules: [mod('1.1')],
};

describe('buildWeekProgress', () => {
  test('one row per week section, in order, with completed/total counts', () => {
    const sections = [
      week('w0', 'Week 0', 'Claude Set-up', ['c1-w0-a']),
      week('w1', 'Week 1', 'Break Claude on Purpose', ['c1-w1-a', 'c1-w1-b']),
      supplemental, // non-week sections are excluded
    ];
    const completed = new Set(['c1-w0-a', 'c1-w1-a']);

    const weeks = buildWeekProgress(sections, completed);

    expect(weeks).toEqual([
      { id: 'w0', week: 'Week 0', title: 'Claude Set-up', completedCount: 1, totalCount: 1 },
      { id: 'w1', week: 'Week 1', title: 'Break Claude on Purpose', completedCount: 1, totalCount: 2 },
    ]);
  });

  test('a curriculum with no week sections returns an empty list', () => {
    expect(buildWeekProgress([supplemental], new Set())).toEqual([]);
  });
});

describe('currentWeek', () => {
  test('picks the first not-fully-complete week', () => {
    const weeks = [
      { id: 'w0', week: 'Week 0', title: 'Claude Set-up', completedCount: 1, totalCount: 1 },
      { id: 'w1', week: 'Week 1', title: 'Break Claude on Purpose', completedCount: 1, totalCount: 2 },
      { id: 'w2', week: 'Week 2', title: 'Ground & Scope', completedCount: 0, totalCount: 2 },
    ];
    expect(currentWeek(weeks)).toEqual({
      week: 'Week 1',
      title: 'Break Claude on Purpose',
      complete: false,
    });
  });

  test('falls back to the last week, marked complete, once every week is done', () => {
    const weeks = [
      { id: 'w0', week: 'Week 0', title: 'Claude Set-up', completedCount: 1, totalCount: 1 },
      { id: 'w1', week: 'Week 1', title: 'Break Claude on Purpose', completedCount: 2, totalCount: 2 },
    ];
    expect(currentWeek(weeks)).toEqual({
      week: 'Week 1',
      title: 'Break Claude on Purpose',
      complete: true,
    });
  });

  test('returns null when there are no weeks', () => {
    expect(currentWeek([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run src/lib/courseWeekProgress.test.ts`
Expected: FAIL — `Cannot find module './courseWeekProgress'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/courseWeekProgress.ts`:

```ts
import type { CurriculumSection } from '../types';

// Per-week progress for the Course 1 block of the My Progress dashboard
// (2026-07-21 redesign). Pure — derived client-side from the `sections` the app
// already fetches via useCurriculum (the same data Sidebar renders), cross-referenced
// against the learner's completed cell ids. No new DB query: completion truth stays
// solely in the caller's `detail.modules` (DB-fresh); this module only supplies week
// membership/labels, so the two can never disagree on which modules are done.

export interface WeekProgress {
  id: string;
  week: string;
  title: string;
  completedCount: number;
  totalCount: number;
}

/** One row per course-week section (kind === 'week'), in curriculum order. */
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
  /** True once every week is fully done — `week`/`title` are then the last week's. */
  complete: boolean;
}

/**
 * The first not-fully-complete week, or the last week (marked complete) once every
 * week is done. Null when there are no weeks (e.g. an unenrolled learner — Course 1
 * isn't visible to them yet).
 */
export function currentWeek(weeks: WeekProgress[]): CurrentWeek | null {
  if (weeks.length === 0) return null;
  const inProgress = weeks.find((w) => w.completedCount < w.totalCount);
  if (inProgress) {
    return { week: inProgress.week, title: inProgress.title, complete: false };
  }
  const last = weeks[weeks.length - 1];
  return { week: last.week, title: last.title, complete: true };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run src/lib/courseWeekProgress.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Type-check and lint**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && npm run lint`
Expected: clean (no tsc or eslint errors).

- [ ] **Step 6: Commit**

```bash
git add src/lib/courseWeekProgress.ts src/lib/courseWeekProgress.test.ts
git commit -m "feat: add per-week course progress derivation for My Progress"
```

---

### Task 2: Restructure `learnerSelf.ts` into a course/supplemental two-tier summary

**Files:**
- Modify: `src/lib/learnerSelf.ts` (full rewrite of the exported shape)
- Test: `src/lib/learnerSelf.test.ts` (full rewrite)

**Interfaces:**
- Consumes: `LearnerDetailData`/`LearnerModuleRow`/`LearnerLabRow` from
  `./learnerDetail` (unchanged — already has `origin: string` on `LearnerModuleRow`
  and `labId: string` on `LearnerLabRow`).
- Produces: `CourseProgress { completedCount: number; totalCount: number;
  completionPct: number | null; labsCompleted: number }`, `SupplementalProgress {
  completedCount: number; totalCount: number; completionPct: number | null;
  avgQuizPct: number | null; glatPassed: boolean; reviewableLabs: number }`,
  `OwnProgressSummary { course: CourseProgress; supplemental: SupplementalProgress }`,
  `summarizeOwnProgress(detail: LearnerDetailData): OwnProgressSummary`. Task 3
  imports `OwnProgressSummary` and `summarizeOwnProgress` from this file.

- [ ] **Step 1: Write the failing test**

Replace the full contents of `src/lib/learnerSelf.test.ts`:

```ts
import { describe, test, expect } from 'vitest';
import { summarizeOwnProgress } from './learnerSelf';
import type { LearnerDetailData, LearnerModuleRow, LearnerLabRow } from './learnerDetail';

function mod(p: Partial<LearnerModuleRow> & { cellId: string }): LearnerModuleRow {
  return {
    cellId: p.cellId,
    title: p.title ?? p.cellId,
    origin: p.origin ?? 'course',
    section: p.section ?? 'Course lessons',
    completed: p.completed ?? false,
    bestQuizPct: p.bestQuizPct ?? null,
    quizPassed: p.quizPassed ?? null,
  };
}
function lab(p: Partial<LearnerLabRow> & { id: string }): LearnerLabRow {
  return {
    id: p.id,
    labId: p.labId ?? `lab-${p.id}`,
    status: p.status ?? null,
    createdAt: p.createdAt ?? '2026-01-01T00:00:00Z',
  };
}

describe('summarizeOwnProgress — course tier', () => {
  test('completion counts only origin=course modules', () => {
    const detail: LearnerDetailData = {
      modules: [
        mod({ cellId: 'c1-w0-a', origin: 'course', completed: true }),
        mod({ cellId: 'c1-w0-b', origin: 'course', completed: false }),
        mod({ cellId: '1.1', origin: 'matrix', completed: true }),
        mod({ cellId: 'custom-x', origin: 'custom', completed: true }),
      ],
      labs: [],
    };
    const s = summarizeOwnProgress(detail);
    expect(s.course).toMatchObject({ completedCount: 1, totalCount: 2, completionPct: 0.5 });
  });

  test('labsCompleted counts distinct lab ids among course-origin modules only', () => {
    const detail: LearnerDetailData = {
      modules: [
        mod({ cellId: 'c1-w1-a', origin: 'course' }),
        mod({ cellId: '1.1', origin: 'matrix' }),
      ],
      labs: [
        lab({ id: 'a', labId: 'c1-w1-a' }),
        lab({ id: 'b', labId: 'c1-w1-a' }), // resubmit — same lab, must not double-count
        lab({ id: 'c', labId: '1.1' }), // supplemental lab — must not count here
      ],
    };
    const s = summarizeOwnProgress(detail);
    expect(s.course.labsCompleted).toBe(1);
  });

  test('empty course tier when there are no course-origin modules (unenrolled learner)', () => {
    const detail: LearnerDetailData = {
      modules: [mod({ cellId: '1.1', origin: 'matrix', completed: true })],
      labs: [],
    };
    const s = summarizeOwnProgress(detail);
    expect(s.course).toMatchObject({
      completedCount: 0,
      totalCount: 0,
      completionPct: null,
      labsCompleted: 0,
    });
  });
});

describe('summarizeOwnProgress — supplemental tier', () => {
  test('completion combines matrix and custom, excludes course', () => {
    const detail: LearnerDetailData = {
      modules: [
        mod({ cellId: 'c1-w0-a', origin: 'course', completed: true }),
        mod({ cellId: '1.1', origin: 'matrix', completed: true }),
        mod({ cellId: '1.2', origin: 'matrix', completed: false }),
        mod({ cellId: 'custom-x', origin: 'custom', completed: true }),
      ],
      labs: [],
    };
    const s = summarizeOwnProgress(detail);
    expect(s.supplemental.completedCount).toBe(2);
    expect(s.supplemental.totalCount).toBe(3);
    expect(s.supplemental.completionPct).toBeCloseTo(2 / 3, 5);
  });

  test('avg quiz score is scoped to supplemental modules with a usable attempt', () => {
    const detail: LearnerDetailData = {
      modules: [
        mod({ cellId: 'c1-w0-a', origin: 'course', bestQuizPct: 0 }), // must not count
        mod({ cellId: '1.1', origin: 'matrix', bestQuizPct: 1 }),
        mod({ cellId: '1.2', origin: 'matrix', bestQuizPct: 0.5 }),
        mod({ cellId: '1.3', origin: 'matrix', bestQuizPct: null }), // never attempted
      ],
      labs: [],
    };
    const s = summarizeOwnProgress(detail);
    expect(s.supplemental.avgQuizPct).toBeCloseTo(0.75, 5);
  });

  test('glatPassed is true only when the supplemental 2.14 best attempt passed', () => {
    const passed = summarizeOwnProgress({
      modules: [mod({ cellId: '2.14', origin: 'matrix', bestQuizPct: 0.9, quizPassed: true })],
      labs: [],
    });
    expect(passed.supplemental.glatPassed).toBe(true);

    const failed = summarizeOwnProgress({
      modules: [mod({ cellId: '2.14', origin: 'matrix', bestQuizPct: 0.5, quizPassed: false })],
      labs: [],
    });
    expect(failed.supplemental.glatPassed).toBe(false);
  });

  test('reviewableLabs counts only reviewable submissions tied to supplemental modules', () => {
    const detail: LearnerDetailData = {
      modules: [
        mod({ cellId: 'c1-w1-a', origin: 'course' }),
        mod({ cellId: '2.1', origin: 'matrix' }),
      ],
      labs: [
        lab({ id: 'a', labId: '2.1', status: 'reviewable' }),
        lab({ id: 'b', labId: '2.1', status: 'reviewed' }),
        lab({ id: 'c', labId: 'c1-w1-a', status: 'reviewable' }), // course lab — must not count
      ],
    };
    const s = summarizeOwnProgress(detail);
    expect(s.supplemental.reviewableLabs).toBe(1);
  });

  test('empty supplemental tier when there is no matrix/custom content', () => {
    const detail: LearnerDetailData = {
      modules: [mod({ cellId: 'c1-w0-a', origin: 'course', completed: true })],
      labs: [],
    };
    const s = summarizeOwnProgress(detail);
    expect(s.supplemental).toMatchObject({
      completedCount: 0,
      totalCount: 0,
      completionPct: null,
      avgQuizPct: null,
      glatPassed: false,
      reviewableLabs: 0,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run src/lib/learnerSelf.test.ts`
Expected: FAIL — `s.course` is `undefined` (the current `summarizeOwnProgress` still
returns the old flat shape).

- [ ] **Step 3: Write the implementation**

Replace the full contents of `src/lib/learnerSelf.ts`:

```ts
import type { LearnerDetailData } from './learnerDetail';

// Learner self-view summary (P5.3a, redesigned 2026-07-21 for the Course 1
// restructure — see docs/superpowers/specs/2026-07-21-learner-dashboard-redesign-design.md).
// Pure derivation of the headline metrics from the already-fetched per-learner
// detail (the P5.2c `fetchLearnerDetail` reused at the owner-RLS path for one's own
// id). Computed client-side from the detail — no dependency on the P5.2a aggregation
// views — so the cards are self-consistent with the published-module table the
// learner sees, and the slice stays independent of the staff aggregation layer.
// INVARIANT (U13): keep it that way — learner surfaces never read
// `learner_progress_summary` (staff denominator semantics differ by design);
// asserted by learnerDetail.test.ts.
//
// Course 1 has no quizzes and no judge-graded ('reviewable') labs, so those metrics
// only make sense for the Supplemental coursework + Resources slice
// (origin !== 'course') — hence the two-tier split below instead of one flat
// completion number.

const GLAT_CELL_ID = '2.14';

export interface CourseProgress {
  /** Completed course-origin modules. */
  completedCount: number;
  /** Total course-origin modules. */
  totalCount: number;
  /** completedCount / totalCount, or null when there are no course modules visible. */
  completionPct: number | null;
  /** Distinct lab ids submitted among course-origin modules (a resubmit doesn't double-count). */
  labsCompleted: number;
}

export interface SupplementalProgress {
  /** Completed supplemental (matrix + custom) modules. */
  completedCount: number;
  /** Total supplemental (matrix + custom) modules. */
  totalCount: number;
  completionPct: number | null;
  /** Mean best-quiz fraction over supplemental modules with a usable attempt, or null. */
  avgQuizPct: number | null;
  /** Whether the learner's best GLAT (2.14) attempt passed. */
  glatPassed: boolean;
  /** Supplemental lab submissions currently awaiting champion review. */
  reviewableLabs: number;
}

export interface OwnProgressSummary {
  course: CourseProgress;
  supplemental: SupplementalProgress;
}

/**
 * Pure: fold one learner's detail into the two-tier headline metrics. `course`
 * covers origin === 'course' only; `supplemental` covers everything else (matrix +
 * custom) combined — matching the Module progress table's own section grouping.
 */
export function summarizeOwnProgress(detail: LearnerDetailData): OwnProgressSummary {
  const courseModules = detail.modules.filter((m) => m.origin === 'course');
  const supplementalModules = detail.modules.filter((m) => m.origin !== 'course');

  const courseCompletedCount = courseModules.filter((m) => m.completed).length;
  const courseTotalCount = courseModules.length;
  const courseCellIds = new Set(courseModules.map((m) => m.cellId));
  const courseLabsCompleted = new Set(
    detail.labs.filter((l) => courseCellIds.has(l.labId)).map((l) => l.labId),
  ).size;

  const supplementalCompletedCount = supplementalModules.filter((m) => m.completed).length;
  const supplementalTotalCount = supplementalModules.length;

  const attempted = supplementalModules.filter((m) => m.bestQuizPct !== null);
  const avgQuizPct =
    attempted.length === 0
      ? null
      : attempted.reduce((sum, m) => sum + (m.bestQuizPct ?? 0), 0) / attempted.length;

  const glatPassed = supplementalModules.some(
    (m) => m.cellId === GLAT_CELL_ID && m.quizPassed === true,
  );

  const supplementalCellIds = new Set(supplementalModules.map((m) => m.cellId));
  const reviewableLabs = detail.labs.filter(
    (l) => l.status === 'reviewable' && supplementalCellIds.has(l.labId),
  ).length;

  return {
    course: {
      completedCount: courseCompletedCount,
      totalCount: courseTotalCount,
      completionPct: courseTotalCount === 0 ? null : courseCompletedCount / courseTotalCount,
      labsCompleted: courseLabsCompleted,
    },
    supplemental: {
      completedCount: supplementalCompletedCount,
      totalCount: supplementalTotalCount,
      completionPct:
        supplementalTotalCount === 0 ? null : supplementalCompletedCount / supplementalTotalCount,
      avgQuizPct,
      glatPassed,
      reviewableLabs,
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run src/lib/learnerSelf.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Type-check — expect (and ignore for now) downstream breakage**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && npx tsc --noEmit`
Expected: errors in `src/components/LearnerDashboard.tsx` (it still reads the old
flat `summary.completedCount` etc. shape) — that's fine, Task 3 fixes it. Do not
attempt to fix `LearnerDashboard.tsx` in this task.

- [ ] **Step 6: Commit**

```bash
git add src/lib/learnerSelf.ts src/lib/learnerSelf.test.ts
git commit -m "refactor: split learner self-progress summary into course/supplemental tiers"
```

---

### Task 3: Redesign `LearnerDashboard.tsx`

**Files:**
- Modify: `src/components/LearnerDashboard.tsx` (full rewrite)
- Test: `src/components/LearnerDashboard.test.tsx` (full rewrite)

**Interfaces:**
- Consumes: `summarizeOwnProgress`/`OwnProgressSummary` from `../lib/learnerSelf`
  (Task 2), `buildWeekProgress`/`currentWeek`/`WeekProgress`/`CurrentWeek` from
  `../lib/courseWeekProgress` (Task 1), `CurriculumSection` from `../types`,
  `formatPct`/`StatCard`/`ModuleProgressTable`/`LabSubmissionsList` from
  `./progress/ProgressPanels` (unchanged), `useLearnerDetail` from
  `../lib/useLearnerDetail` (unchanged), `LearnerPortfolio` from
  `./progress/LearnerPortfolio` (unchanged).
- Produces: `LearnerDashboard({ userId, sections }: { userId: string; sections:
  CurriculumSection[] })` — the new required `sections` prop Task 4 must supply at
  the call site.

- [ ] **Step 1: Write the failing test**

Replace the full contents of `src/components/LearnerDashboard.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LearnerDashboard from './LearnerDashboard';
import type { LearnerDetailData } from '../lib/learnerDetail';
import type { CurriculumSection, Module } from '../types';

const { fetchLearnerDetail } = vi.hoisted(() => ({ fetchLearnerDetail: vi.fn() }));
vi.mock('../lib/learnerDetail', () => ({ fetchLearnerDetail }));

// The embedded portfolio section (P5.3b) fetches independently; stub it so these
// tests stay hermetic and focused on the detail panels (portfolio has its own test).
const { fetchLearnerPortfolio } = vi.hoisted(() => ({ fetchLearnerPortfolio: vi.fn() }));
vi.mock('../lib/learnerPortfolio', () => ({ fetchLearnerPortfolio }));

function courseModule(id: string): Module {
  return {
    id,
    cellId: id,
    title: `Module ${id}`,
    type: 'content',
    content: '# Lesson',
    phaseId: 'week-0',
    origin: 'course',
    stage: null,
    visibility: 'public',
    status: 'published',
    dimension: ['Diligence'],
    evidenceType: 'quiz',
    selfReportValidity: 'medium',
    progressResetAt: null,
  };
}

const SECTIONS: CurriculumSection[] = [
  {
    kind: 'week',
    id: 'week-0',
    week: 'Week 0',
    title: 'Claude Set-up',
    description: '',
    courseId: 'c-1',
    courseTitle: 'Course 1',
    modules: [courseModule('c1-w0-setup'), courseModule('c1-w0-wrap')],
  },
  {
    kind: 'week',
    id: 'week-1',
    week: 'Week 1',
    title: 'Break Claude on Purpose',
    description: '',
    courseId: 'c-1',
    courseTitle: 'Course 1',
    modules: [courseModule('c1-w1-a')],
  },
];

const DETAIL: LearnerDetailData = {
  modules: [
    { cellId: 'c1-w0-setup', title: 'Intro', origin: 'course', section: 'Course lessons', completed: true, bestQuizPct: null, quizPassed: null },
    { cellId: 'c1-w0-wrap', title: 'Wrap-up', origin: 'course', section: 'Course lessons', completed: true, bestQuizPct: null, quizPassed: null },
    { cellId: 'c1-w1-a', title: 'Ground rules', origin: 'course', section: 'Course lessons', completed: false, bestQuizPct: null, quizPassed: null },
    { cellId: '2.1', title: 'Prompting', origin: 'matrix', section: 'Supplemental coursework', completed: false, bestQuizPct: null, quizPassed: null },
    { cellId: '2.14', title: 'GLAT', origin: 'matrix', section: 'Supplemental coursework', completed: true, bestQuizPct: 0.9, quizPassed: true },
  ],
  labs: [
    { id: 'a', labId: 'c1-w0-setup', status: 'submitted', createdAt: '2026-01-01T00:00:00Z' },
    { id: 'b', labId: '2.1', status: 'reviewable', createdAt: '2026-01-02T00:00:00Z' },
  ],
};

beforeEach(() => {
  fetchLearnerDetail.mockReset();
  fetchLearnerPortfolio.mockReset();
  fetchLearnerPortfolio.mockResolvedValue({
    pairedCalibration: null,
    confidenceCalibration: null,
    failureLog: null,
    useCasePortfolio: null,
  });
});

describe('LearnerDashboard (self-view)', () => {
  test('renders Course 1 and Supplemental blocks with the right numbers', async () => {
    fetchLearnerDetail.mockResolvedValue(DETAIL);
    render(<LearnerDashboard userId="me" sections={SECTIONS} />);

    expect(screen.getByRole('heading', { name: 'Your progress' })).toBeInTheDocument();
    expect(await screen.findByText('Prompting')).toBeInTheDocument();

    // Course 1: 2 of 3 course modules complete; Week 0 is fully done, Week 1 isn't
    // — so Week 1 is the current week; 1 distinct course lab submitted.
    expect(screen.getByRole('heading', { name: 'Course 1' })).toBeInTheDocument();
    expect(screen.getByText('2 of 3 modules')).toBeInTheDocument();
    expect(screen.getByText('Labs completed')).toBeInTheDocument();

    const currentWeekCard = screen.getByText('Current week').parentElement!;
    expect(within(currentWeekCard).getByText('Week 1')).toBeInTheDocument();
    expect(within(currentWeekCard).getByText('Break Claude on Purpose')).toBeInTheDocument();

    // Per-week list rows (Week 0's own row — unambiguous since it isn't "current").
    expect(screen.getByText('Week 0')).toBeInTheDocument();
    expect(screen.getByText('2 of 2')).toBeInTheDocument(); // Week 0 row count
    expect(screen.getByText('0 of 1')).toBeInTheDocument(); // Week 1 row count

    // Supplemental & resources: 1 of 2 explored, GLAT passed, quiz avg 90%.
    expect(screen.getByRole('heading', { name: 'Supplemental & resources' })).toBeInTheDocument();
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();
    expect(screen.getByText('Passed')).toBeInTheDocument();
    expect(screen.getByText('Labs in review')).toBeInTheDocument();

    // Section headings + lab statuses from the (unchanged) shared tables.
    expect(screen.getByText('Course lessons')).toBeInTheDocument();
    expect(screen.getByText('Supplemental coursework')).toBeInTheDocument();
    expect(screen.getByText('submitted')).toBeInTheDocument();
    expect(screen.getByText('reviewable')).toBeInTheDocument();

    expect(fetchLearnerDetail).toHaveBeenCalledWith('me');
  });

  test('hides the Course 1 block when no weeks are visible (unenrolled learner)', async () => {
    fetchLearnerDetail.mockResolvedValue(DETAIL);
    render(<LearnerDashboard userId="me" sections={[]} />);

    expect(await screen.findByText('Prompting')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Course 1' })).not.toBeInTheDocument();
    expect(screen.getByText(/not enrolled in Course 1/i)).toBeInTheDocument();
    // Supplemental still renders — it's ungated.
    expect(screen.getByRole('heading', { name: 'Supplemental & resources' })).toBeInTheDocument();
  });

  test('omits the Supplemental block when there is no matrix/custom content', async () => {
    fetchLearnerDetail.mockResolvedValue({
      modules: DETAIL.modules.filter((m) => m.origin === 'course'),
      labs: [],
    });
    render(<LearnerDashboard userId="me" sections={SECTIONS} />);

    expect(await screen.findByText('Intro')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Supplemental & resources' })).not.toBeInTheDocument();
  });

  test('shows the empty lab message when there are no submissions', async () => {
    fetchLearnerDetail.mockResolvedValue({ modules: DETAIL.modules, labs: [] });
    render(<LearnerDashboard userId="me" sections={SECTIONS} />);
    expect(await screen.findByText(/haven’t submitted any labs/i)).toBeInTheDocument();
  });

  test('shows an error + retry when the fetch fails', async () => {
    fetchLearnerDetail.mockRejectedValueOnce(new Error('boom'));
    render(<LearnerDashboard userId="me" sections={SECTIONS} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not load/i);

    fetchLearnerDetail.mockResolvedValue(DETAIL);
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByText('Prompting')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run src/components/LearnerDashboard.test.tsx`
Expected: FAIL — `sections` isn't a recognized prop yet and the old cards
("Avg quiz score", "GLAT" outside a "Supplemental & resources" heading, etc.) don't
match the new assertions.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `src/components/LearnerDashboard.tsx`:

```tsx
import { Loader2, AlertTriangle } from 'lucide-react';
import type { CurriculumSection } from '../types';
import { useLearnerDetail } from '../lib/useLearnerDetail';
import { summarizeOwnProgress } from '../lib/learnerSelf';
import { buildWeekProgress, currentWeek, type WeekProgress } from '../lib/courseWeekProgress';
import {
  formatPct,
  StatCard,
  ModuleProgressTable,
  LabSubmissionsList,
} from './progress/ProgressPanels';
import LearnerPortfolio from './progress/LearnerPortfolio';

// Learner self-view dashboard (P5.3a, redesigned 2026-07-21 — see
// docs/superpowers/specs/2026-07-21-learner-dashboard-redesign-design.md). Reuses
// the P5.2c per-learner data-access (fetchLearnerDetail) at the owner-RLS path —
// userId is the signed-in user, so the existing owner policies already permit every
// read; no new policy or migration. INVARIANT (U13): this learner surface never
// reads the staff aggregation views (learner_progress_summary etc.) — their
// viewer-independent denominators are staff semantics by design. Asserted by
// learnerDetail.test.ts.
//
// Two blocks: "Course 1" (primary — completion/current week/labs completed, scoped
// to origin==='course', plus a per-week list) and "Supplemental & resources"
// (secondary — completion plus Avg quiz score/GLAT/Labs in review, which only have
// real data for matrix+custom content). `sections` is passed down from App.tsx (the
// same curriculum structure Sidebar renders) purely to derive week labels/membership
// — completion truth stays in `detail`, fetched independently under owner RLS.

function WeekRow({ week, title, completedCount, totalCount }: WeekProgress) {
  const pct = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);
  return (
    <li className="rounded-xl border border-gray-200 bg-white px-4 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-gray-500">{week}</span>
        <span className="text-[11px] font-semibold tabular-nums text-gray-500">
          {completedCount} of {totalCount}
        </span>
      </div>
      <p className="truncate text-sm font-medium text-gray-900">{title}</p>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
        <div className="h-full rounded-full bg-nava-plum" style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}

export default function LearnerDashboard({
  userId,
  sections,
}: {
  userId: string;
  sections: CurriculumSection[];
}) {
  const { detail, loading, error, reload } = useLearnerDetail(userId);
  const summary = detail ? summarizeOwnProgress(detail) : null;
  const weeks = detail
    ? buildWeekProgress(
        sections,
        new Set(detail.modules.filter((m) => m.completed).map((m) => m.cellId)),
      )
    : [];
  const current = currentWeek(weeks);

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <span className="text-[11px] font-bold uppercase tracking-widest text-nava-plum">
          Your dashboard
        </span>
        <h1 className="text-2xl font-bold text-gray-900" tabIndex={-1}>
          Your progress
        </h1>
        <p className="text-sm text-gray-600">
          Your Course 1 progress, plus anything you’ve explored in supplemental coursework and resources.
        </p>
      </header>

      {loading && (
        <div className="flex items-center justify-center py-12" role="status">
          <Loader2 className="w-6 h-6 text-nava-plum animate-spin" aria-hidden="true" />
          <span className="sr-only">Loading your progress…</span>
        </div>
      )}

      {error && !loading && (
        <div className="max-w-md text-center space-y-3 py-8 mx-auto" role="alert">
          <AlertTriangle className="w-8 h-8 text-orange-500 mx-auto" aria-hidden="true" />
          <p className="text-sm text-gray-700">{error}</p>
          <button
            onClick={reload}
            className="px-5 py-2 bg-nava-green hover:bg-nava-green/90 text-white rounded-xl font-bold transition-all"
          >
            Retry
          </button>
        </div>
      )}

      {detail && summary && !loading && !error && (
        <>
          {weeks.length > 0 && current ? (
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-gray-900">Course 1</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatCard
                  label="Completion"
                  value={formatPct(summary.course.completionPct)}
                  note={`${summary.course.completedCount} of ${summary.course.totalCount} modules`}
                />
                <StatCard
                  label="Current week"
                  value={current.complete ? 'Complete' : current.week}
                  note={current.title}
                />
                <StatCard label="Labs completed" value={String(summary.course.labsCompleted)} />
              </div>
              <ul className="space-y-2">
                {weeks.map((w) => (
                  <WeekRow key={w.id} {...w} />
                ))}
              </ul>
            </section>
          ) : (
            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-sm text-gray-600">You’re not enrolled in Course 1 yet.</p>
            </section>
          )}

          {summary.supplemental.totalCount > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-gray-900">Supplemental & resources</h2>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard
                  label="Explored"
                  value={formatPct(summary.supplemental.completionPct)}
                  note={`${summary.supplemental.completedCount} of ${summary.supplemental.totalCount}`}
                />
                <StatCard label="Avg quiz score" value={formatPct(summary.supplemental.avgQuizPct)} />
                <StatCard label="GLAT" value={summary.supplemental.glatPassed ? 'Passed' : 'Not yet'} />
                <StatCard label="Labs in review" value={String(summary.supplemental.reviewableLabs)} />
              </div>
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">Module progress</h2>
            <ModuleProgressTable modules={detail.modules} />
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">Your lab submissions</h2>
            <LabSubmissionsList
              labs={detail.labs}
              emptyText="You haven’t submitted any labs yet."
            />
          </section>
        </>
      )}

      {/* Portfolio & calibration artifacts (P5.3b). Independent fetch + states, so
          it renders even if the summary/module fetch above failed. */}
      <LearnerPortfolio userId={userId} />
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run src/components/LearnerDashboard.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Type-check — expect (and ignore for now) call-site breakage**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && npx tsc --noEmit`
Expected: errors at `src/App.tsx`'s `<LearnerDashboard userId={userId} />` (missing
the new required `sections` prop) and `src/test/a11y.axe.test.tsx`'s
`<LearnerDashboard userId="me" />` (same). Task 4 fixes both.

- [ ] **Step 6: Commit**

```bash
git add src/components/LearnerDashboard.tsx src/components/LearnerDashboard.test.tsx
git commit -m "feat: redesign My Progress dashboard for Course 1 content"
```

---

### Task 4: Wire `sections` into the call sites, then full verification

**Files:**
- Modify: `src/App.tsx:344`
- Modify: `src/test/a11y.axe.test.tsx` (the `LearnerDashboard (self-view)` case, ~line 305)

**Interfaces:**
- Consumes: `LearnerDashboard` from Task 3 (now requires `sections:
  CurriculumSection[]`). `sections` is already in scope in `Academy` (App.tsx) as a
  plain variable — no new fetch, no new prop threading beyond this one call site.

- [ ] **Step 1: Update the `App.tsx` call site**

In `src/App.tsx`, change:

```tsx
              <LearnerDashboard userId={userId} />
```

to:

```tsx
              <LearnerDashboard userId={userId} sections={sections} />
```

(`sections` is the `Academy` component's own prop — already destructured at the top
of the component, no import changes needed.)

- [ ] **Step 2: Update the a11y test fixture**

In `src/test/a11y.axe.test.tsx`, change:

```tsx
    name: 'LearnerDashboard (self-view)',
    element: <LearnerDashboard userId="me" />,
```

to:

```tsx
    name: 'LearnerDashboard (self-view)',
    element: <LearnerDashboard userId="me" sections={[]} />,
```

(The existing `learnerDetail` fixture in this file only has matrix-origin modules, so
`sections={[]}` is consistent — the Course 1 block renders its "not enrolled" note,
which introduces no new a11y violations; the axe scan still covers the Supplemental
block and the module table exactly as before.)

- [ ] **Step 3: Type-check**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && npx tsc --noEmit`
Expected: clean — no errors anywhere.

- [ ] **Step 4: Run the full test suite**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && npm test`
Expected: all tests pass (DB-gated suites skip as usual without `RUN_DB_TESTS=1`).
Pay particular attention to `src/test/a11y.axe.test.tsx` (no new axe violations) and
`src/lib/learnerDetail.test.ts` (the U13 invariant test — must still pass unchanged,
since `learnerDetail.ts` itself wasn't touched by this plan).

- [ ] **Step 5: Lint**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/test/a11y.axe.test.tsx
git commit -m "feat: pass curriculum sections into My Progress for the Course 1 week view"
```

---

## Final Verification Checklist

- [ ] `npm test` — full suite green, no skipped-but-should-run tests.
- [ ] `npm run lint` — clean (`tsc --noEmit && eslint .`).
- [ ] Manually confirm in the running app (`npm run dev`, sign in, open "My progress"):
  Course 1 block shows real numbers and a per-week list; Supplemental & resources
  block shows Avg quiz score/GLAT/Labs in review scoped to matrix+custom content;
  Module progress table and lab submissions list render exactly as before.

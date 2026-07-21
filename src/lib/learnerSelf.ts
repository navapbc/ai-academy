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

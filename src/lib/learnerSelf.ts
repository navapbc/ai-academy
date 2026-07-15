import type { LearnerDetailData } from './learnerDetail';

// Learner self-view summary (P5.3a). Pure derivation of the headline metrics from
// the already-fetched per-learner detail (the P5.2c `fetchLearnerDetail` reused at
// the owner-RLS path for one's own id). Computed client-side from the detail — no
// dependency on the P5.2a aggregation views — so the cards are self-consistent
// with the published-module table the learner sees, and the slice stays
// independent of the staff aggregation layer. INVARIANT (U13): keep it that way —
// learner surfaces never read `learner_progress_summary` (staff denominator
// semantics differ by design); asserted by learnerDetail.test.ts.

// The GLAT exit-credential cell (P4.10 / D7). Same canonical id the P5.2a view and
// the GLAT lab use; a pass here is the program completion marker.
const GLAT_CELL_ID = '2.14';

export interface OwnProgressSummary {
  /** Completed published modules. */
  completedCount: number;
  /** Total published modules. */
  totalCount: number;
  /** completedCount / totalCount as 0..1, or null when there are no published modules. */
  completionPct: number | null;
  /** Mean best-quiz fraction over modules with at least one usable attempt, or null. */
  avgQuizPct: number | null;
  /** Whether the learner's best GLAT (2.14) attempt passed. */
  glatPassed: boolean;
  /** Lab submissions currently awaiting champion review. */
  reviewableLabs: number;
}

/**
 * Pure: fold one learner's detail into headline metrics. Completion and the quiz
 * average are both scoped to the published-module rows in `detail.modules`, so they
 * line up with the table rendered alongside them.
 */
export function summarizeOwnProgress(detail: LearnerDetailData): OwnProgressSummary {
  const totalCount = detail.modules.length;
  const completedCount = detail.modules.filter((m) => m.completed).length;

  const attempted = detail.modules.filter((m) => m.bestQuizPct !== null);
  const avgQuizPct =
    attempted.length === 0
      ? null
      : attempted.reduce((sum, m) => sum + (m.bestQuizPct ?? 0), 0) / attempted.length;

  const glatPassed = detail.modules.some((m) => m.cellId === GLAT_CELL_ID && m.quizPassed === true);

  const reviewableLabs = detail.labs.filter((l) => l.status === 'reviewable').length;

  return {
    completedCount,
    totalCount,
    completionPct: totalCount === 0 ? null : completedCount / totalCount,
    avgQuizPct,
    glatPassed,
    reviewableLabs,
  };
}

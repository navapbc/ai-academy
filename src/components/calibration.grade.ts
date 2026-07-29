import type { CalibrationConfig } from '../types';

/**
 * Per-item calibration outcome. `over` = the learner trusted more than the
 * calibrated posture (picked a lower scale index than the target = over-reliance);
 * `under` = more skeptical than calibrated (higher index = under-reliance);
 * `calibrated` = exact match; `unanswered` = no pick.
 */
export type CalibrationOutcome = 'over' | 'calibrated' | 'under' | 'unanswered';

export interface CalibrationItemResult {
  id: string;
  pickedIndex: number | null; // index into config.scale, or null if unanswered
  targetIndex: number; // index into config.scale (-1 if the target id is misconfigured)
  /** pickedIndex - targetIndex; <0 over-reliant, >0 under-reliant, 0 calibrated; null if unanswered. */
  gap: number | null;
  result: CalibrationOutcome;
}

export interface CalibrationGrade {
  results: CalibrationItemResult[];
  /** Counts by outcome (`unanswered` excluded from over/under/calibrated). */
  summary: { calibrated: number; over: number; under: number; unanswered: number };
  /**
   * Score = number of EXACTLY calibrated items (tolerance 0). Exact match keeps
   * the over/under signal unambiguous — a ±1 tolerance would blur the very
   * direction-of-miss the exercise is teaching.
   */
  score: number;
  total: number;
  allCalibrated: boolean;
}

/**
 * Pure grading for the calibration exercise — no React, so it's unit-testable.
 * `picks[itemId]` is the learner's chosen scale id. Compares its position on the
 * ordered `scale` to the item's `target` position.
 */
export function gradeCalibration(
  picks: Record<string, string>,
  config: Pick<CalibrationConfig, 'scale' | 'items'>,
): CalibrationGrade {
  const indexOf = (id: string | undefined) =>
    id === undefined ? -1 : config.scale.findIndex((s) => s.id === id);

  const results: CalibrationItemResult[] = config.items.map((item) => {
    const targetIndex = indexOf(item.target);
    const pick = picks[item.id];
    if (pick === undefined) {
      return { id: item.id, pickedIndex: null, targetIndex, gap: null, result: 'unanswered' };
    }
    const pickedIndex = indexOf(pick);
    // An id that isn't on the scale (a stale pick, or a misconfigured `target`)
    // has no position, so no over/under DIRECTION can be inferred from it. Report
    // it as unanswered rather than letting the -1 sentinel arithmetic invent a
    // gap — otherwise a broken target makes every answered item read as
    // under-reliance, and an off-scale pick reads as over-reliance, which is the
    // exact signal this exercise is teaching.
    if (pickedIndex === -1 || targetIndex === -1) {
      return { id: item.id, pickedIndex: null, targetIndex, gap: null, result: 'unanswered' };
    }
    const gap = pickedIndex - targetIndex;
    const result: CalibrationOutcome = gap === 0 ? 'calibrated' : gap < 0 ? 'over' : 'under';
    return { id: item.id, pickedIndex, targetIndex, gap, result };
  });

  const summary = {
    calibrated: results.filter((r) => r.result === 'calibrated').length,
    over: results.filter((r) => r.result === 'over').length,
    under: results.filter((r) => r.result === 'under').length,
    unanswered: results.filter((r) => r.result === 'unanswered').length,
  };

  return {
    results,
    summary,
    score: summary.calibrated,
    total: config.items.length,
    allCalibrated: config.items.length > 0 && summary.calibrated === config.items.length,
  };
}

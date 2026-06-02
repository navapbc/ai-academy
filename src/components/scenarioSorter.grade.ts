import type { SorterCategory, SorterScenario } from '../types';

export interface SorterGrade {
  /** Ids of scenarios whose assigned category matches the key. */
  correctIds: string[];
  total: number;
  allCorrect: boolean;
}

/** Pure grading for the scenario sorter — no React, so it's unit-testable. */
export function gradeScenarios(
  assignments: Record<string, SorterCategory>,
  scenarios: SorterScenario[],
): SorterGrade {
  const correctIds = scenarios
    .filter((s) => assignments[s.id] === s.correct)
    .map((s) => s.id);
  return {
    correctIds,
    total: scenarios.length,
    allCorrect: correctIds.length === scenarios.length,
  };
}

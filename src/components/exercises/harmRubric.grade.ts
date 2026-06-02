import type { HarmRubricConfig } from '../../types';

export interface HarmRubricGrade {
  correctIds: string[];
  total: number;
  allCorrect: boolean;
}

/** Pure grading for the harm-rubric exercise — picks[scenarioId] = patternId. */
export function gradeHarmRubric(
  picks: Record<string, string>,
  scenarios: HarmRubricConfig['scenarios'],
): HarmRubricGrade {
  const correctIds = scenarios
    .filter((s) => picks[s.id] === s.correct)
    .map((s) => s.id);
  return {
    correctIds,
    total: scenarios.length,
    allCorrect: correctIds.length === scenarios.length,
  };
}

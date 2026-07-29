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
    // An empty scenario list is a misconfigured exercise, not a perfect score —
    // guard it the way outputAudit.grade.ts does. (HarmRubric's `allAnswered`
    // is `every()` over the same array, so with no scenarios Submit is enabled
    // and a 0/0 "all correct" would otherwise be reported.)
    allCorrect: scenarios.length > 0 && correctIds.length === scenarios.length,
  };
}

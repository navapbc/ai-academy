import type { GradeResult } from '../grading';

export interface AnswerKeyAnchor {
  id: string;
  label: string;
  correct: number;
}

const ANCHOR_MAX = 2;

/** Deterministic auto-grader for keyed labs — same GradeResult shape as the LLM judge. */
export function autoGrade(
  answers: Record<string, number>,
  key: AnswerKeyAnchor[],
): GradeResult {
  const perAnchor = key.map((k) => {
    const ok = answers[k.id] === k.correct;
    return {
      id: k.id,
      label: k.label,
      score: ok ? ANCHOR_MAX : 0,
      max: ANCHOR_MAX,
      rationale: ok ? 'Correct.' : 'Incorrect.',
    };
  });
  return {
    grader: 'auto',
    perAnchor,
    overall: perAnchor.reduce((sum, p) => sum + p.score, 0),
    maxOverall: key.length * ANCHOR_MAX,
  };
}

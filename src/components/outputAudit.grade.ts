import type { AuditStatus, OutputAuditConfig } from '../types';

export interface OutputAuditResult {
  id: string;
  /** The learner's verdict for this claim, or null if unanswered. */
  picked: AuditStatus | null;
  correct: boolean;
}

export interface OutputAuditGrade {
  results: OutputAuditResult[];
  /** Ids of claims the learner audited correctly. */
  correctIds: string[];
  score: number;
  total: number;
  allCorrect: boolean;
}

/**
 * Pure grading for the output-audit exercise — no React, so it's unit-testable.
 * `picks[claimId]` is the learner's verdict ('supported' | 'fabricated'); a
 * claim is correct when the verdict matches the answer key (`claim.status`). A
 * missing pick counts as incorrect.
 */
export function gradeOutputAudit(
  picks: Record<string, AuditStatus>,
  claims: OutputAuditConfig['claims'],
): OutputAuditGrade {
  const results: OutputAuditResult[] = claims.map((c) => {
    const picked = picks[c.id] ?? null;
    return { id: c.id, picked, correct: picked === c.status };
  });
  const correctIds = results.filter((r) => r.correct).map((r) => r.id);
  return {
    results,
    correctIds,
    score: correctIds.length,
    total: claims.length,
    allCorrect: claims.length > 0 && correctIds.length === claims.length,
  };
}

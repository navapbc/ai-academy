import { useCallback, useRef, useState } from 'react';
import { requestLlmGrade, type GradeResult, type GradeSubmission } from './grading';
import { saveGrade } from './progress';
import type { GradingRubric } from '../types';

interface GradeRequest {
  /** lab_submissions row id the grade attaches to (its status flips to 'reviewable'). */
  submissionId: string;
  rubric: GradingRubric;
  submission: GradeSubmission;
  /** Non-blocking note shown on failure; the retry affordance is rendered beside it. */
  failureNote: string;
}

/**
 * Shared LLM-judge grading state for the five judge-graded labs (Lab, VoiceEdit,
 * SourcedFreeTextLab, PromptEval, IterationLab). Owns the grading / result / error
 * trio and — the point of audit D-17 — a `retry` that re-grades the ALREADY-SAVED
 * submission: same row id, same judge payload, no re-run and no second
 * lab_submissions row, so a transient judge/network blip is recoverable in place
 * instead of a dead end. Completion is never gated on grading; that logic lives in
 * each lab and is untouched here.
 *
 * Centralizing this (rather than copy-pasting the retry into all five) is also why
 * the divergence that let D-09's a11y fix land in only one sibling can't recur.
 */
export function useLabGrading() {
  const [grading, setGrading] = useState(false);
  const [gradeResult, setGradeResult] = useState<GradeResult | null>(null);
  const [gradeError, setGradeError] = useState<string | null>(null);
  // The last request, so `retry` can re-grade the same saved submission.
  const lastRequest = useRef<GradeRequest | null>(null);

  const grade = useCallback(async (req: GradeRequest) => {
    lastRequest.current = req;
    setGrading(true);
    // Clear both sides of the prior verdict so a re-grade never renders a stale
    // card next to a fresh error (or vice versa).
    setGradeError(null);
    setGradeResult(null);
    try {
      const result = await requestLlmGrade({ rubric: req.rubric, submission: req.submission });
      await saveGrade(req.submissionId, result, 'reviewable');
      setGradeResult(result);
    } catch {
      setGradeError(req.failureNote);
    } finally {
      setGrading(false);
    }
  }, []);

  // Re-grade the same saved submission. A no-op until a failure populated the ref,
  // which is exactly when the "Try grading again" affordance is shown.
  const retry = useCallback(() => {
    if (lastRequest.current) void grade(lastRequest.current);
  }, [grade]);

  // Clears the trio when the underlying work changes (a re-run / regenerate),
  // mirroring the per-component resets it replaces.
  const reset = useCallback(() => {
    setGradeResult(null);
    setGradeError(null);
    lastRequest.current = null;
  }, []);

  return { grading, gradeResult, gradeError, grade, retry, reset };
}

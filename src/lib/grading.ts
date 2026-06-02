// Shared grading result shape, stored in lab_submissions.rubric_scores.
// Both the LLM judge (via the `grade` Edge Function) and the pure auto-key
// grader produce this exact shape, so a submission's grade is uniform.

export interface AnchorScore {
  id: string;
  label: string;
  score: number; // 0..max
  max: number; // 2 (not-met / partial / met)
  rationale: string;
}

export interface GradeResult {
  grader: 'llm' | 'auto';
  perAnchor: AnchorScore[];
  overall: number; // sum of anchor scores
  maxOverall: number; // sum of anchor maxes
}

export interface GradeSubmission {
  brief: string;
  prompt: string;
  response: string;
}

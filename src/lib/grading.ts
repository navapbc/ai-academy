// Shared grading result shape, stored in lab_submissions.rubric_scores.
// Both the LLM judge (via the `grade` Edge Function) and the pure auto-key
// grader produce this exact shape, so a submission's grade is uniform.

import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import type { GradingRubric } from '../types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

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

/** Calls the server-side `grade` function (LLM-as-judge) for an anchor-scored verdict. */
export async function requestLlmGrade(input: {
  rubric: GradingRubric;
  submission: GradeSubmission;
}): Promise<GradeResult> {
  if (!isSupabaseConfigured || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase is not configured.');
  }
  let accessToken = SUPABASE_ANON_KEY;
  try {
    const { data } = await getSupabaseClient().auth.getSession();
    if (data.session?.access_token) accessToken = data.session.access_token;
  } catch {
    // No session — anon fallback (the function will 401 if not a real user).
  }
  const res = await fetch(`${SUPABASE_URL}/functions/v1/grade`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      if (j?.error) detail = j.error;
    } catch {
      // keep status text
    }
    throw new Error(detail || `Grading failed (${res.status}).`);
  }
  const json = (await res.json()) as { perAnchor: AnchorScore[]; overall: number; maxOverall: number };
  return { ...json, grader: 'llm' };
}

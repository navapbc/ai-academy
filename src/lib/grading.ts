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

/** One labelled block of work the judge reads (P4.3b). */
export interface GradeSection {
  label: string;
  text: string;
}

export interface GradeSubmission {
  brief: string;
  /** Ordered labelled sections — e.g. [prompt, response] (2.1) or [artifact, critique]. */
  sections: GradeSection[];
}

/**
 * Narrows an untrusted `grade` response body to a verdict. A 200 that isn't the
 * shape we expect (a proxy/CDN interposing a page, a partially-deployed
 * function) must fail here: the verdict is persisted verbatim into
 * `lab_submissions.rubric_scores` and rendered by `GradeResultCard`, which maps
 * over `perAnchor` — so an unchecked body means bad data in the DB and a crashed
 * result card instead of the retryable failure note.
 */
function isVerdict(v: unknown): v is { perAnchor: AnchorScore[]; overall: number; maxOverall: number } {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as { perAnchor?: unknown; overall?: unknown; maxOverall?: unknown };
  if (typeof o.overall !== 'number' || typeof o.maxOverall !== 'number') return false;
  if (!Array.isArray(o.perAnchor)) return false;
  return o.perAnchor.every((a) => {
    const x = a as Record<string, unknown>;
    return (
      !!x &&
      typeof x.id === 'string' &&
      typeof x.label === 'string' &&
      typeof x.score === 'number' &&
      typeof x.max === 'number' &&
      typeof x.rationale === 'string'
    );
  });
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
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error('The grader returned an unreadable response. Please try again.');
  }
  if (!isVerdict(json)) {
    throw new Error('The grader returned an unexpected response. Please try again.');
  }
  return { perAnchor: json.perAnchor, overall: json.overall, maxOverall: json.maxOverall, grader: 'llm' };
}

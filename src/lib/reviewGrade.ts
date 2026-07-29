import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

// Champion grade-action client (P5.5c). The approve/return decision is a write to
// lab_submissions (no client-write RLS), so it goes through the `review-grade`
// service_role Edge Function (authorized to admin or champion-of the submission's
// learner). The client only carries the user's session token; the service_role key
// stays server-side. Mirrors adminCohorts.invokeAdminCohorts.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export type ReviewDecision = 'reviewed' | 'returned';

export interface ReviewDecisionInput {
  submissionId: string;
  decision: ReviewDecision;
  note?: string;
}

/** POSTs a review decision to the review-grade function; throws Error(body.error) on failure. */
export async function submitReviewDecision(input: ReviewDecisionInput): Promise<void> {
  if (!isSupabaseConfigured || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase is not configured.');
  }
  // getSession() can reject (e.g. an unreadable/corrupt persisted session). Fall
  // back to the anon key like llm.ts/grading.ts do rather than throwing a raw
  // storage error at the champion — the function itself will 401 if there is no
  // real user behind the token.
  let accessToken = SUPABASE_ANON_KEY;
  try {
    const { data } = await getSupabaseClient().auth.getSession();
    if (data.session?.access_token) accessToken = data.session.access_token;
  } catch {
    // No readable session — anon fallback.
  }

  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/review-grade`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }

  let body: { ok?: boolean; error?: string } = {};
  try {
    body = await res.json();
  } catch {
    // fall through to the status-based error
  }
  if (!res.ok || !body.ok) {
    throw new Error(body.error ?? `Request failed (${res.status}).`);
  }
}

export const approveSubmission = (submissionId: string, note?: string) =>
  submitReviewDecision({ submissionId, decision: 'reviewed', note });
export const returnSubmission = (submissionId: string, note: string) =>
  submitReviewDecision({ submissionId, decision: 'returned', note });

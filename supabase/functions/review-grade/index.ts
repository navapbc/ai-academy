// Supabase Edge Function: `review-grade` (P5.5c)
//
// The sanctioned write path for a champion/admin review decision on a graded lab
// submission. `lab_submissions` has no client-write RLS, so the status transition
// runs as service_role here (key never exposed to the browser). Decision-only model
// (approve → 'reviewed' / return → 'returned' + an optional feedback note); the LLM
// rubric_scores are NOT modified. Authz: admin OR champion-of the submission's
// learner. Authn/CORS/rate-limit mirror admin-cohorts; pure logic in
// ./review-grade-core.ts (unit-tested under vitest).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  buildCorsHeaders,
  emailDomainAllowed,
  fixedWindowAllow,
  isAllowlistedAdmin,
  parseReviewAction,
  type RateLimitState,
} from './review-grade-core.ts';

const ALLOWED_EMAIL_DOMAIN = 'navapbc.com';
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(Deno.env.get('APP_ORIGIN') ? [Deno.env.get('APP_ORIGIN')!] : []),
];

const RATE_LIMIT = 60; // requests
const RATE_WINDOW_MS = 60_000; // per minute (per-isolate, best-effort)
const rateStore = new Map<string, RateLimitState>();

Deno.serve(async (req: Request) => {
  const cors = buildCorsHeaders(req.headers.get('Origin'), ALLOWED_ORIGINS);
  const jsonError = (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...cors, 'content-type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return jsonError('Method not allowed. Use POST.', 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonError('Server is misconfigured (missing Supabase env).', 500);
  }

  // --- Authn: a real signed-in @navapbc.com user (bare anon key 401s) ---
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser();
  const caller = userData?.user;
  if (userErr || !caller) return jsonError('Sign in to use this feature.', 401);
  if (!emailDomainAllowed(caller.email, ALLOWED_EMAIL_DOMAIN)) {
    return jsonError(`Access is restricted to @${ALLOWED_EMAIL_DOMAIN} accounts.`, 403);
  }

  if (!fixedWindowAllow(rateStore, caller.id, Date.now(), RATE_LIMIT, RATE_WINDOW_MS)) {
    return jsonError('Rate limit exceeded. Please slow down and try again shortly.', 429);
  }

  // --- Validate body ---
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonError('Invalid JSON body.', 400);
  }
  const parsed = parseReviewAction(rawBody);
  if (!parsed.ok) return jsonError(parsed.error, 400);
  const { submissionId, decision, note } = parsed.value;

  // service_role client: bypasses the (write-less) RLS on lab_submissions.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- Resolve the submission (need its learner for the champion-of check) ---
  const { data: submission, error: subErr } = await admin
    .from('lab_submissions')
    .select('id, user_id, status')
    .eq('id', submissionId)
    .maybeSingle();
  if (subErr) {
    console.error('Submission lookup failed:', subErr.message);
    return jsonError('Failed to look up the submission.', 500);
  }
  if (!submission) return jsonError('Submission not found.', 404);
  // Only act on a submission that is actually awaiting review (the queue surfaces
  // only these). Guards against a double-action / a second reviewer racing.
  if (submission.status !== 'reviewable') {
    return jsonError('This submission is no longer awaiting review.', 409);
  }

  // --- Authz: admin, OR champion-of the submission's learner ---
  // Replicates public.is_champion_of(user_id): a champion the caller leads a cohort
  // the learner is enrolled in. service_role can't use auth.uid(), so we query it
  // for the caller explicitly.
  let allowed = isAllowlistedAdmin(caller.email, Deno.env.get('BOOTSTRAP_ADMIN_EMAILS'));
  if (!allowed) {
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .maybeSingle();
    if (callerProfile?.role === 'admin') {
      allowed = true;
    } else {
      // champion-of check (two simple reads — no FK-embedding assumptions): the
      // learner has at most one enrollment (enrollments.unique(user_id)); the caller
      // must lead that cohort.
      const { data: enrollment, error: enrErr } = await admin
        .from('enrollments')
        .select('cohort_id')
        .eq('user_id', submission.user_id)
        .maybeSingle();
      if (enrErr) {
        console.error('Enrollment lookup failed:', enrErr.message);
        return jsonError('Failed to authorize the request.', 500);
      }
      if (enrollment?.cohort_id) {
        const { data: champRows, error: champErr } = await admin
          .from('cohort_champions')
          .select('id')
          .eq('user_id', caller.id)
          .eq('cohort_id', enrollment.cohort_id)
          .limit(1);
        if (champErr) {
          console.error('Champion-of check failed:', champErr.message);
          return jsonError('Failed to authorize the request.', 500);
        }
        allowed = (champRows ?? []).length > 0;
      }
    }
  }
  if (!allowed) return jsonError('You are not a reviewer for this submission.', 403);

  // --- Apply the decision (status + note + reviewer + timestamp) ---
  const { error: updErr } = await admin
    .from('lab_submissions')
    .update({
      status: decision,
      review_note: note,
      reviewed_by: caller.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', submissionId);
  if (updErr) {
    console.error('Review update failed:', updErr.message);
    return jsonError('Failed to record the review decision.', 500);
  }

  return new Response(JSON.stringify({ ok: true, decision }), {
    headers: { ...cors, 'content-type': 'application/json' },
  });
});

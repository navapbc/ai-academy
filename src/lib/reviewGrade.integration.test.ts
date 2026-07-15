import { describe, test, expect } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured } from './supabaseClient';

// INTEGRATION test for the P5.5c champion grade-action write boundary against the
// LOCAL Supabase stack. Triple-gated: RUN_DB_TESTS=1 + live stack + service key.
// Proves: (1) the service_role transition the review-grade function uses works
// (status → reviewed/returned + reviewed_by/at/note); (2) an authenticated client
// CANNOT UPDATE lab_submissions (no client write policy); (3) the champion-of
// predicate the function replicates is correct at the DB level (a champion of the
// learner's cohort matches; a champion of a different cohort does not).

const URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined;
const PASSWORD = 'integration-pass-123';

async function detectLiveStack(): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const res = await fetch(`${URL}/rest/v1/`, { headers: { apikey: ANON }, signal: AbortSignal.timeout(2000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

const hasLiveStack = await detectLiveStack();
const RUN = process.env.RUN_DB_TESTS === '1' && hasLiveStack && !!SERVICE;
if (!RUN) {
  console.info('[reviewGrade.integration.test] Skipping. Enable with RUN_DB_TESTS=1 + live stack + SUPABASE_SERVICE_ROLE_KEY.');
}

function anonClient(): SupabaseClient {
  return createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
}
function serviceClient(): SupabaseClient {
  return createClient(URL, SERVICE!, { auth: { persistSession: false, autoRefreshToken: false } });
}
const uniqueEmail = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@navapbc.com`;
const uniqueName = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
async function newUser(): Promise<{ id: string; email: string }> {
  const email = uniqueEmail('rg');
  const signup = await anonClient().auth.signUp({ email, password: PASSWORD });
  expect(signup.error).toBeNull();
  return { id: signup.data.user!.id, email };
}

/**
 * Replicates the function's champion-of authz queries for assertion — U5
 * multi-enrollment aware (review FIX E-2): the learner may hold one enrollment
 * PER COHORT, and the champion matches when they lead ANY of the learner's
 * cohorts (the same champion-of-any-shared-cohort posture as the review-grade
 * function and public.is_champion_of()).
 */
async function championOf(svc: SupabaseClient, championId: string, learnerId: string): Promise<boolean> {
  const { data: enrollRows } = await svc.from('enrollments').select('cohort_id').eq('user_id', learnerId);
  const learnerCohortIds = (enrollRows ?? [])
    .map((r) => r.cohort_id as string | null)
    .filter((id): id is string => !!id);
  if (learnerCohortIds.length === 0) return false;
  const { data } = await svc
    .from('cohort_champions')
    .select('id')
    .eq('user_id', championId)
    .in('cohort_id', learnerCohortIds)
    .limit(1);
  return (data ?? []).length > 0;
}

describe.skipIf(!RUN)('champion grade-action write boundary (P5.5c)', () => {
  test('service_role records the decision; client cannot UPDATE; champion-of scoping holds', async () => {
    const svc = serviceClient();
    const { data: cohortA } = await svc.from('cohorts').insert({ name: uniqueName('rg-A') }).select('id').single();
    const { data: cohortB } = await svc.from('cohorts').insert({ name: uniqueName('rg-B') }).select('id').single();
    const learner = await newUser();
    await svc.from('enrollments').upsert({ user_id: learner.id, cohort_id: cohortA!.id }, { onConflict: 'user_id,cohort_id' });
    const { data: sub } = await svc
      .from('lab_submissions')
      .insert({ user_id: learner.id, lab_id: '2.2', transcript: { kind: 'critique', critique: 'x' }, status: 'reviewable', grader: 'llm' })
      .select('id')
      .single();
    const submissionId = sub!.id as string;

    // (1) service_role transition — the path the function uses.
    const reviewer = await newUser();
    const { error: updErr } = await svc
      .from('lab_submissions')
      .update({ status: 'returned', review_note: 'cite the reg', reviewed_by: reviewer.id, reviewed_at: new Date().toISOString() })
      .eq('id', submissionId);
    expect(updErr).toBeNull();
    const { data: after } = await svc.from('lab_submissions').select('status, review_note, reviewed_by').eq('id', submissionId).single();
    expect(after!.status).toBe('returned');
    expect(after!.review_note).toBe('cite the reg');
    expect(after!.reviewed_by).toBe(reviewer.id);

    // (2) an authenticated client cannot UPDATE lab_submissions (no write policy).
    await svc.from('lab_submissions').update({ status: 'reviewable' }).eq('id', submissionId); // reset
    const champ = await newUser();
    await svc.from('profiles').update({ role: 'champion' }).eq('id', champ.id);
    await svc.from('cohort_champions').upsert({ cohort_id: cohortA!.id, user_id: champ.id }, { onConflict: 'cohort_id,user_id' });
    const champClient = anonClient();
    await champClient.auth.signInWithPassword({ email: champ.email, password: PASSWORD });
    const { data: updRows } = await champClient
      .from('lab_submissions')
      .update({ status: 'reviewed' })
      .eq('id', submissionId)
      .select('id');
    // RLS with no UPDATE policy: the update affects zero rows — never succeeds.
    expect((updRows ?? []).length).toBe(0);
    const { data: stillReviewable } = await svc.from('lab_submissions').select('status').eq('id', submissionId).single();
    expect(stillReviewable!.status).toBe('reviewable'); // unchanged by the client

    // (2b) the OWNER (learner) cannot self-record a review decision — the
    // prevent_owner_review_write trigger blocks it — but CAN still set
    // status='reviewable' + rubric_scores (the saveGrade path stays working).
    const learnerClient = anonClient();
    await learnerClient.auth.signInWithPassword({ email: learner.email, password: PASSWORD });
    const { error: fakeStatus } = await learnerClient
      .from('lab_submissions')
      .update({ status: 'reviewed' })
      .eq('id', submissionId);
    expect(fakeStatus).not.toBeNull(); // trigger: insufficient_privilege
    const { error: fakeReviewer } = await learnerClient
      .from('lab_submissions')
      .update({ reviewed_by: learner.id })
      .eq('id', submissionId);
    expect(fakeReviewer).not.toBeNull();
    const { error: saveGradeOk } = await learnerClient
      .from('lab_submissions')
      .update({ status: 'reviewable', rubric_scores: { grader: 'auto', perAnchor: [], overall: 0, maxOverall: 0 } })
      .eq('id', submissionId);
    expect(saveGradeOk).toBeNull(); // owner grading path unaffected
    const { data: stillReviewable2 } = await svc.from('lab_submissions').select('status').eq('id', submissionId).single();
    expect(stillReviewable2!.status).toBe('reviewable');

    // (3) champion-of scoping (the predicate the function replicates).
    expect(await championOf(svc, champ.id, learner.id)).toBe(true); // champion of A, learner in A
    const champBOnly = await newUser();
    await svc.from('cohort_champions').upsert({ cohort_id: cohortB!.id, user_id: champBOnly.id }, { onConflict: 'cohort_id,user_id' });
    expect(await championOf(svc, champBOnly.id, learner.id)).toBe(false); // champion of B only

    // (3b) U5 dual-enrollment (review FIX E-2): the learner enrolls in cohort B
    // as well. The champion of B ONLY must now be authorized for this learner's
    // submission — the predicate matches on ANY shared cohort, and must not
    // break (or fail-closed) on a learner with multiple enrollment rows.
    await svc
      .from('enrollments')
      .upsert({ user_id: learner.id, cohort_id: cohortB!.id }, { onConflict: 'user_id,cohort_id' });
    expect(await championOf(svc, champBOnly.id, learner.id)).toBe(true); // champion of B, learner in A AND B
    expect(await championOf(svc, champ.id, learner.id)).toBe(true); // champion of A still matches
    const nonChampion = await newUser();
    expect(await championOf(svc, nonChampion.id, learner.id)).toBe(false); // champion of neither

    await svc.from('lab_submissions').delete().eq('id', submissionId);
    await svc.from('cohorts').delete().in('id', [cohortA!.id, cohortB!.id]);
  });
});

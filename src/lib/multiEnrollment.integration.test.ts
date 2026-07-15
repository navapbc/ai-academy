import { describe, test, expect } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured } from './supabaseClient';

// INTEGRATION tests for the cohort-restructure U5 multi-enrollment schema +
// lifecycle (20260715020000_multi_enrollment.sql) against the LOCAL Supabase
// stack. Triple-gated like courseStructure.integration.test.ts: RUN_DB_TESTS=1
// AND a live stack AND SUPABASE_SERVICE_ROLE_KEY. Missing any => SKIP.
// Service-role key: `npx supabase status -o env | grep SERVICE_ROLE_KEY`.
//
// Proves the U5 boundary:
//   • dual enrollment: both rows exist; cohort-scoped unenroll(A) leaves B;
//   • archive touches NEITHER enrollments NOR cohort_champions, never demotes,
//     and champions keep read access to their archived cohort;
//   • has_program_access() stays true when the only enrollment is in an
//     archived cohort (alumni keep program access);
//   • zero-enrollment hard delete still works at the DB level (the
//     with-enrollments 409 guard lives in the admin-cohorts Edge Function and
//     is unit-tested via deleteCohortBlockedReason — the function runtime is
//     not part of this suite);
//   • champion enrollment reads are cohort-ROW-scoped: a champion of cohort A
//     CANNOT see a dual-enrolled learner's cohort-B membership (the U5
//     enumeration fix) but CAN still read that learner's module_progress —
//     the champion-of-any-shared-cohort posture on activity tables is the
//     documented, ACCEPTED posture, asserted here so it is a test, not an
//     accident;
//   • a dual-enrolled learner appears once per cohort in
//     learner_progress_summary (one row per learner × cohort).

const URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined;
const PASSWORD = 'integration-pass-123';

async function detectLiveStack(): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const res = await fetch(`${URL}/rest/v1/`, {
      headers: { apikey: ANON },
      signal: AbortSignal.timeout(2000),
    });
    return res.status < 500;
  } catch {
    return false;
  }
}

const hasLiveStack = await detectLiveStack();
const RUN = process.env.RUN_DB_TESTS === '1' && hasLiveStack && !!SERVICE;

if (!RUN) {
  console.info(
    '[multiEnrollment.integration.test] Skipping. Enable with RUN_DB_TESTS=1, a ' +
      'running local stack (`npx supabase start`), and SUPABASE_SERVICE_ROLE_KEY ' +
      'set (`npx supabase status -o env | grep SERVICE_ROLE_KEY`).',
  );
}

function anonClient(): SupabaseClient {
  return createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
}
function serviceClient(): SupabaseClient {
  return createClient(URL, SERVICE!, { auth: { persistSession: false, autoRefreshToken: false } });
}
const uniqueEmail = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@navapbc.com`;
const uniqueName = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function newUser(role?: 'admin' | 'champion'): Promise<{ client: SupabaseClient; uid: string }> {
  const client = anonClient();
  const { data, error } = await client.auth.signUp({ email: uniqueEmail('u5'), password: PASSWORD });
  expect(error).toBeNull();
  const uid = data.user!.id;
  if (role) {
    const { error: roleErr } = await serviceClient().from('profiles').update({ role }).eq('id', uid);
    expect(roleErr).toBeNull();
  }
  return { client, uid };
}

async function newCohort(svc: SupabaseClient, prefix: string): Promise<string> {
  const { data, error } = await svc
    .from('cohorts')
    .insert({ name: uniqueName(prefix) })
    .select('id')
    .single();
  expect(error).toBeNull();
  return data!.id as string;
}

describe.skipIf(!RUN)('multi-enrollment + cohort lifecycle (U5)', () => {
  test('dual enrollment holds both rows; cohort-scoped unenroll(A) leaves B intact', async () => {
    const svc = serviceClient();
    const cohortA = await newCohort(svc, 'u5-dual-a');
    const cohortB = await newCohort(svc, 'u5-dual-b');
    const learner = await newUser();

    const ins = await svc.from('enrollments').insert([
      { cohort_id: cohortA, user_id: learner.uid },
      { cohort_id: cohortB, user_id: learner.uid },
    ]);
    expect(ins.error).toBeNull();

    const { data: both } = await svc.from('enrollments').select('cohort_id').eq('user_id', learner.uid);
    expect(both).toHaveLength(2);

    // The admin-cohorts unenroll shape: delete scoped to (user_id, cohort_id).
    const del = await svc
      .from('enrollments')
      .delete()
      .eq('user_id', learner.uid)
      .eq('cohort_id', cohortA);
    expect(del.error).toBeNull();

    const { data: after } = await svc.from('enrollments').select('cohort_id').eq('user_id', learner.uid);
    expect(after).toHaveLength(1);
    expect(after![0].cohort_id).toBe(cohortB);

    // …and the learner still has program access through the surviving row.
    const { data: access } = await learner.client.rpc('has_program_access');
    expect(access).toBe(true);
  });

  test('archive preserves enrollments + champion rows, never demotes, and champions keep read access', async () => {
    const svc = serviceClient();
    const cohort = await newCohort(svc, 'u5-archive');
    const learner = await newUser();
    const champ = await newUser('champion');

    expect((await svc.from('enrollments').insert({ cohort_id: cohort, user_id: learner.uid })).error).toBeNull();
    expect(
      (await svc.from('cohort_champions').insert({ cohort_id: cohort, user_id: champ.uid })).error,
    ).toBeNull();

    // Archive = the admin-cohorts action's write shape (stamp archived_at once).
    const arch = await svc
      .from('cohorts')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', cohort)
      .is('archived_at', null);
    expect(arch.error).toBeNull();

    // Enrollments and champion assignments survive untouched.
    const { data: enr } = await svc.from('enrollments').select('id').eq('cohort_id', cohort);
    expect(enr).toHaveLength(1);
    const { data: champs } = await svc.from('cohort_champions').select('id').eq('cohort_id', cohort);
    expect(champs).toHaveLength(1);

    // Archive never demotes — the champion role is untouched (only explicit
    // unassign runs roleAfterUnassign).
    const { data: prof } = await svc.from('profiles').select('role').eq('id', champ.uid).single();
    expect(prof!.role).toBe('champion');

    // The champion still READS the archived cohort's enrollment rows (the
    // cohort-row-scoped policy keys on the surviving cohort_champions row).
    const champRead = await champ.client
      .from('enrollments')
      .select('user_id, cohort_id')
      .eq('cohort_id', cohort);
    expect(champRead.error).toBeNull();
    expect(champRead.data?.some((r) => r.user_id === learner.uid)).toBe(true);

    // has_program_access() counts the archived cohort's enrollment: the
    // learner's ONLY enrollment is in an archived cohort and access holds.
    const { data: access } = await learner.client.rpc('has_program_access');
    expect(access).toBe(true);
  });

  test('zero-enrollment hard delete works and cascades champion rows (guard for >0 lives in the Edge Function)', async () => {
    const svc = serviceClient();
    const cohort = await newCohort(svc, 'u5-delete');
    const champ = await newUser('champion');
    expect(
      (await svc.from('cohort_champions').insert({ cohort_id: cohort, user_id: champ.uid })).error,
    ).toBeNull();

    // The function's guard input: the enrollment count for this cohort is 0.
    const { count } = await svc
      .from('enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('cohort_id', cohort);
    expect(count ?? 0).toBe(0);

    const del = await svc.from('cohorts').delete().eq('id', cohort);
    expect(del.error).toBeNull();

    // Champion rows cascade with the cohort; the profile role is NOT demoted by
    // deletion (demotion is only the explicit-unassign path).
    const { data: champs } = await svc.from('cohort_champions').select('id').eq('cohort_id', cohort);
    expect(champs).toHaveLength(0);
    const { data: prof } = await svc.from('profiles').select('role').eq('id', champ.uid).single();
    expect(prof!.role).toBe('champion');
  });

  test('champion-of-A cannot read a dual-enrolled learner’s cohort-B enrollment row, but CAN read their module_progress (accepted posture)', async () => {
    const svc = serviceClient();
    const cohortA = await newCohort(svc, 'u5-scope-a');
    const cohortB = await newCohort(svc, 'u5-scope-b');
    const learner = await newUser();
    const champA = await newUser('champion');

    expect(
      (
        await svc.from('enrollments').insert([
          { cohort_id: cohortA, user_id: learner.uid },
          { cohort_id: cohortB, user_id: learner.uid },
        ])
      ).error,
    ).toBeNull();
    expect(
      (await svc.from('cohort_champions').insert({ cohort_id: cohortA, user_id: champA.uid })).error,
    ).toBeNull();

    // A completion for the learner (module_progress.module_id has no FK).
    expect(
      (
        await svc.from('module_progress').insert({
          user_id: learner.uid,
          module_id: '1.1',
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
      ).error,
    ).toBeNull();

    // Enrollment reads are cohort-ROW-scoped: only the shared cohort's row is
    // visible — the learner's OTHER membership cannot be enumerated.
    const enrollRead = await champA.client
      .from('enrollments')
      .select('user_id, cohort_id')
      .eq('user_id', learner.uid);
    expect(enrollRead.error).toBeNull();
    const visibleCohorts = (enrollRead.data ?? []).map((r) => r.cohort_id);
    expect(visibleCohorts).toContain(cohortA);
    expect(visibleCohorts).not.toContain(cohortB);

    // Accepted posture (asserted deliberately): the activity tables keep the
    // champion-of-any-shared-cohort read — progress is NOT cohort-partitioned.
    const progressRead = await champA.client
      .from('module_progress')
      .select('module_id, status')
      .eq('user_id', learner.uid);
    expect(progressRead.error).toBeNull();
    expect(progressRead.data?.some((r) => r.module_id === '1.1' && r.status === 'completed')).toBe(
      true,
    );
  });

  test('a dual-enrolled learner appears once per cohort in learner_progress_summary', async () => {
    const svc = serviceClient();
    const cohortA = await newCohort(svc, 'u5-view-a');
    const cohortB = await newCohort(svc, 'u5-view-b');
    const learner = await newUser();

    expect(
      (
        await svc.from('enrollments').insert([
          { cohort_id: cohortA, user_id: learner.uid },
          { cohort_id: cohortB, user_id: learner.uid },
        ])
      ).error,
    ).toBeNull();

    // security_invoker view as the learner themself: owner RLS on profiles +
    // enrollments yields exactly their own rows — one per cohort.
    const { data: rows, error } = await learner.client
      .from('learner_progress_summary')
      .select('user_id, cohort_id, modules_completed, modules_total')
      .eq('user_id', learner.uid);
    expect(error).toBeNull();
    expect(rows).toHaveLength(2);
    expect(new Set(rows!.map((r) => r.cohort_id))).toEqual(new Set([cohortA, cohortB]));
    // Per-learner metrics are user-scoped: identical on both cohort rows.
    expect(rows![0].modules_completed).toBe(rows![1].modules_completed);
    expect(rows![0].modules_total).toBe(rows![1].modules_total);
  });
});

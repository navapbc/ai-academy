import { describe, test, expect } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured } from './supabaseClient';

// INTEGRATION test for the P5.2a aggregation views and the enrollments
// champion/admin read policy, against the LOCAL Supabase stack. Triple-gated:
// RUN_DB_TESTS=1 AND a live stack AND SUPABASE_SERVICE_ROLE_KEY. Missing any => SKIP,
// so plain `npm run test` stays green. Service-role key:
// `npx supabase status -o env | grep SERVICE_ROLE_KEY`.
//
// Proves the dashboard aggregation inherits the P5.1c boundary:
//   • a champion sees ONLY their cohort across all three views (the scoping test);
//   • an admin sees all cohorts in the rollups;
//   • a plain learner sees only their own row (no leak through the aggregates);
//   • the new enrollments policy: champion reads in-cohort, not cross-cohort; admin all;
//   • correctness: completion_pct and glat_pass_rate compute on known seeded data.
// Setup uses the service_role path (the W2-2 trigger permits service_role role
// changes), mirroring championAdminRls.integration.test.ts.

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
    '[dashboardAggregation.integration.test] Skipping. Enable with RUN_DB_TESTS=1, a ' +
      'running local stack (`npx supabase start`), and SUPABASE_SERVICE_ROLE_KEY set ' +
      '(`npx supabase status -o env | grep SERVICE_ROLE_KEY`).',
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

async function newUser(prefix: string): Promise<{ client: SupabaseClient; uid: string }> {
  const client = anonClient();
  const { data, error } = await client.auth.signUp({ email: uniqueEmail(prefix), password: PASSWORD });
  expect(error).toBeNull();
  return { client, uid: data.user!.id };
}

// service_role: create a cohort, enroll the learner, assign the champion.
async function makeCohortWith(
  svc: SupabaseClient,
  name: string,
  learnerId: string,
  championId: string,
): Promise<string> {
  const { data: cohort, error } = await svc.from('cohorts').insert({ name }).select('id').single();
  expect(error).toBeNull();
  const cohortId = cohort!.id as string;
  expect((await svc.from('enrollments').insert({ cohort_id: cohortId, user_id: learnerId })).error).toBeNull();
  expect((await svc.from('cohort_champions').insert({ cohort_id: cohortId, user_id: championId })).error).toBeNull();
  return cohortId;
}

// Seed a known, fully-controlled activity fixture for `uid` via service_role.
//  - one completed module on a published cell ('1.4') and one quiz attempt on it
//  - `glatPass`: optionally a passing GLAT (2.14) attempt
//  - one reviewable lab submission
async function seedKnownActivity(
  svc: SupabaseClient,
  uid: string,
  opts: { quizPct: number; glatPass: boolean },
): Promise<void> {
  expect(
    (
      await svc.from('module_progress').upsert(
        { user_id: uid, module_id: '1.4', status: 'completed', completed_at: new Date().toISOString() },
        { onConflict: 'user_id,module_id' },
      )
    ).error,
  ).toBeNull();
  const max = 10;
  expect(
    (
      await svc.from('quiz_attempts').insert({
        user_id: uid,
        module_id: '1.4',
        score: Math.round(opts.quizPct * max),
        max_score: max,
        passed: opts.quizPct >= 0.6,
      })
    ).error,
  ).toBeNull();
  if (opts.glatPass) {
    expect(
      (
        await svc
          .from('quiz_attempts')
          .insert({ user_id: uid, module_id: '2.14', score: 18, max_score: 20, passed: true })
      ).error,
    ).toBeNull();
  }
  expect(
    (await svc.from('lab_submissions').insert({ user_id: uid, lab_id: '2.1', status: 'reviewable' })).error,
  ).toBeNull();
}

describe.skipIf(!RUN)('P5.2a aggregation views inherit the P5.1c boundary', () => {
  test('champion of cohort A sees A but NOT cohort B across all three views', async () => {
    const svc = serviceClient();
    const learnerA = await newUser('p52a-A-learner');
    const champA = await newUser('p52a-A-champ');
    const learnerB = await newUser('p52a-B-learner');
    const champB = await newUser('p52a-B-champ');
    await seedKnownActivity(svc, learnerA.uid, { quizPct: 0.9, glatPass: true });
    await seedKnownActivity(svc, learnerB.uid, { quizPct: 0.5, glatPass: false });
    const cohortA = await makeCohortWith(svc, 'P52a Cohort A', learnerA.uid, champA.uid);
    const cohortB = await makeCohortWith(svc, 'P52a Cohort B', learnerB.uid, champB.uid);
    expect((await svc.from('profiles').update({ role: 'champion' }).eq('id', champA.uid)).error).toBeNull();

    // learner_progress_summary: champA sees learnerA, not learnerB.
    const lps = await champA.client
      .from('learner_progress_summary')
      .select('user_id, cohort_id, glat_passed');
    expect(lps.error).toBeNull();
    const ids = (lps.data ?? []).map((r) => r.user_id);
    expect(ids).toContain(learnerA.uid);
    expect(ids).not.toContain(learnerB.uid);

    // cohort_progress_summary: champA sees cohort A's row, not cohort B's.
    const cps = await champA.client.from('cohort_progress_summary').select('cohort_id, learner_count');
    expect(cps.error).toBeNull();
    const cohorts = (cps.data ?? []).map((r) => r.cohort_id);
    expect(cohorts).toContain(cohortA);
    expect(cohorts).not.toContain(cohortB);

    // cohort_score_distribution: same scoping.
    const csd = await champA.client.from('cohort_score_distribution').select('cohort_id, band, learner_count');
    expect(csd.error).toBeNull();
    const distCohorts = (csd.data ?? []).map((r) => r.cohort_id);
    expect(distCohorts).toContain(cohortA);
    expect(distCohorts).not.toContain(cohortB);
  });

  test('an admin sees all cohorts in the rollup', async () => {
    const svc = serviceClient();
    const learnerA = await newUser('p52a-adm-A');
    const learnerB = await newUser('p52a-adm-B');
    const admin = await newUser('p52a-adm');
    await seedKnownActivity(svc, learnerA.uid, { quizPct: 0.9, glatPass: true });
    await seedKnownActivity(svc, learnerB.uid, { quizPct: 0.7, glatPass: false });
    const cohortA = await makeCohortWith(svc, 'P52a Admin A', learnerA.uid, admin.uid);
    const cohortB = await makeCohortWith(svc, 'P52a Admin B', learnerB.uid, admin.uid);
    expect((await svc.from('profiles').update({ role: 'admin' }).eq('id', admin.uid)).error).toBeNull();

    const cps = await admin.client
      .from('cohort_progress_summary')
      .select('cohort_id, learner_count')
      .in('cohort_id', [cohortA, cohortB]);
    expect(cps.error).toBeNull();
    const cohorts = (cps.data ?? []).map((r) => r.cohort_id);
    expect(cohorts).toContain(cohortA);
    expect(cohorts).toContain(cohortB);
  });

  test('a plain learner sees only their own row (no leak through the aggregates)', async () => {
    const svc = serviceClient();
    const a = await newUser('p52a-reg-a');
    const b = await newUser('p52a-reg-b');
    await seedKnownActivity(svc, a.uid, { quizPct: 0.9, glatPass: true });
    await seedKnownActivity(svc, b.uid, { quizPct: 0.9, glatPass: true });

    const lps = await b.client.from('learner_progress_summary').select('user_id');
    expect(lps.error).toBeNull();
    const ids = (lps.data ?? []).map((r) => r.user_id);
    expect(ids).toContain(b.uid);
    expect(ids).not.toContain(a.uid);
  });

  // Admin enrollment-reads are proven transitively by the admin rollup test above
  // (cohort_progress_summary left joins enrollments under the admin's RLS).
  test('enrollments read policy: champion reads in-cohort, not cross-cohort', async () => {
    const svc = serviceClient();
    const learnerA = await newUser('p52a-enr-A');
    const champA = await newUser('p52a-enr-champA');
    const learnerB = await newUser('p52a-enr-B');
    const champB = await newUser('p52a-enr-champB');
    await makeCohortWith(svc, 'P52a Enr A', learnerA.uid, champA.uid);
    await makeCohortWith(svc, 'P52a Enr B', learnerB.uid, champB.uid);
    expect((await svc.from('profiles').update({ role: 'champion' }).eq('id', champA.uid)).error).toBeNull();

    // champA reads learnerA's enrollment, NOT learnerB's.
    const eA = await champA.client.from('enrollments').select('user_id').eq('user_id', learnerA.uid);
    expect(eA.error).toBeNull();
    expect(eA.data?.length).toBe(1);
    const eB = await champA.client.from('enrollments').select('user_id').eq('user_id', learnerB.uid);
    expect(eB.error).toBeNull();
    expect(eB.data?.length).toBe(0);
  });

  test('correctness: completion_pct and glat_pass_rate compute on known data', async () => {
    const svc = serviceClient();
    const learner = await newUser('p52a-calc-learner');
    const admin = await newUser('p52a-calc-admin');
    await seedKnownActivity(svc, learner.uid, { quizPct: 0.9, glatPass: true });
    const cohort = await makeCohortWith(svc, 'P52a Calc', learner.uid, admin.uid);
    expect((await svc.from('profiles').update({ role: 'admin' }).eq('id', admin.uid)).error).toBeNull();

    // Published-module total (admin reads all rows; same scalar every row).
    // Excludes archived rows, matching published_modules_total() (W1.3).
    const { count: publishedTotal, error: cntErr } = await svc
      .from('modules')
      .select('cell_id', { count: 'exact', head: true })
      .eq('status', 'published')
      .is('archived_at', null);
    expect(cntErr).toBeNull();

    const lps = await admin.client
      .from('learner_progress_summary')
      .select('user_id, modules_completed, modules_total, completion_pct, glat_passed, reviewable_labs')
      .eq('user_id', learner.uid)
      // .single() is safe because enrollments.unique(user_id) => one row per learner.
      .single();
    expect(lps.error).toBeNull();
    expect(lps.data!.modules_total).toBe(publishedTotal);
    expect(lps.data!.modules_completed).toBe(1); // one completed published cell (1.4)
    expect(Number(lps.data!.completion_pct)).toBeCloseTo(1 / (publishedTotal as number), 6);
    expect(lps.data!.glat_passed).toBe(true);
    expect(lps.data!.reviewable_labs).toBe(1);

    // glat_pass_rate for this single-learner cohort = 1.0.
    const cps = await admin.client
      .from('cohort_progress_summary')
      .select('glat_pass_rate, learner_count')
      .eq('cohort_id', cohort)
      .single();
    expect(cps.error).toBeNull();
    expect(cps.data!.learner_count).toBe(1);
    expect(Number(cps.data!.glat_pass_rate)).toBeCloseTo(1.0, 6);
  });
});

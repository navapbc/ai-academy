import { describe, test, expect } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured } from './supabaseClient';

// INTEGRATION test for the P5.2c per-learner drill-down boundary, against the
// LOCAL Supabase stack. Triple-gated: RUN_DB_TESTS=1 AND a live stack AND
// SUPABASE_SERVICE_ROLE_KEY. Missing any => SKIP, so plain `npm run test` stays
// green. Service-role key: `npx supabase status -o env | grep SERVICE_ROLE_KEY`.
//
// fetchLearnerDetail reads the three raw activity tables filtered by user_id; the
// only thing standing between a champion and another cohort's learner detail is
// the P5.1c champion/admin SELECT policy. This proves that boundary directly:
//   • a champion of cohort A reads its own learner's module_progress /
//     quiz_attempts / lab_submissions;
//   • the same champion gets ZERO rows for a cohort-B learner (RLS-filtered, not
//     an error) across all three tables.

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
    '[learnerDetail.integration.test] Skipping. Enable with RUN_DB_TESTS=1, a ' +
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

async function makeCohortWith(
  svc: SupabaseClient,
  name: string,
  learnerId: string,
  championId: string,
): Promise<void> {
  const { data: cohort, error } = await svc.from('cohorts').insert({ name }).select('id').single();
  expect(error).toBeNull();
  const cohortId = cohort!.id as string;
  expect((await svc.from('enrollments').insert({ cohort_id: cohortId, user_id: learnerId })).error).toBeNull();
  expect((await svc.from('cohort_champions').insert({ cohort_id: cohortId, user_id: championId })).error).toBeNull();
}

async function seedActivity(svc: SupabaseClient, uid: string): Promise<void> {
  expect(
    (
      await svc.from('module_progress').upsert(
        { user_id: uid, module_id: '1.4', status: 'completed', completed_at: new Date().toISOString() },
        { onConflict: 'user_id,module_id' },
      )
    ).error,
  ).toBeNull();
  expect(
    (await svc.from('quiz_attempts').insert({ user_id: uid, module_id: '1.4', score: 8, max_score: 10, passed: true }))
      .error,
  ).toBeNull();
  expect(
    (await svc.from('lab_submissions').insert({ user_id: uid, lab_id: '2.1', status: 'reviewable' })).error,
  ).toBeNull();
}

describe.skipIf(!RUN)('P5.2c per-learner detail inherits the P5.1c boundary', () => {
  test('a champion reads its own learner detail but ZERO rows for another cohort', async () => {
    const svc = serviceClient();
    const learnerA = await newUser('p52c-A-learner');
    const champA = await newUser('p52c-A-champ');
    const learnerB = await newUser('p52c-B-learner');
    const champB = await newUser('p52c-B-champ');
    await seedActivity(svc, learnerA.uid);
    await seedActivity(svc, learnerB.uid);
    await makeCohortWith(svc, 'P52c Cohort A', learnerA.uid, champA.uid);
    await makeCohortWith(svc, 'P52c Cohort B', learnerB.uid, champB.uid);
    expect((await svc.from('profiles').update({ role: 'champion' }).eq('id', champA.uid)).error).toBeNull();

    // In-cohort: champA reads learnerA's rows across all three tables.
    for (const table of ['module_progress', 'quiz_attempts', 'lab_submissions']) {
      const res = await champA.client.from(table).select('user_id').eq('user_id', learnerA.uid);
      expect(res.error).toBeNull();
      expect(res.data?.length).toBeGreaterThan(0);
    }

    // Cross-cohort: champA gets zero rows for learnerB (RLS-filtered, no error).
    for (const table of ['module_progress', 'quiz_attempts', 'lab_submissions']) {
      const res = await champA.client.from(table).select('user_id').eq('user_id', learnerB.uid);
      expect(res.error).toBeNull();
      expect(res.data?.length).toBe(0);
    }
  });
});

import { describe, test, expect } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured } from './supabaseClient';

// INTEGRATION test for the P5.1c champion/admin read policies on
// module_progress / quiz_attempts / lab_submissions / profiles, against the
// LOCAL Supabase stack. Triple-gated: RUN_DB_TESTS=1 AND a live stack AND
// SUPABASE_SERVICE_ROLE_KEY. Missing any => SKIP, so plain `npm run test` stays
// green. Service-role key: `npx supabase status -o env | grep SERVICE_ROLE_KEY`.
//
// Proves the security boundary the rest of Phase 5 is gated on:
//   • a champion reads rows of learners IN A COHORT THEY ARE ASSIGNED TO …
//   • … and CANNOT read learners in any other cohort (the scoping test);
//   • an unassigned champion reads nothing beyond their own rows;
//   • an admin reads everything across cohorts;
//   • a plain learner STILL cannot read another learner's rows (regression on
//     the additive policies not loosening owner-only).
// Champion/admin/cohort setup uses the service_role path (the W2-2 trigger
// permits service_role role changes), mirroring adminRole.integration.test.ts.

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
    '[championAdminRls.integration.test] Skipping. Enable with RUN_DB_TESTS=1, a ' +
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

// A signed-in user holding its own session (each needs an independent client).
async function newUser(prefix: string): Promise<{ client: SupabaseClient; uid: string }> {
  const client = anonClient();
  const { data, error } = await client.auth.signUp({ email: uniqueEmail(prefix), password: PASSWORD });
  expect(error).toBeNull();
  return { client, uid: data.user!.id };
}

// Seed one activity row per table for `uid` via service_role (bypasses RLS), so
// the cross-user read assertions have something to (not) find. Tagged with the
// uid so assertions are robust against rows left by other tests pre-reset.
async function seedActivity(svc: SupabaseClient, uid: string, tag: string): Promise<void> {
  const mp = await svc.from('module_progress').upsert(
    { user_id: uid, module_id: `mp-${tag}`, status: 'completed', completed_at: new Date().toISOString() },
    { onConflict: 'user_id,module_id' },
  );
  expect(mp.error).toBeNull();
  const qa = await svc
    .from('quiz_attempts')
    .insert({ user_id: uid, module_id: `q-${tag}`, score: 4, max_score: 4, passed: true, answers: null });
  expect(qa.error).toBeNull();
  const ls = await svc
    .from('lab_submissions')
    .insert({ user_id: uid, lab_id: `lab-${tag}`, transcript: { tag }, status: 'submitted' });
  expect(ls.error).toBeNull();
}

// service_role: create a cohort, enroll `learnerId`, assign `championId`.
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

describe.skipIf(!RUN)('champion/admin read policies (P5.1c)', () => {
  test('a champion reads an in-cohort learner across all four tables', async () => {
    const svc = serviceClient();
    const learner = await newUser('p5c-learner');
    const champ = await newUser('p5c-champ');
    await seedActivity(svc, learner.uid, learner.uid);
    await makeCohortWith(svc, 'Champion Read Cohort', learner.uid, champ.uid);
    // Promote the champion (service_role only — W2-2 trigger blocks the client).
    expect((await svc.from('profiles').update({ role: 'champion' }).eq('id', champ.uid)).error).toBeNull();

    const mp = await champ.client.from('module_progress').select('user_id, module_id').eq('user_id', learner.uid);
    expect(mp.error).toBeNull();
    expect(mp.data?.some((r) => r.module_id === `mp-${learner.uid}`)).toBe(true);

    const qa = await champ.client.from('quiz_attempts').select('user_id, module_id').eq('user_id', learner.uid);
    expect(qa.error).toBeNull();
    expect(qa.data?.some((r) => r.module_id === `q-${learner.uid}`)).toBe(true);

    const ls = await champ.client.from('lab_submissions').select('user_id, lab_id').eq('user_id', learner.uid);
    expect(ls.error).toBeNull();
    expect(ls.data?.some((r) => r.lab_id === `lab-${learner.uid}`)).toBe(true);

    const pr = await champ.client.from('profiles').select('id, role').eq('id', learner.uid);
    expect(pr.error).toBeNull();
    expect(pr.data?.length).toBe(1);
  });

  test('a champion of cohort A CANNOT read a learner in cohort B (scoping)', async () => {
    const svc = serviceClient();
    const learnerA = await newUser('p5c-A-learner');
    const champA = await newUser('p5c-A-champ');
    const learnerB = await newUser('p5c-B-learner');
    const champB = await newUser('p5c-B-champ');
    await seedActivity(svc, learnerB.uid, learnerB.uid);
    await makeCohortWith(svc, 'Cohort A', learnerA.uid, champA.uid);
    await makeCohortWith(svc, 'Cohort B', learnerB.uid, champB.uid);
    expect((await svc.from('profiles').update({ role: 'champion' }).eq('id', champA.uid)).error).toBeNull();

    // champA is scoped to cohort A only — learnerB's rows must be invisible.
    const mp = await champA.client.from('module_progress').select('user_id').eq('user_id', learnerB.uid);
    expect(mp.error).toBeNull();
    expect(mp.data?.length).toBe(0);

    const qa = await champA.client.from('quiz_attempts').select('user_id').eq('user_id', learnerB.uid);
    expect(qa.error).toBeNull();
    expect(qa.data?.length).toBe(0);

    const ls = await champA.client.from('lab_submissions').select('user_id').eq('user_id', learnerB.uid);
    expect(ls.error).toBeNull();
    expect(ls.data?.length).toBe(0);

    const pr = await champA.client.from('profiles').select('id').eq('id', learnerB.uid);
    expect(pr.error).toBeNull();
    expect(pr.data?.length).toBe(0);
  });

  test('a champion with no cohort assignment reads nothing beyond their own rows', async () => {
    const svc = serviceClient();
    const learner = await newUser('p5c-orphan-learner');
    const champ = await newUser('p5c-orphan-champ');
    await seedActivity(svc, learner.uid, learner.uid);
    // champ is given the champion role but is NOT assigned to any cohort.
    expect((await svc.from('profiles').update({ role: 'champion' }).eq('id', champ.uid)).error).toBeNull();

    const mp = await champ.client.from('module_progress').select('user_id').eq('user_id', learner.uid);
    expect(mp.error).toBeNull();
    expect(mp.data?.length).toBe(0);

    const pr = await champ.client.from('profiles').select('id').eq('id', learner.uid);
    expect(pr.error).toBeNull();
    expect(pr.data?.length).toBe(0);
  });

  test('an admin reads activity across cohorts', async () => {
    const svc = serviceClient();
    const learnerA = await newUser('p5c-admin-A');
    const learnerB = await newUser('p5c-admin-B');
    const admin = await newUser('p5c-admin');
    await seedActivity(svc, learnerA.uid, learnerA.uid);
    await seedActivity(svc, learnerB.uid, learnerB.uid);
    await makeCohortWith(svc, 'Admin Cohort A', learnerA.uid, admin.uid /* placeholder champ */);
    await makeCohortWith(svc, 'Admin Cohort B', learnerB.uid, admin.uid);
    expect((await svc.from('profiles').update({ role: 'admin' }).eq('id', admin.uid)).error).toBeNull();

    // Admin sees both learners' rows regardless of cohort membership.
    const mp = await admin.client
      .from('module_progress')
      .select('user_id, module_id')
      .in('user_id', [learnerA.uid, learnerB.uid]);
    expect(mp.error).toBeNull();
    expect(mp.data?.some((r) => r.module_id === `mp-${learnerA.uid}`)).toBe(true);
    expect(mp.data?.some((r) => r.module_id === `mp-${learnerB.uid}`)).toBe(true);

    const pr = await admin.client.from('profiles').select('id').in('id', [learnerA.uid, learnerB.uid]);
    expect(pr.error).toBeNull();
    expect(pr.data?.length).toBe(2);
  });

  test('regression: a plain learner still cannot read another learner across any table', async () => {
    const svc = serviceClient();
    const a = await newUser('p5c-reg-a');
    const b = await newUser('p5c-reg-b');
    await seedActivity(svc, a.uid, a.uid);

    const mp = await b.client.from('module_progress').select('user_id').eq('user_id', a.uid);
    expect(mp.error).toBeNull();
    expect(mp.data?.length).toBe(0);

    const qa = await b.client.from('quiz_attempts').select('user_id').eq('user_id', a.uid);
    expect(qa.error).toBeNull();
    expect(qa.data?.length).toBe(0);

    const ls = await b.client.from('lab_submissions').select('user_id').eq('user_id', a.uid);
    expect(ls.error).toBeNull();
    expect(ls.data?.length).toBe(0);

    const pr = await b.client.from('profiles').select('id').eq('id', a.uid);
    expect(pr.error).toBeNull();
    expect(pr.data?.length).toBe(0);
  });
});

import { describe, test, expect } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured } from './supabaseClient';

// INTEGRATION test for the P5.1b cohort substrate (cohorts / enrollments /
// cohort_champions) against the LOCAL Supabase stack. Triple-gated:
// RUN_DB_TESTS=1 AND a live stack AND SUPABASE_SERVICE_ROLE_KEY. Missing any =>
// SKIP, so plain `npm run test` stays green. Service-role key:
// `npx supabase status -o env | grep SERVICE_ROLE_KEY`.
//
// Proves the baseline RLS: cohorts readable by any authed user; enrollments /
// cohort_champions owner-read-own; clients cannot write any of the three; the
// service_role path (the future admin write path) can; and one-enrollment-per-
// (learner, cohort) is DB-enforced (U5 multi-enrollment — a learner may join
// several cohorts, once each). Admin/champion cross-user reads are P5.1c (not
// tested here); the U5 lifecycle/scoping suite is multiEnrollment.integration.

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
    '[cohorts.integration.test] Skipping. Enable with RUN_DB_TESTS=1, a running ' +
      'local stack (`npx supabase start`), and SUPABASE_SERVICE_ROLE_KEY set ' +
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

async function newUser(): Promise<{ client: SupabaseClient; uid: string }> {
  const client = anonClient();
  const { data, error } = await client.auth.signUp({ email: uniqueEmail('cohort'), password: PASSWORD });
  expect(error).toBeNull();
  return { client, uid: data.user!.id };
}

describe.skipIf(!RUN)('cohort substrate RLS (P5.1b)', () => {
  test('a learner reads their own enrollment; another user cannot', async () => {
    const svc = serviceClient();
    const { data: cohort, error: cErr } = await svc
      .from('cohorts')
      .insert({ name: 'Test Cohort A' })
      .select('id')
      .single();
    expect(cErr).toBeNull();
    const cohortId = cohort!.id as string;

    const a = await newUser();
    const { error: enrErr } = await svc
      .from('enrollments')
      .insert({ cohort_id: cohortId, user_id: a.uid });
    expect(enrErr).toBeNull();

    // Owner sees their own enrollment.
    const ownRead = await a.client.from('enrollments').select('cohort_id, user_id');
    expect(ownRead.error).toBeNull();
    expect(ownRead.data?.some((r) => r.user_id === a.uid && r.cohort_id === cohortId)).toBe(true);

    // A different user cannot see A's enrollment (owner RLS).
    const b = await newUser();
    const bRead = await b.client.from('enrollments').select('user_id');
    expect(bRead.error).toBeNull();
    expect(bRead.data?.some((r) => r.user_id === a.uid)).toBe(false);
  });

  test('cohorts are readable by any authenticated user', async () => {
    const svc = serviceClient();
    const { data: cohort } = await svc
      .from('cohorts')
      .insert({ name: 'Readable Cohort' })
      .select('id')
      .single();
    const reader = await newUser();
    const { data, error } = await reader.client.from('cohorts').select('id, name').eq('id', cohort!.id);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
    expect(data?.[0].name).toBe('Readable Cohort');
  });

  test('authenticated clients cannot write any cohort table', async () => {
    const svc = serviceClient();
    const { data: cohort } = await svc
      .from('cohorts')
      .insert({ name: 'NoWrite Cohort' })
      .select('id')
      .single();
    const cohortId = cohort!.id as string;
    const u = await newUser();

    const insCohort = await u.client.from('cohorts').insert({ name: 'hacker cohort' });
    expect(insCohort.error).toBeTruthy();

    const insEnroll = await u.client.from('enrollments').insert({ cohort_id: cohortId, user_id: u.uid });
    expect(insEnroll.error).toBeTruthy();

    const insChampion = await u.client.from('cohort_champions').insert({ cohort_id: cohortId, user_id: u.uid });
    expect(insChampion.error).toBeTruthy();
  });

  test('service_role can create a cohort, enroll a learner, and assign a champion', async () => {
    const svc = serviceClient();
    const { data: cohort, error: cErr } = await svc
      .from('cohorts')
      .insert({ name: 'Full Cohort' })
      .select('id')
      .single();
    expect(cErr).toBeNull();
    const cohortId = cohort!.id as string;

    const learner = await newUser();
    const champ = await newUser();

    const enr = await svc.from('enrollments').insert({ cohort_id: cohortId, user_id: learner.uid });
    expect(enr.error).toBeNull();

    const asg = await svc.from('cohort_champions').insert({ cohort_id: cohortId, user_id: champ.uid });
    expect(asg.error).toBeNull();

    // The champion can read their own assignment (owner read).
    const champRead = await champ.client
      .from('cohort_champions')
      .select('cohort_id')
      .eq('user_id', champ.uid);
    expect(champRead.error).toBeNull();
    expect(champRead.data?.some((r) => r.cohort_id === cohortId)).toBe(true);

    // A different user cannot see the champion's assignment (owner RLS) —
    // symmetric to the enrollment isolation above.
    const outsider = await newUser();
    const outsiderRead = await outsider.client.from('cohort_champions').select('user_id');
    expect(outsiderRead.error).toBeNull();
    expect(outsiderRead.data?.some((r) => r.user_id === champ.uid)).toBe(false);
  });

  test('a learner holds one enrollment PER COHORT (unique(user_id, cohort_id), U5)', async () => {
    const svc = serviceClient();
    const c1 = await svc.from('cohorts').insert({ name: 'Cohort One' }).select('id').single();
    const c2 = await svc.from('cohorts').insert({ name: 'Cohort Two' }).select('id').single();
    const learner = await newUser();

    const first = await svc.from('enrollments').insert({ cohort_id: c1.data!.id, user_id: learner.uid });
    expect(first.error).toBeNull();

    // A second cohort is a second row (multi-enrollment).
    const second = await svc.from('enrollments').insert({ cohort_id: c2.data!.id, user_id: learner.uid });
    expect(second.error).toBeNull();

    // …but the same (user, cohort) pair cannot be enrolled twice.
    const dup = await svc.from('enrollments').insert({ cohort_id: c1.data!.id, user_id: learner.uid });
    expect(dup.error).toBeTruthy(); // unique(user_id, cohort_id) violation

    const { data: rows } = await svc.from('enrollments').select('cohort_id').eq('user_id', learner.uid);
    expect(rows).toHaveLength(2);
  });
});

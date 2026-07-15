import { describe, test, expect } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured } from './supabaseClient';

// INTEGRATION test for the P5.5a cohort-management write/read boundary against the
// LOCAL Supabase stack. Triple-gated: RUN_DB_TESTS=1 AND a live stack AND a
// service_role key (SUPABASE_SERVICE_ROLE_KEY). Missing any => SKIP, so plain
// `npm run test` and the fast build CI job stay green.
//
// Proves: (1) the service_role path the admin-cohorts function uses actually writes
// cohorts/enrollments/cohort_champions (incl. the U5 multi-enrollment upsert on
// (user_id, cohort_id) — enrolling into a second cohort ADDS a row); (2) an
// authenticated client write is BLOCKED by RLS (no write policy); (3) the admin
// read on cohort_champions works while a plain learner cannot read others'
// assignments. The archive/delete lifecycle + champion scoping live in
// multiEnrollment.integration.test.ts.

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
    '[adminCohorts.integration.test] Skipping. Enable with RUN_DB_TESTS=1, a running ' +
      'local stack (`npx supabase start`), and SUPABASE_SERVICE_ROLE_KEY set.',
  );
}

function anonClient(): SupabaseClient {
  return createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
}
function serviceClient(): SupabaseClient {
  return createClient(URL, SERVICE!, { auth: { persistSession: false, autoRefreshToken: false } });
}
const uniqueEmail = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@navapbc.com`;
const uniqueName = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function newUser(role?: 'admin' | 'champion'): Promise<string> {
  const c = anonClient();
  const signup = await c.auth.signUp({ email: uniqueEmail('u'), password: PASSWORD });
  expect(signup.error).toBeNull();
  const id = signup.data.user!.id;
  if (role) {
    const { error } = await serviceClient().from('profiles').update({ role }).eq('id', id);
    expect(error).toBeNull();
  }
  return id;
}

async function authedClientFor(email: string): Promise<SupabaseClient> {
  const c = anonClient();
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  expect(error).toBeNull();
  return c;
}

describe.skipIf(!RUN)('cohort management write/read boundary (P5.5a)', () => {
  test('service_role writes cohorts/enrollments/champions (multi-enrollment upsert, U5)', async () => {
    const svc = serviceClient();

    const { data: c1, error: e1 } = await svc
      .from('cohorts')
      .insert({ name: uniqueName('cohort-a') })
      .select('id')
      .single();
    expect(e1).toBeNull();
    const cohortA = c1!.id as string;

    const { data: c2 } = await svc
      .from('cohorts')
      .insert({ name: uniqueName('cohort-b') })
      .select('id')
      .single();
    const cohortB = c2!.id as string;

    const learner = await newUser();
    const champ = await newUser('champion');

    // Enroll into A, then into B — the (user_id, cohort_id) upsert ADDS a row
    // (U5 multi-enrollment: no reassignment semantics), and re-enrolling into
    // the same cohort is an idempotent no-op.
    const { error: enrollErr } = await svc
      .from('enrollments')
      .upsert({ user_id: learner, cohort_id: cohortA }, { onConflict: 'user_id,cohort_id' });
    expect(enrollErr).toBeNull();
    const { error: secondErr } = await svc
      .from('enrollments')
      .upsert({ user_id: learner, cohort_id: cohortB }, { onConflict: 'user_id,cohort_id' });
    expect(secondErr).toBeNull();
    const { error: rerunErr } = await svc
      .from('enrollments')
      .upsert({ user_id: learner, cohort_id: cohortA }, { onConflict: 'user_id,cohort_id' });
    expect(rerunErr).toBeNull();

    const { data: rows } = await svc.from('enrollments').select('cohort_id').eq('user_id', learner);
    expect(rows).toHaveLength(2);
    expect(new Set(rows!.map((r) => r.cohort_id))).toEqual(new Set([cohortA, cohortB]));

    const { error: champErr } = await svc
      .from('cohort_champions')
      .upsert({ cohort_id: cohortA, user_id: champ }, { onConflict: 'cohort_id,user_id' });
    expect(champErr).toBeNull();

    // cleanup (cascades enrollments + champions)
    await svc.from('cohorts').delete().in('id', [cohortA, cohortB]);
  });

  test('an authenticated client CANNOT write the cohort tables (RLS has no write policy)', async () => {
    const learnerEmail = uniqueEmail('writer');
    const c = anonClient();
    const signup = await c.auth.signUp({ email: learnerEmail, password: PASSWORD });
    expect(signup.error).toBeNull();
    const authed = await authedClientFor(learnerEmail);

    const { error: cohortErr } = await authed.from('cohorts').insert({ name: uniqueName('nope') });
    expect(cohortErr).not.toBeNull(); // RLS denies (no INSERT policy)

    const { error: enrollErr } = await authed
      .from('enrollments')
      .insert({ user_id: signup.data.user!.id, cohort_id: '00000000-0000-0000-0000-0000000000c0' });
    expect(enrollErr).not.toBeNull();
  });

  test('admin can read cohort_champions; a plain learner cannot read others’ assignments', async () => {
    const svc = serviceClient();
    const { data: cohort } = await svc
      .from('cohorts')
      .insert({ name: uniqueName('cohort-read') })
      .select('id')
      .single();
    const cohortId = cohort!.id as string;
    const champ = await newUser('champion');
    await svc
      .from('cohort_champions')
      .upsert({ cohort_id: cohortId, user_id: champ }, { onConflict: 'cohort_id,user_id' });

    // Admin sees the assignment (new is_admin() read policy).
    const adminEmail = uniqueEmail('admin');
    await anonClient().auth.signUp({ email: adminEmail, password: PASSWORD });
    const adminId = (await serviceClient().from('profiles').select('id').eq('email', adminEmail).single())
      .data!.id as string;
    await svc.from('profiles').update({ role: 'admin' }).eq('id', adminId);
    const adminClient = await authedClientFor(adminEmail);
    const { data: adminRows, error: adminErr } = await adminClient
      .from('cohort_champions')
      .select('cohort_id, user_id')
      .eq('cohort_id', cohortId);
    expect(adminErr).toBeNull();
    expect(adminRows).toHaveLength(1);

    // A plain learner cannot read someone else's assignment (owner-only + not admin).
    const learnerEmail = uniqueEmail('plain');
    await anonClient().auth.signUp({ email: learnerEmail, password: PASSWORD });
    const learnerClient = await authedClientFor(learnerEmail);
    const { data: learnerRows } = await learnerClient
      .from('cohort_champions')
      .select('cohort_id, user_id')
      .eq('cohort_id', cohortId);
    expect(learnerRows ?? []).toHaveLength(0);

    await svc.from('cohorts').delete().eq('id', cohortId);
  });
});

import { describe, test, expect } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured } from './supabaseClient';

// INTEGRATION test for the P5.5b review-queue read boundary against the LOCAL
// Supabase stack. Triple-gated: RUN_DB_TESTS=1 AND a live stack AND a service_role
// key. Proves the reviewable-submissions read (the queue) is cohort-scoped by the
// P5.1c RLS: a champion sees only their cohort's reviewable submissions, an admin
// sees all. Mirrors championAdminRls.integration.test.ts.

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
  console.info('[reviewQueue.integration.test] Skipping. Enable with RUN_DB_TESTS=1 + live stack + SUPABASE_SERVICE_ROLE_KEY.');
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
  const email = uniqueEmail('rq');
  const c = anonClient();
  const signup = await c.auth.signUp({ email, password: PASSWORD });
  expect(signup.error).toBeNull();
  return { id: signup.data.user!.id, email };
}
async function authed(email: string): Promise<SupabaseClient> {
  const c = anonClient();
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  expect(error).toBeNull();
  return c;
}

describe.skipIf(!RUN)('review queue read boundary (P5.5b)', () => {
  test('a champion sees only their cohort’s reviewable submissions; admin sees all', async () => {
    const svc = serviceClient();

    // Two cohorts, a learner in each, a reviewable submission for each learner.
    const { data: cohortA } = await svc.from('cohorts').insert({ name: uniqueName('rq-A') }).select('id').single();
    const { data: cohortB } = await svc.from('cohorts').insert({ name: uniqueName('rq-B') }).select('id').single();
    const learnerA = await newUser();
    const learnerB = await newUser();
    await svc.from('enrollments').upsert({ user_id: learnerA.id, cohort_id: cohortA!.id }, { onConflict: 'user_id,cohort_id' });
    await svc.from('enrollments').upsert({ user_id: learnerB.id, cohort_id: cohortB!.id }, { onConflict: 'user_id,cohort_id' });
    await svc.from('lab_submissions').insert([
      { user_id: learnerA.id, lab_id: '2.2', transcript: { kind: 'critique', critique: 'A' }, status: 'reviewable', grader: 'llm' },
      { user_id: learnerB.id, lab_id: '2.2', transcript: { kind: 'critique', critique: 'B' }, status: 'reviewable', grader: 'llm' },
    ]);

    // Champion of cohort A only.
    const champ = await newUser();
    await svc.from('profiles').update({ role: 'champion' }).eq('id', champ.id);
    await svc.from('cohort_champions').upsert({ cohort_id: cohortA!.id, user_id: champ.id }, { onConflict: 'cohort_id,user_id' });

    const champClient = await authed(champ.email);
    const { data: champRows, error: champErr } = await champClient
      .from('lab_submissions')
      .select('user_id, status')
      .eq('status', 'reviewable');
    expect(champErr).toBeNull();
    const champUserIds = (champRows ?? []).map((r) => r.user_id);
    expect(champUserIds).toContain(learnerA.id); // own cohort
    expect(champUserIds).not.toContain(learnerB.id); // other cohort — RLS-filtered

    // Admin sees both.
    const admin = await newUser();
    await svc.from('profiles').update({ role: 'admin' }).eq('id', admin.id);
    const adminClient = await authed(admin.email);
    const { data: adminRows } = await adminClient
      .from('lab_submissions')
      .select('user_id')
      .eq('status', 'reviewable')
      .in('user_id', [learnerA.id, learnerB.id]);
    const adminUserIds = (adminRows ?? []).map((r) => r.user_id);
    expect(adminUserIds).toContain(learnerA.id);
    expect(adminUserIds).toContain(learnerB.id);

    // cleanup (cascades enrollments/champions; submissions cascade on user delete only,
    // so delete them explicitly first).
    await svc.from('lab_submissions').delete().in('user_id', [learnerA.id, learnerB.id]);
    await svc.from('cohorts').delete().in('id', [cohortA!.id, cohortB!.id]);
  });
});

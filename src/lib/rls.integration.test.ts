import { describe, test, expect } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured } from './supabaseClient';

// INTEGRATION tests for RLS isolation and the auth triggers, against the LOCAL
// Supabase stack. These CREATE auth users and mutate auth state, so they are
// double-gated: they run ONLY when RUN_DB_TESTS=1 AND a live stack is reachable.
// Without the flag (CI and normal `npm run test`) they SKIP — keeping the suite
// green everywhere. They assume a resettable local DB (`supabase db reset`);
// the user tables have no DELETE policy, so created rows accumulate until reset.
//
// Local email confirmations are off (config.toml enable_confirmations = false),
// so signUp returns a usable session immediately.

const URL = import.meta.env.VITE_SUPABASE_URL as string;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const PASSWORD = 'integration-pass-123';

async function detectLiveStack(): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const res = await fetch(`${URL}/rest/v1/`, {
      headers: { apikey: KEY },
      signal: AbortSignal.timeout(2000),
    });
    return res.status < 500;
  } catch {
    return false;
  }
}

const hasLiveStack = await detectLiveStack();
const RUN = process.env.RUN_DB_TESTS === '1' && hasLiveStack;

if (!RUN) {
  console.info(
    '[rls.integration.test] Skipping RLS/trigger integration tests. Enable with ' +
      'RUN_DB_TESTS=1 and a running local stack (`npx supabase start`).',
  );
}

// Independent clients so each can hold its own session (the app singleton can't).
function freshClient(): SupabaseClient {
  return createClient(URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const uniqueEmail = (prefix: string, domain: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@${domain}`;

describe.skipIf(!RUN)('Domain restriction trigger', () => {
  test('rejects a non-navapbc.com signup at the database boundary', async () => {
    const client = freshClient();
    const { error } = await client.auth.signUp({
      email: uniqueEmail('outsider', 'gmail.com'),
      password: PASSWORD,
    });
    // The BEFORE INSERT trigger on auth.users raises, so signUp fails.
    expect(error).toBeTruthy();
  });

  test('allows a navapbc.com signup and the profile trigger creates the profile row', async () => {
    const client = freshClient();
    const { data, error } = await client.auth.signUp({
      email: uniqueEmail('nava', 'navapbc.com'),
      password: PASSWORD,
    });
    expect(error).toBeNull();
    const userId = data.user?.id;
    expect(userId).toBeTruthy();

    // handle_new_user() created a matching profiles row, readable by its owner.
    const { data: profiles, error: pErr } = await client
      .from('profiles')
      .select('id, role')
      .eq('id', userId!);
    expect(pErr).toBeNull();
    expect(profiles?.length).toBe(1);
    expect(profiles![0].role).toBe('learner');
  });
});

describe.skipIf(!RUN)('Owner-only RLS', () => {
  test('a user can write and read back their own progress / quiz / lab rows', async () => {
    const client = freshClient();
    const { data, error } = await client.auth.signUp({
      email: uniqueEmail('owner', 'navapbc.com'),
      password: PASSWORD,
    });
    expect(error).toBeNull();
    const uid = data.user!.id;

    await client.from('module_progress').upsert(
      { user_id: uid, module_id: 'rls-mp', status: 'completed', completed_at: new Date().toISOString() },
      { onConflict: 'user_id,module_id' },
    );
    await client.from('quiz_attempts').insert({ user_id: uid, module_id: 'rls-q', score: 5, max_score: 5, passed: true, answers: null });
    await client.from('lab_submissions').insert({ user_id: uid, lab_id: 'rls-lab', transcript: { ok: true }, status: 'submitted' });

    const mp = await client.from('module_progress').select('module_id').eq('user_id', uid);
    const qa = await client.from('quiz_attempts').select('module_id').eq('user_id', uid);
    const ls = await client.from('lab_submissions').select('lab_id').eq('user_id', uid);
    expect(mp.data?.some((r) => r.module_id === 'rls-mp')).toBe(true);
    expect(qa.data?.some((r) => r.module_id === 'rls-q')).toBe(true);
    expect(ls.data?.some((r) => r.lab_id === 'rls-lab')).toBe(true);
  });

  test("a second user CANNOT read the first user's progress/quiz/lab rows", async () => {
    // User A writes a row.
    const a = freshClient();
    const aSignup = await a.auth.signUp({ email: uniqueEmail('a', 'navapbc.com'), password: PASSWORD });
    const aId = aSignup.data.user!.id;
    await a.from('module_progress').upsert(
      { user_id: aId, module_id: 'secret-a', status: 'completed', completed_at: new Date().toISOString() },
      { onConflict: 'user_id,module_id' },
    );

    // User B reads — RLS scopes every table to auth.uid(), so A's rows are invisible.
    const b = freshClient();
    await b.auth.signUp({ email: uniqueEmail('b', 'navapbc.com'), password: PASSWORD });

    const mp = await b.from('module_progress').select('user_id, module_id');
    expect(mp.error).toBeNull();
    expect(mp.data?.some((r) => r.module_id === 'secret-a')).toBe(false);
    expect(mp.data?.every((r) => r.user_id !== aId)).toBe(true);
  });
});

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

describe.skipIf(!RUN)('Curriculum provenance (DATA-01 / D-24)', () => {
  // The original DATA-01 invariant ("all six Stage-1b cells are published/v1
  // after the #22 reconcile") predates the P4.x lab-config seeds. The invariant
  // that is actually intended now (audit W2-5): a Stage-1b cell's provenance is
  // DETERMINISTIC from the migration chain —
  //   • cells with no later lab-config seed stay reconciled: published / v1;
  //   • cells whose interactive config landed after the reconcile carry the
  //     not-yet-SME-reviewed marker: in_review / v2 with a non-null config
  //     (1.2 via 20260603010000; 1.12 via 20260602240000, restored by
  //     20260609000000 after the reconcile clobbered it — audit D-24).
  test('Stage-1b provenance is deterministic: reconciled cells published/v1, lab-config cells in_review/v2', async () => {
    const client = freshClient();
    await client.auth.signUp({ email: uniqueEmail('prov', 'navapbc.com'), password: PASSWORD });

    const { data, error } = await client
      .from('modules')
      .select('cell_id, status, version, lab_config_json')
      .in('cell_id', ['1.1', '1.2', '1.7', '1.8', '1.11', '1.12']);
    expect(error).toBeNull();
    expect(data?.length).toBe(6);

    const reconciled = ['1.1', '1.7', '1.8', '1.11'];
    const labSeeded = ['1.2', '1.12'];
    for (const row of data ?? []) {
      if (reconciled.includes(row.cell_id)) {
        expect(row.status, `cell ${row.cell_id}`).toBe('published');
        expect(row.version, `cell ${row.cell_id}`).toBe(1);
      } else {
        expect(labSeeded).toContain(row.cell_id);
        expect(row.status, `cell ${row.cell_id}`).toBe('in_review');
        expect(row.version, `cell ${row.cell_id}`).toBe(2);
        expect(row.lab_config_json, `cell ${row.cell_id}`).not.toBeNull();
      }
    }
    // (1.3 and 1.13 are legitimately 'in_review' per their own latest migrations —
    // a deliberate authoring state — so they are intentionally left untouched.)
  });
});

describe.skipIf(!RUN)('content_versions lockdown (SEC-07)', () => {
  test('an authenticated user cannot read content_versions (RLS on, no policy)', async () => {
    const client = freshClient();
    await client.auth.signUp({ email: uniqueEmail('cv', 'navapbc.com'), password: PASSWORD });
    // RLS is enabled with no permissive policy → the table is fully locked down,
    // so a select returns zero rows (no error) regardless of contents.
    const { data, error } = await client.from('content_versions').select('*');
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});

describe.skipIf(!RUN)('Role self-escalation guard (W2-2 / D-06 / LB-3)', () => {
  test('an authenticated user CANNOT escalate their own role to admin', async () => {
    const client = freshClient();
    const signup = await client.auth.signUp({
      email: uniqueEmail('escalate', 'navapbc.com'),
      password: PASSWORD,
    });
    expect(signup.error).toBeNull();
    const uid = signup.data.user!.id;

    // The exact escalation the audit flagged. The owner-update RLS policy permits
    // the row, but the BEFORE UPDATE trigger raises on the role change.
    const { error } = await client.from('profiles').update({ role: 'admin' }).eq('id', uid);
    expect(error).toBeTruthy();

    // The role is unchanged at the database boundary.
    const { data } = await client.from('profiles').select('role').eq('id', uid).single();
    expect(data?.role).toBe('learner');
  });

  test('a non-role profile update (full_name) still succeeds for the owner', async () => {
    const client = freshClient();
    const signup = await client.auth.signUp({
      email: uniqueEmail('rename', 'navapbc.com'),
      password: PASSWORD,
    });
    const uid = signup.data.user!.id;

    const { error } = await client.from('profiles').update({ full_name: 'Casey Nava' }).eq('id', uid);
    expect(error).toBeNull();
    const { data } = await client.from('profiles').select('full_name, role').eq('id', uid).single();
    expect(data?.full_name).toBe('Casey Nava');
    expect(data?.role).toBe('learner');
  });
});

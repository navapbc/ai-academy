import { describe, test, expect } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured } from './supabaseClient';

// INTEGRATION test for the service_role role-assignment path + role_changes
// lockdown, against the LOCAL Supabase stack. Triple-gated: RUN_DB_TESTS=1 AND a
// live stack AND a service_role key (SUPABASE_SERVICE_ROLE_KEY). Missing any of
// those => SKIP, so plain `npm run test` and the fast build CI job stay green.
// Get the key locally with: `npx supabase status -o env | grep SERVICE_ROLE_KEY`.
//
// The complementary assertion — the W2-2 trigger BLOCKS an authenticated
// `update profiles set role` — already lives in rls.integration.test.ts
// ('Role self-escalation guard'). This file proves the service_role path the
// admin-set-role function uses actually works, plus the audit-table lockdown.

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
    '[adminRole.integration.test] Skipping. Enable with RUN_DB_TESTS=1, a running ' +
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

describe.skipIf(!RUN)('service_role role assignment (P5.1a)', () => {
  test('service_role CAN set a role (the path the admin-set-role function uses)', async () => {
    // Create a real user via anon signup so handle_new_user() seeds the profile.
    const user = anonClient();
    const signup = await user.auth.signUp({ email: uniqueEmail('target'), password: PASSWORD });
    expect(signup.error).toBeNull();
    const uid = signup.data.user!.id;

    // service_role updates the role — the W2-2 trigger permits service_role.
    const svc = serviceClient();
    const { error: updErr } = await svc.from('profiles').update({ role: 'champion' }).eq('id', uid);
    expect(updErr).toBeNull();

    const { data, error } = await svc.from('profiles').select('role').eq('id', uid).single();
    expect(error).toBeNull();
    expect(data?.role).toBe('champion');
  });

  test('role_changes accepts a service_role insert and is locked to clients', async () => {
    const user = anonClient();
    const signup = await user.auth.signUp({ email: uniqueEmail('audit'), password: PASSWORD });
    expect(signup.error).toBeNull();
    const uid = signup.data.user!.id;

    const svc = serviceClient();
    const { error: insErr } = await svc.from('role_changes').insert({
      actor_id: uid,
      actor_email: 'actor@navapbc.com',
      target_id: uid,
      target_email: 'actor@navapbc.com',
      old_role: 'learner',
      new_role: 'champion',
    });
    expect(insErr).toBeNull();

    // A non-service client cannot read role_changes (RLS on, no policy) — the
    // local signup may yield an anon or authenticated session; both are denied.
    const { data: clientRead, error: readErr } = await user.from('role_changes').select('*');
    expect(readErr).toBeNull();
    expect(clientRead ?? []).toHaveLength(0);
  });
});

describe.skipIf(!RUN)('handle_new_user() OAuth full_name capture', () => {
  test('signup metadata full_name lands on the profiles row', async () => {
    const user = anonClient();
    const signup = await user.auth.signUp({
      email: uniqueEmail('named'),
      password: PASSWORD,
      options: { data: { full_name: 'Ada Lovelace' } },
    });
    expect(signup.error).toBeNull();
    const uid = signup.data.user!.id;

    const svc = serviceClient();
    const { data, error } = await svc.from('profiles').select('full_name').eq('id', uid).single();
    expect(error).toBeNull();
    expect(data?.full_name).toBe('Ada Lovelace');
  });

  test('signup with no name metadata leaves full_name null', async () => {
    const user = anonClient();
    const signup = await user.auth.signUp({ email: uniqueEmail('unnamed'), password: PASSWORD });
    expect(signup.error).toBeNull();
    const uid = signup.data.user!.id;

    const svc = serviceClient();
    const { data, error } = await svc.from('profiles').select('full_name').eq('id', uid).single();
    expect(error).toBeNull();
    expect(data?.full_name).toBeNull();
  });
});

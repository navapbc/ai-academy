import { describe, test, expect } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured } from './supabaseClient';

// INTEGRATION test for the P6.2 Unit-1 claude_usage table against the LOCAL
// Supabase stack. Triple-gated: RUN_DB_TESTS=1 AND a live stack AND
// SUPABASE_SERVICE_ROLE_KEY. Missing any => SKIP, so plain `npm run test` stays
// green. Service-role key: `npx supabase status -o env | grep SERVICE_ROLE_KEY`.
//
// Proves the client-write-locked / admin-read boundary:
//   • a service_role insert succeeds and an ADMIN select reads it back;
//   • a non-admin authenticated user select returns zero rows (RLS denies);
//   • an authenticated (non-service) client insert/update/delete is rejected
//     (no client write policy exists at all);
//   • the source CHECK constraint rejects a value outside chat/grade.
// Admin promotion uses the service_role path (the W2-2 trigger blocks the
// client), mirroring championAdminRls.integration.test.ts.

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
    '[claudeUsageRls.integration.test] Skipping. Enable with RUN_DB_TESTS=1, a ' +
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

// Insert one usage row for `uid` via service_role (bypasses RLS). Tagged with the
// model string so assertions are robust against rows left by other tests.
async function seedUsage(svc: SupabaseClient, uid: string, model: string): Promise<void> {
  const { error } = await svc.from('claude_usage').insert({
    user_id: uid,
    source: 'chat',
    model,
    input_tokens: 100,
    output_tokens: 50,
  });
  expect(error).toBeNull();
}

describe.skipIf(!RUN)('claude_usage RLS (P6.2 Unit 1)', () => {
  test('service_role inserts and an admin reads the row back', async () => {
    const svc = serviceClient();
    const admin = await newUser('p62-admin');
    const model = `claude-usage-${admin.uid}`;
    await seedUsage(svc, admin.uid, model);
    expect((await svc.from('profiles').update({ role: 'admin' }).eq('id', admin.uid)).error).toBeNull();

    const read = await admin.client
      .from('claude_usage')
      .select('user_id, source, model, input_tokens, output_tokens')
      .eq('model', model);
    expect(read.error).toBeNull();
    expect(read.data?.length).toBe(1);
    expect(read.data?.[0].source).toBe('chat');
    expect(read.data?.[0].input_tokens).toBe(100);
    expect(read.data?.[0].output_tokens).toBe(50);
  });

  test('a non-admin authenticated user reads zero rows (RLS denies)', async () => {
    const svc = serviceClient();
    const learner = await newUser('p62-learner');
    const model = `claude-usage-${learner.uid}`;
    await seedUsage(svc, learner.uid, model);
    // learner keeps the default 'learner' role → is_admin() is false.

    const read = await learner.client.from('claude_usage').select('id').eq('model', model);
    expect(read.error).toBeNull();
    expect(read.data?.length).toBe(0);
  });

  test('a champion reads zero rows (champions have elevated reads elsewhere but are excluded here)', async () => {
    const svc = serviceClient();
    const champion = await newUser('p62-champion');
    const model = `claude-usage-${champion.uid}`;
    await seedUsage(svc, champion.uid, model);
    // Promote to champion via service_role (the client trigger blocks role writes).
    expect(
      (await svc.from('profiles').update({ role: 'champion' }).eq('id', champion.uid)).error,
    ).toBeNull();

    // is_admin() is false for champions → the admin-only read policy denies them.
    const read = await champion.client.from('claude_usage').select('id').eq('model', model);
    expect(read.error).toBeNull();
    expect(read.data?.length).toBe(0);
  });

  test('an authenticated (non-service) client cannot insert/update/delete (no write policy)', async () => {
    const svc = serviceClient();
    const user = await newUser('p62-writer');
    const model = `claude-usage-${user.uid}`;
    await seedUsage(svc, user.uid, model); // a real row the client will fail to touch

    // INSERT: no permissive policy → PostgREST reports an RLS violation.
    const ins = await user.client.from('claude_usage').insert({
      user_id: user.uid,
      source: 'chat',
      model: 'client-insert-attempt',
      input_tokens: 1,
      output_tokens: 1,
    });
    expect(ins.error).toBeTruthy();

    // UPDATE / DELETE: no policy matches any row, so zero rows are affected (no
    // error) — the client can neither read nor mutate the locked-down row.
    const upd = await user.client
      .from('claude_usage')
      .update({ input_tokens: 999 })
      .eq('model', model)
      .select('id');
    expect(upd.error).toBeNull();
    expect(upd.data?.length).toBe(0);

    const del = await user.client.from('claude_usage').delete().eq('model', model).select('id');
    expect(del.error).toBeNull();
    expect(del.data?.length).toBe(0);

    // The row is intact at the database boundary (verified via service_role).
    const check = await svc.from('claude_usage').select('input_tokens').eq('model', model).single();
    expect(check.error).toBeNull();
    expect(check.data?.input_tokens).toBe(100);
  });

  test('the source CHECK constraint rejects a value outside chat/grade', async () => {
    const svc = serviceClient();
    const user = await newUser('p62-badsource');
    // service_role bypasses RLS but NOT CHECK constraints → the insert is rejected.
    const bad = await svc.from('claude_usage').insert({
      user_id: user.uid,
      source: 'other',
      model: 'bad-source-attempt',
      input_tokens: 1,
      output_tokens: 1,
    });
    expect(bad.error).toBeTruthy();
  });
});

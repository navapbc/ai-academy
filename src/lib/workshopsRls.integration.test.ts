import { describe, test, expect } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured } from './supabaseClient';

// INTEGRATION test for the X.3 Unit-1 workshops table against the LOCAL Supabase
// stack. Triple-gated: RUN_DB_TESTS=1 AND a live stack AND
// SUPABASE_SERVICE_ROLE_KEY. Missing any => SKIP, so plain `npm run test` stays
// green. Service-role key: `npx supabase status -o env | grep SERVICE_ROLE_KEY`.
//
// Proves the authenticated-read / client-write-locked boundary:
//   • a service_role insert succeeds and an authenticated learner reads it back;
//   • an empty step_cell_ids default works (no explicit value on insert);
//   • an authenticated (non-service) client insert/update/delete is rejected
//     (no client write policy exists at all).
// Mirrors claudeUsageRls.integration.test.ts.

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
    '[workshopsRls.integration.test] Skipping. Enable with RUN_DB_TESTS=1, a ' +
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

// Insert one workshop via service_role (bypasses RLS). Tagged with a unique
// title so assertions are robust against rows left by other tests. Returns the id.
async function seedWorkshop(
  svc: SupabaseClient,
  title: string,
  stepCellIds?: string[],
): Promise<string> {
  const row: Record<string, unknown> = { title };
  if (stepCellIds !== undefined) row.step_cell_ids = stepCellIds;
  const { data, error } = await svc.from('workshops').insert(row).select('id').single();
  expect(error).toBeNull();
  return data!.id as string;
}

describe.skipIf(!RUN)('workshops RLS (X.3 Unit 1)', () => {
  test('service_role inserts and an authenticated learner reads the row back', async () => {
    const svc = serviceClient();
    const learner = await newUser('x3-learner');
    const title = `workshop-${learner.uid}`;
    const id = await seedWorkshop(svc, title, ['2.6', '2.7', '2.10']);

    const read = await learner.client
      .from('workshops')
      .select('id, title, intro, step_cell_ids')
      .eq('id', id)
      .single();
    expect(read.error).toBeNull();
    expect(read.data?.title).toBe(title);
    expect(read.data?.step_cell_ids).toEqual(['2.6', '2.7', '2.10']);
  });

  test('empty step_cell_ids default works (no explicit value on insert)', async () => {
    const svc = serviceClient();
    const title = `workshop-empty-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const id = await seedWorkshop(svc, title); // no step_cell_ids passed → default '{}'

    const read = await svc.from('workshops').select('step_cell_ids').eq('id', id).single();
    expect(read.error).toBeNull();
    expect(read.data?.step_cell_ids).toEqual([]);
  });

  test('an authenticated (non-service) client cannot insert/update/delete (no write policy)', async () => {
    const svc = serviceClient();
    const user = await newUser('x3-writer');
    const title = `workshop-locked-${user.uid}`;
    const id = await seedWorkshop(svc, title, ['1.1']); // a real row the client will fail to touch

    // INSERT: no permissive policy → PostgREST reports an RLS violation.
    const ins = await user.client.from('workshops').insert({ title: 'client-insert-attempt' });
    expect(ins.error).toBeTruthy();

    // UPDATE / DELETE: no write policy matches any row, so zero rows are affected
    // (no error) — the client can read (authenticated select) but not mutate.
    const upd = await user.client
      .from('workshops')
      .update({ title: 'client-update-attempt' })
      .eq('id', id)
      .select('id');
    expect(upd.error).toBeNull();
    expect(upd.data?.length).toBe(0);

    const del = await user.client.from('workshops').delete().eq('id', id).select('id');
    expect(del.error).toBeNull();
    expect(del.data?.length).toBe(0);

    // The row is intact at the database boundary (verified via service_role).
    const check = await svc.from('workshops').select('title').eq('id', id).single();
    expect(check.error).toBeNull();
    expect(check.data?.title).toBe(title);
  });
});

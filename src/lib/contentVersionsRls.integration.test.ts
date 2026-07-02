import { describe, test, expect } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured } from './supabaseClient';

// INTEGRATION test for the X.2 Unit-1 content_versions admin-read policy against
// the LOCAL Supabase stack. Triple-gated: RUN_DB_TESTS=1 AND a live stack AND
// SUPABASE_SERVICE_ROLE_KEY. Missing any => SKIP, so plain `npm run test` stays
// green. Service-role key: `npx supabase status -o env | grep SERVICE_ROLE_KEY`.
//
// Proves the client-write-locked / admin-read boundary (mirrors
// claudeUsageRls.integration.test.ts):
//   • a service_role insert succeeds and an ADMIN select reads it back;
//   • a non-admin authenticated user select returns zero rows (RLS denies);
//   • an authenticated (non-service) client insert/update/delete is rejected
//     (no client write policy exists at all — writes stay service_role-only).
// Admin promotion uses the service_role path (the W2-2 trigger blocks the
// client), mirroring the claude_usage suite.

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
    '[contentVersionsRls.integration.test] Skipping. Enable with RUN_DB_TESTS=1, a ' +
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

// A real modules row to satisfy the cell_id FK; returns a valid existing cell_id.
// The seeded matrix always has cell 1.1, but resolve it dynamically so the test
// is robust to seed churn.
async function anyCellId(svc: SupabaseClient): Promise<string> {
  const { data, error } = await svc.from('modules').select('cell_id').limit(1).single();
  expect(error).toBeNull();
  return data!.cell_id as string;
}

// Insert one content_versions row via service_role (bypasses RLS). Tagged with a
// unique note so assertions are robust against rows left by other tests.
async function seedVersion(
  svc: SupabaseClient,
  cellId: string,
  note: string,
  authorId: string | null = null,
): Promise<void> {
  const { error } = await svc.from('content_versions').insert({
    cell_id: cellId,
    version: 1,
    snapshot_json: { title: 'snap', body_md: 'x' },
    author_id: authorId,
    note,
  });
  expect(error).toBeNull();
}

describe.skipIf(!RUN)('content_versions RLS (X.2 Unit 1)', () => {
  test('service_role inserts and an admin reads the row back', async () => {
    const svc = serviceClient();
    const admin = await newUser('cv-admin');
    const cellId = await anyCellId(svc);
    const note = `cv-admin-${admin.uid}`;
    await seedVersion(svc, cellId, note, admin.uid);
    expect((await svc.from('profiles').update({ role: 'admin' }).eq('id', admin.uid)).error).toBeNull();

    const read = await admin.client
      .from('content_versions')
      .select('cell_id, version, snapshot_json, author_id, note')
      .eq('note', note);
    expect(read.error).toBeNull();
    expect(read.data?.length).toBe(1);
    expect(read.data?.[0].cell_id).toBe(cellId);
    expect(read.data?.[0].version).toBe(1);
    expect(read.data?.[0].author_id).toBe(admin.uid);
  });

  test('a non-admin authenticated user reads zero rows (RLS denies)', async () => {
    const svc = serviceClient();
    const learner = await newUser('cv-learner');
    const cellId = await anyCellId(svc);
    const note = `cv-learner-${learner.uid}`;
    await seedVersion(svc, cellId, note);
    // learner keeps the default 'learner' role → is_admin() is false.

    const read = await learner.client.from('content_versions').select('id').eq('note', note);
    expect(read.error).toBeNull();
    expect(read.data?.length).toBe(0);
  });

  test('an authenticated (non-service) client cannot insert/update/delete (no write policy)', async () => {
    const svc = serviceClient();
    const user = await newUser('cv-writer');
    const cellId = await anyCellId(svc);
    const note = `cv-writer-${user.uid}`;
    await seedVersion(svc, cellId, note); // a real row the client will fail to touch

    // INSERT: no permissive policy → PostgREST reports an RLS violation.
    const ins = await user.client.from('content_versions').insert({
      cell_id: cellId,
      version: 2,
      snapshot_json: { title: 'client' },
      note: 'client-insert-attempt',
    });
    expect(ins.error).toBeTruthy();

    // UPDATE / DELETE: no policy matches any row, so zero rows are affected (no
    // error) — the client can neither read nor mutate the locked-down row.
    const upd = await user.client
      .from('content_versions')
      .update({ note: 'hacked' })
      .eq('note', note)
      .select('id');
    expect(upd.error).toBeNull();
    expect(upd.data?.length).toBe(0);

    const del = await user.client.from('content_versions').delete().eq('note', note).select('id');
    expect(del.error).toBeNull();
    expect(del.data?.length).toBe(0);

    // The row is intact at the database boundary (verified via service_role).
    const check = await svc.from('content_versions').select('note').eq('note', note).single();
    expect(check.error).toBeNull();
    expect(check.data?.note).toBe(note);
  });
});

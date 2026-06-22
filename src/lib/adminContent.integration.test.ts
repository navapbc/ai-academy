import { describe, test, expect } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured } from './supabaseClient';

// INTEGRATION test for the P5.4-1 admin-content write/read boundary against the
// LOCAL Supabase stack. Triple-gated: RUN_DB_TESTS=1 AND a live stack AND a
// service_role key (SUPABASE_SERVICE_ROLE_KEY). Missing any => SKIP, so plain
// `npm run test` and the fast build CI job stay green.
//
// Proves the security + draft→publish contract the unit tests + mocks cannot:
//   (1) modules is client-write-CLOSED — an authenticated client INSERT/UPDATE is
//       denied by RLS (no write policy) → R5 write-lockdown.
//   (2) the service_role path the admin-content function uses can save a draft
//       (live + status unchanged → R3), and publish it (draft→live, status
//       published, version bumped ABSOLUTELY by 1, draft nulled).
//   (3) an archived row is excluded from the learner fetch and restore brings it
//       back → R6.
//   (4) the learner read path (LIVE columns, no `draft`) never surfaces draft → R3.
//
// Isolation: every test operates on a freshly-inserted `origin='custom'` row with a
// unique cell_id (never a seeded matrix cell) and hard-deletes it on the way out,
// so the suite leaves the seeded curriculum untouched.

const URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined;
const PASSWORD = 'integration-pass-123';

// The learner read path's LIVE columns — intentionally WITHOUT `draft` (R3).
const LEARNER_COLUMNS = 'cell_id, status, version, title, body_md, video_url, archived_at, origin, stage';

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
  console.info(
    '[adminContent.integration.test] Skipping. Enable with RUN_DB_TESTS=1, a running ' +
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
const uniqueCellId = () => `custom-itest-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/** Inserts an isolated custom lesson with known LIVE content + a pending draft. */
async function seedCustomLesson(
  svc: SupabaseClient,
  over: Record<string, unknown> = {},
): Promise<string> {
  const cellId = uniqueCellId();
  const { error } = await svc.from('modules').insert({
    cell_id: cellId,
    origin: 'custom',
    stage: null,
    status: 'draft',
    title: 'Live title',
    type: 'content',
    dimension: [],
    evidence_type: 'quiz',
    self_report_validity: 'na',
    body_md: 'LIVE BODY',
    version: 1,
    sort_order: 9999,
    ...over,
  });
  expect(error).toBeNull();
  return cellId;
}

async function authedClientFor(email: string): Promise<SupabaseClient> {
  const c = anonClient();
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  expect(error).toBeNull();
  return c;
}

describe.skipIf(!RUN)('admin-content write/read boundary (P5.4-1)', () => {
  test('an authenticated client CANNOT write modules (RLS has no write policy) → R5', async () => {
    const svc = serviceClient();
    const cellId = await seedCustomLesson(svc);

    const email = uniqueEmail('writer');
    await anonClient().auth.signUp({ email, password: PASSWORD });
    const authed = await authedClientFor(email);

    // UPDATE denied (no policy): either an error, or zero rows affected.
    const upd = await authed.from('modules').update({ body_md: 'HACKED' }).eq('cell_id', cellId).select('cell_id');
    expect(upd.error !== null || (upd.data ?? []).length === 0).toBe(true);
    // INSERT denied.
    const ins = await authed.from('modules').insert({
      cell_id: uniqueCellId(), origin: 'custom', stage: null, title: 'x', type: 'content',
      dimension: [], evidence_type: 'quiz', self_report_validity: 'na', sort_order: 1,
    });
    expect(ins.error).not.toBeNull();

    // The live body is untouched by the blocked write.
    const { data } = await svc.from('modules').select('body_md').eq('cell_id', cellId).single();
    expect(data!.body_md).toBe('LIVE BODY');

    await svc.from('modules').delete().eq('cell_id', cellId);
  });

  test('service_role save-draft writes the draft and leaves live + status unchanged → R3', async () => {
    const svc = serviceClient();
    const cellId = await seedCustomLesson(svc);

    const { error } = await svc
      .from('modules')
      .update({ draft: { body_md: 'DRAFT BODY', title: 'Draft title' } })
      .eq('cell_id', cellId);
    expect(error).toBeNull();

    // Learner read path (LIVE columns, no draft) still shows the published live body.
    const { data: live } = await svc.from('modules').select(LEARNER_COLUMNS).eq('cell_id', cellId).single();
    expect(live!.body_md).toBe('LIVE BODY');
    expect(live!.title).toBe('Live title');
    expect(live!.status).toBe('draft'); // unchanged by save-draft
    expect('draft' in live!).toBe(false); // the learner select never carries the draft

    await svc.from('modules').delete().eq('cell_id', cellId);
  });

  test('publish promotes draft→live, sets published, bumps version by exactly 1, nulls draft', async () => {
    const svc = serviceClient();
    const cellId = await seedCustomLesson(svc, { version: 3 });
    await svc
      .from('modules')
      .update({ draft: { body_md: 'PUBLISHED BODY', title: 'Published title' } })
      .eq('cell_id', cellId);

    // Mirror the function's atomic publish: copy draft→live, status, ABSOLUTE version, draft=null.
    const { data: before } = await svc.from('modules').select('version, draft').eq('cell_id', cellId).single();
    const draft = before!.draft as Record<string, unknown>;
    const { error } = await svc
      .from('modules')
      .update({ ...draft, status: 'published', version: (before!.version as number) + 1, draft: null })
      .eq('cell_id', cellId);
    expect(error).toBeNull();

    const { data: after } = await svc
      .from('modules')
      .select('body_md, title, status, version, draft')
      .eq('cell_id', cellId)
      .single();
    expect(after!.body_md).toBe('PUBLISHED BODY');
    expect(after!.title).toBe('Published title');
    expect(after!.status).toBe('published');
    expect(after!.version).toBe(4); // 3 + 1, absolute
    expect(after!.draft).toBeNull();

    await svc.from('modules').delete().eq('cell_id', cellId);
  });

  test('archive excludes a row from the learner fetch; restore brings it back → R6', async () => {
    const svc = serviceClient();
    const cellId = await seedCustomLesson(svc, { status: 'published' });

    const learnerFetch = () =>
      svc.from('modules').select('cell_id').is('archived_at', null).eq('cell_id', cellId);

    expect((await learnerFetch()).data).toHaveLength(1);

    await svc.from('modules').update({ archived_at: new Date().toISOString() }).eq('cell_id', cellId);
    expect((await learnerFetch()).data ?? []).toHaveLength(0); // hidden from learners

    await svc.from('modules').update({ archived_at: null }).eq('cell_id', cellId);
    expect((await learnerFetch()).data).toHaveLength(1); // restored, never hard-deleted

    await svc.from('modules').delete().eq('cell_id', cellId);
  });

  // P5.4-6: the create-custom row shape (mirrors buildCustomInsert, whose slug +
  // collision logic is unit-tested in admin-content-core.test.ts) goes through the
  // full lifecycle at the DB level: hidden draft → published+ungated → archive →
  // restore. A learner-visible custom lesson is `published` AND `archived_at is null`.
  test('a created custom lesson is a hidden draft, then published+ungated, then archive/restore → R2/R3/R6', async () => {
    const svc = serviceClient();
    const { data: all } = await svc.from('modules').select('cell_id, sort_order');
    const maxSort = (all ?? []).reduce((m, r) => Math.max(m, (r.sort_order as number) ?? 0), 0);

    const cellId = uniqueCellId();
    const { error: insErr } = await svc.from('modules').insert({
      cell_id: cellId,
      origin: 'custom',
      stage: null,
      status: 'draft', // invisible to learners until publish (R3)
      title: 'Created custom lesson',
      type: 'content',
      dimension: [],
      evidence_type: 'reflection',
      self_report_validity: 'na',
      body_md: null,
      version: 1,
      sort_order: maxSort + 1, // lands after every existing row
    });
    expect(insErr).toBeNull();

    const learnerVisible = () =>
      svc
        .from('modules')
        .select('cell_id, stage')
        .is('archived_at', null)
        .eq('origin', 'custom')
        .eq('status', 'published')
        .eq('cell_id', cellId);

    // Created as a hidden draft: not learner-visible yet (R3).
    expect((await learnerVisible()).data ?? []).toHaveLength(0);

    // Publish → visible, and still ungated (stage stays null — never matrix gating) → R2.
    await svc.from('modules').update({ status: 'published' }).eq('cell_id', cellId);
    const pub = await learnerVisible();
    expect(pub.data ?? []).toHaveLength(1);
    expect(pub.data![0].stage).toBeNull();

    // Archive hides it; restore brings it back (never hard-deleted) → R6.
    await svc.from('modules').update({ archived_at: new Date().toISOString() }).eq('cell_id', cellId);
    expect((await learnerVisible()).data ?? []).toHaveLength(0);
    await svc.from('modules').update({ archived_at: null }).eq('cell_id', cellId);
    expect((await learnerVisible()).data ?? []).toHaveLength(1);

    await svc.from('modules').delete().eq('cell_id', cellId);
  });
});

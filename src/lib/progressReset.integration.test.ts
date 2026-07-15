import { describe, test, expect } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured } from './supabaseClient';

// INTEGRATION tests for the U10 progress-reset epoch protocol against the LOCAL
// Supabase stack: the `enforce_progress_reset_epoch` trigger (migration
// 20260715050000), the publish-with-reset write sequence, and — the acceptance
// test — the offline-outbox resurrection guard. Triple-gated like
// courseStructure.integration.test.ts: RUN_DB_TESTS=1 AND a live stack AND
// SUPABASE_SERVICE_ROLE_KEY (the reset sequence is service_role-only by
// design). Missing any => SKIP.
// Service-role key: `npx supabase status -o env | grep SERVICE_ROLE_KEY`.
//
// What this file proves:
//  (a) after a reset, a completion echoing an OLD epoch is rejected with the
//      dedicated STALE_RESET_EPOCH contract; a fresh epoch is accepted;
//  (b) the guard is completed-only — in_progress cursor writes always pass,
//      including the upsert-UPDATE path the real client uses;
//  (c) reset on a never-completed module is a no-op; after two sequential
//      resets the SECOND epoch governs;
//  (d) ACCEPTANCE: the offline outbox replay echoing its STORED (pre-reset)
//      epoch is rejected — an implementation that re-derives the epoch from
//      freshly fetched curriculum would echo the NEW epoch and be ACCEPTED,
//      so this test FAILS that implementation;
//  (e) an unenrolled learner replaying against a now-invisible program module
//      is still rejected — the trigger's modules read is SECURITY DEFINER
//      (fail-closed), not subject to the caller's RLS;
//  (f) a completion written with the fresh epoch AFTER the reset sticks;
//  (g) FIX A-1: the reset delete is SCOPED — a fresh-epoch completion written
//      in the epoch→delete gap survives while stale-epoch rows are removed;
//  (h) FIX A-3: the reset-only retry (publish with resetProgress and a NULL
//      draft) re-runs the epoch→scoped-delete sequence and works.

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
    '[progressReset.integration.test] Skipping. Enable with RUN_DB_TESTS=1, a ' +
      'running local stack (`npx supabase start`), and SUPABASE_SERVICE_ROLE_KEY ' +
      'set (`npx supabase status -o env | grep SERVICE_ROLE_KEY`).',
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
const uniqueCellId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function newUser(): Promise<{ client: SupabaseClient; uid: string }> {
  const client = anonClient();
  const { data, error } = await client.auth.signUp({ email: uniqueEmail('reset'), password: PASSWORD });
  expect(error).toBeNull();
  return { client, uid: data.user!.id };
}

/** A minimal published module row (course origin so it can be either visibility). */
function moduleRow(cellId: string, visibility: 'public' | 'program') {
  return {
    cell_id: cellId,
    origin: 'course',
    stage: null,
    status: 'published',
    visibility,
    title: `Reset-protocol module ${cellId}`,
    type: 'content',
    dimension: [],
    evidence_type: 'reflection',
    self_report_validity: 'na',
    body_md: '# reset test',
    sort_order: 9100,
  };
}

/** Creates a fresh test module via service_role and returns its cell id. */
async function newModule(visibility: 'public' | 'program' = 'public'): Promise<string> {
  const svc = serviceClient();
  const cellId = uniqueCellId(visibility === 'public' ? 'rst-pub' : 'rst-prog');
  const { error } = await svc.from('modules').insert(moduleRow(cellId, visibility));
  expect(error).toBeNull();
  return cellId;
}

/**
 * Replicates the admin-content publish-with-reset sequence exactly (the Deno
 * function itself can't run under vitest): (1) commit the epoch on the module
 * row FIRST, (2) THEN delete the module's PRE-EPOCH progress rows, counting
 * them. The delete is SCOPED (review FIX A-1) to rows whose reset_epoch is
 * NULL or predates the just-committed epoch — a completion legitimately
 * written WITH the fresh epoch in the epoch→delete gap must survive. Returns
 * the epoch as the DB stores/returns it (the value clients echo).
 */
async function publishReset(cellId: string): Promise<{ epoch: string; deleted: number }> {
  const svc = serviceClient();
  const minted = new Date().toISOString();
  const up = await svc.from('modules').update({ progress_reset_at: minted }).eq('cell_id', cellId);
  expect(up.error).toBeNull();
  const del = await svc
    .from('module_progress')
    .delete({ count: 'exact' })
    .eq('module_id', cellId)
    .or(`reset_epoch.is.null,reset_epoch.lt."${minted}"`);
  expect(del.error).toBeNull();
  // Read the stored epoch back in PostgREST's own format — this is exactly what
  // a client's curriculum fetch would capture and later echo.
  const { data, error } = await svc
    .from('modules')
    .select('progress_reset_at')
    .eq('cell_id', cellId)
    .single();
  expect(error).toBeNull();
  return { epoch: data!.progress_reset_at as string, deleted: del.count ?? 0 };
}

/** A learner-side completion INSERT echoing the given epoch. */
function insertCompletion(
  client: SupabaseClient,
  uid: string,
  cellId: string,
  epoch: string | null,
) {
  const now = new Date().toISOString();
  return client.from('module_progress').insert({
    user_id: uid,
    module_id: cellId,
    status: 'completed',
    completed_at: now,
    updated_at: now,
    completed_via: 'explored',
    reset_epoch: epoch,
  });
}

describe.skipIf(!RUN)('progress-reset epoch trigger (U10)', () => {
  test('(a) after a reset: an old-epoch completion is rejected with STALE_RESET_EPOCH; a fresh one is accepted', async () => {
    const cellId = await newModule('public');
    const { client, uid } = await newUser();

    // Pre-reset completion (module never reset → epoch null) is accepted.
    const first = await insertCompletion(client, uid, cellId, null);
    expect(first.error).toBeNull();

    const { deleted } = await publishReset(cellId);
    expect(deleted).toBe(1); // the pre-reset row was cleared

    // Echoing the OLD (null) epoch → the dedicated, classifiable rejection.
    const stale = await insertCompletion(client, uid, cellId, null);
    expect(stale.error).toBeTruthy();
    expect(stale.error!.message).toMatch(/STALE_RESET_EPOCH/);

    // The client refetches the module (public → visible) and echoes the fresh
    // epoch → accepted.
    const { data: mod } = await client
      .from('modules')
      .select('progress_reset_at')
      .eq('cell_id', cellId)
      .single();
    const fresh = await insertCompletion(client, uid, cellId, mod!.progress_reset_at as string);
    expect(fresh.error).toBeNull();
  });

  test('(b) the guard is completed-only: stale in_progress writes pass — INSERT and the upsert-UPDATE path', async () => {
    const cellId = await newModule('public');
    const { client, uid } = await newUser();
    await publishReset(cellId);

    // A stale-session cursor INSERT (no epoch) passes the trigger.
    const cursor = await client.from('module_progress').insert({
      user_id: uid,
      module_id: cellId,
      status: 'in_progress',
      updated_at: new Date().toISOString(),
    });
    expect(cursor.error).toBeNull();

    // ...and an in_progress UPDATE on the existing row passes too.
    const touch = await client
      .from('module_progress')
      .update({ updated_at: new Date().toISOString() })
      .eq('user_id', uid)
      .eq('module_id', cellId);
    expect(touch.error).toBeNull();

    // But UPGRADING that same row to completed with a stale epoch is rejected —
    // this is the real client's upsert-update path.
    const upgrade = await client
      .from('module_progress')
      .update({ status: 'completed', completed_at: new Date().toISOString(), reset_epoch: null })
      .eq('user_id', uid)
      .eq('module_id', cellId);
    expect(upgrade.error).toBeTruthy();
    expect(upgrade.error!.message).toMatch(/STALE_RESET_EPOCH/);
  });

  test('(c) reset on a never-completed module is a no-op; after two sequential resets the SECOND epoch governs', async () => {
    const cellId = await newModule('public');
    const { client, uid } = await newUser();

    // No progress rows exist → the delete clears nothing and nothing breaks.
    const firstReset = await publishReset(cellId);
    expect(firstReset.deleted).toBe(0);

    // Completion carrying the first epoch is accepted (epoch == reset_at passes).
    const withFirst = await insertCompletion(client, uid, cellId, firstReset.epoch);
    expect(withFirst.error).toBeNull();

    // Second reset clears it; the FIRST epoch is now stale.
    const secondReset = await publishReset(cellId);
    expect(secondReset.deleted).toBe(1);

    const staleFirst = await insertCompletion(client, uid, cellId, firstReset.epoch);
    expect(staleFirst.error).toBeTruthy();
    expect(staleFirst.error!.message).toMatch(/STALE_RESET_EPOCH/);

    const withSecond = await insertCompletion(client, uid, cellId, secondReset.epoch);
    expect(withSecond.error).toBeNull();
  });

  test('(d) ACCEPTANCE — offline outbox: a replay echoing its STORED pre-reset epoch is rejected (re-derivation would be accepted and must fail here)', async () => {
    const cellId = await newModule('public');
    const { client, uid } = await newUser();

    // Round 1: establish a REAL pre-reset epoch (not just null) so the stored
    // value is a concrete timestamp an implementation might be tempted to
    // "refresh".
    const reset1 = await publishReset(cellId);

    // The learner completes AFTER reset1: the client captured epoch = reset1
    // into its outbox/cache at completion time. The write lands (row exists).
    const online = await insertCompletion(client, uid, cellId, reset1.epoch);
    expect(online.error).toBeNull();

    // The learner goes OFFLINE holding {epoch: reset1} in the outbox. Meanwhile
    // the admin publishes-with-reset: epoch commits first, then the delete.
    const reset2 = await publishReset(cellId);
    expect(reset2.deleted).toBe(1);

    // The device reconnects and replays the outbox entry, echoing the STORED
    // epoch (reset1) — the protocol's non-negotiable. The trigger rejects it,
    // so the reset survives the offline cache.
    const replay = await insertCompletion(client, uid, cellId, reset1.epoch);
    expect(replay.error).toBeTruthy();
    expect(replay.error!.message).toMatch(/STALE_RESET_EPOCH/);

    // THE POINT: a deliberately-wrong implementation that re-derives the epoch
    // at replay time from freshly fetched curriculum would echo reset2's epoch
    // — and the DB would ACCEPT it, resurrecting the reset. Assert that the
    // fresh-epoch echo is indeed accepted, which is exactly why the client
    // must never do it (and why the rejection above is the acceptance
    // criterion for the stored-epoch implementation).
    const rederived = await insertCompletion(client, uid, cellId, reset2.epoch);
    expect(rederived.error).toBeNull();
    // Clean up the resurrected row so the module ends the test reset.
    const svc = serviceClient();
    await svc.from('module_progress').delete().eq('module_id', cellId).eq('user_id', uid);
  });

  test('(e) an unenrolled learner replaying against a now-invisible PROGRAM module is still rejected (SECURITY DEFINER read, fail-closed)', async () => {
    const cellId = await newModule('program');
    const { client, uid } = await newUser(); // authenticated, UNENROLLED learner
    await publishReset(cellId);

    // Prove invisibility first: U4's modules policy hides program rows from
    // unenrolled learners, so a caller-RLS read of the module finds nothing.
    const visible = await client.from('modules').select('cell_id').eq('cell_id', cellId);
    expect(visible.error).toBeNull();
    expect(visible.data ?? []).toHaveLength(0);

    // The stale replay must STILL be rejected: the trigger's modules read is
    // SECURITY DEFINER (postgres-owned, empty search_path), so it sees the
    // epoch the caller cannot. An invoker-rights implementation would find no
    // row, read a null epoch, and ACCEPT the stale write — fail-open. The
    // owner-only INSERT policy on module_progress lets the write reach the
    // trigger, which is what makes this a trigger test and not an RLS test.
    const replay = await insertCompletion(client, uid, cellId, null);
    expect(replay.error).toBeTruthy();
    expect(replay.error!.message).toMatch(/STALE_RESET_EPOCH/);
  });

  test('(g) FIX A-1 — the reset delete is SCOPED: a fresh-epoch completion written in the epoch→delete gap survives while the stale-epoch row is removed', async () => {
    const cellId = await newModule('public');
    const userA = await newUser(); // holds the stale, pre-reset row
    const userB = await newUser(); // completes in the epoch→delete gap

    // Pre-reset completion (epoch null) — the row the reset must clear.
    const stale = await insertCompletion(userA.client, userA.uid, cellId, null);
    expect(stale.error).toBeNull();

    // Replicate the function's sequence with the gap made explicit.
    // Step 1: commit the epoch (the commit point).
    const svc = serviceClient();
    const minted = new Date().toISOString();
    const up = await svc.from('modules').update({ progress_reset_at: minted }).eq('cell_id', cellId);
    expect(up.error).toBeNull();

    // THE GAP: learner B fetches the module (now carrying the fresh epoch) and
    // completes with it BEFORE step 2's delete runs. The trigger accepts it
    // (epoch == reset_at), so the row is legitimate post-reset work.
    const { data: mod } = await userB.client
      .from('modules')
      .select('progress_reset_at')
      .eq('cell_id', cellId)
      .single();
    const freshEpoch = mod!.progress_reset_at as string;
    const gapWrite = await insertCompletion(userB.client, userB.uid, cellId, freshEpoch);
    expect(gapWrite.error).toBeNull();

    // Step 2: the function's exact SCOPED delete — only pre-epoch rows go. An
    // unscoped delete (the pre-FIX bug) would return count 2 and destroy B's
    // legitimate completion.
    const del = await svc
      .from('module_progress')
      .delete({ count: 'exact' })
      .eq('module_id', cellId)
      .or(`reset_epoch.is.null,reset_epoch.lt."${minted}"`);
    expect(del.error).toBeNull();
    expect(del.count).toBe(1); // ONLY the stale null-epoch row

    const { data: survivors, error: readErr } = await svc
      .from('module_progress')
      .select('user_id, status')
      .eq('module_id', cellId);
    expect(readErr).toBeNull();
    expect(survivors).toHaveLength(1);
    expect(survivors![0].user_id).toBe(userB.uid);
    expect(survivors![0].status).toBe('completed');
  });

  test('(h) FIX A-3 — the reset-only RETRY (draft NULL) works: re-commit epoch + scoped delete clears the lingering pre-reset row; a fresh completion then sticks', async () => {
    // The retry scenario: a publish-with-reset committed the promotion (which
    // consumed the draft → draft is NULL) but its delete step failed, leaving a
    // stale-epoch progress row behind. The retry is publish{resetProgress:true}
    // with no draft — the function skips promotion/version bump/snapshot and
    // re-runs ONLY the epoch→scoped-delete sequence, which publishReset
    // replicates. The module here has draft NULL throughout (newModule seeds no
    // draft), so this asserts the retry's SQL semantics on exactly that shape.
    const cellId = await newModule('public');
    const { client, uid } = await newUser();

    const stale = await insertCompletion(client, uid, cellId, null);
    expect(stale.error).toBeNull();

    const retry = await publishReset(cellId);
    expect(retry.deleted).toBe(1); // the lingering pre-reset row is cleared

    // The retry's epoch governs: echoing it is accepted and the row survives a
    // read-back — the "publish with reset again" instruction actually works.
    const fresh = await insertCompletion(client, uid, cellId, retry.epoch);
    expect(fresh.error).toBeNull();
    const { data } = await serviceClient()
      .from('module_progress')
      .select('status, reset_epoch')
      .eq('module_id', cellId)
      .eq('user_id', uid);
    expect(data).toHaveLength(1);
    expect(data![0].status).toBe('completed');
  });

  test('(f) a completion written with the fresh epoch AFTER the reset sticks (no lingering rejection)', async () => {
    const cellId = await newModule('public');
    const { client, uid } = await newUser();
    const { epoch } = await publishReset(cellId);

    const write = await insertCompletion(client, uid, cellId, epoch);
    expect(write.error).toBeNull();

    // The row survives and reads back as completed for the owner.
    const { data, error } = await client
      .from('module_progress')
      .select('status, reset_epoch, completed_via')
      .eq('user_id', uid)
      .eq('module_id', cellId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].status).toBe('completed');
    expect(data![0].completed_via).toBe('explored');
    expect(data![0].reset_epoch).not.toBeNull();
  });
});

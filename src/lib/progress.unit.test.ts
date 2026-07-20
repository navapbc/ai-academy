import { describe, test, expect, beforeEach, vi } from 'vitest';
import { getSupabaseClient } from './supabaseClient';
import { createSupabaseMock } from '../test/supabaseMock';
import {
  fetchModuleProgress,
  isEpochCurrent,
  isStaleResetEpochError,
  onParticipation,
  setModuleStatus,
  shouldResubmitAfterReset,
  submitCompletion,
  recordQuizAttempt,
  recordLabSubmission,
  fetchQuizSummary,
  type ParticipationEvent,
} from './progress';

// UNIT tests for the data-access layer with the Supabase client MOCKED — no
// network, no live stack, so they always run (including in CI). These cover the
// payload shape each function sends, the row->type mapping it reads back, and
// that DB errors propagate (the functions throw; React call-sites decide how to
// handle). The live-stack integration coverage lives in progress.test.ts.
vi.mock('./supabaseClient');

const supa = createSupabaseMock();

beforeEach(() => {
  supa.reset();
  vi.mocked(getSupabaseClient).mockReturnValue(supa.client);
});

const USER = 'user-123';

describe('recordQuizAttempt', () => {
  test('inserts the mapped attempt payload into quiz_attempts', async () => {
    await recordQuizAttempt(USER, {
      moduleId: '1.4',
      score: 3,
      maxScore: 5,
      passed: false,
      answers: { '0': 1, '1': 2 },
    });

    expect(supa.fromCalls).toEqual(['quiz_attempts']);
    expect(supa.argsFor('insert')?.[0]).toEqual({
      user_id: USER,
      module_id: '1.4',
      score: 3,
      max_score: 5,
      passed: false,
      answers: { '0': 1, '1': 2 },
    });
  });

  test('propagates a DB error (does not swallow)', async () => {
    supa.setResult({ error: { message: 'insert failed' } });
    await expect(
      recordQuizAttempt(USER, { moduleId: 'm', score: 0, maxScore: 1, passed: false, answers: null }),
    ).rejects.toBeTruthy();
  });
});

describe('recordLabSubmission', () => {
  test('inserts the mapped submission payload into lab_submissions', async () => {
    // recordLabSubmission now selects + returns the new row id (P4.2), so the
    // insert resolves to a row instead of null.
    supa.setResult({ data: { id: 'sub-1' }, error: null });
    await recordLabSubmission(USER, {
      labId: '1.4',
      transcript: { answers: [], score: 2, maxScore: 3 },
      status: 'submitted',
    });

    expect(supa.fromCalls).toEqual(['lab_submissions']);
    expect(supa.argsFor('insert')?.[0]).toEqual({
      user_id: USER,
      lab_id: '1.4',
      transcript: { answers: [], score: 2, maxScore: 3 },
      status: 'submitted',
    });
  });

  test('propagates a DB error', async () => {
    supa.setResult({ error: { message: 'rls denied' } });
    await expect(
      recordLabSubmission(USER, { labId: 'l', transcript: {}, status: 'submitted' }),
    ).rejects.toBeTruthy();
  });
});

describe('setModuleStatus', () => {
  test('upserts with completed_at set when status is completed', async () => {
    await setModuleStatus(USER, '1.3', 'completed');
    expect(supa.fromCalls).toEqual(['module_progress']);
    const [payload, opts] = supa.argsFor('upsert') as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(payload.user_id).toBe(USER);
    expect(payload.module_id).toBe('1.3');
    expect(payload.status).toBe('completed');
    expect(payload.completed_at).toEqual(expect.any(String));
    // Conflict target is the (user_id, module_id) unique key.
    expect(opts).toEqual({ onConflict: 'user_id,module_id' });
  });

  // U9: completions stamp how they happened into completed_via.
  test('stamps completed_via when a via is supplied on a completion', async () => {
    await setModuleStatus(USER, '1.3', 'completed', 'quiz');
    const [payload] = supa.argsFor('upsert') as [Record<string, unknown>];
    expect(payload.completed_via).toBe('quiz');
  });

  // U9: when the via is unknown (a pre-U9 outbox entry replaying), the column
  // is OMITTED — never guessed, and an upsert-update leaves any existing value.
  test('omits completed_via entirely when the via is unknown', async () => {
    await setModuleStatus(USER, '1.3', 'completed', null);
    const [payload] = supa.argsFor('upsert') as [Record<string, unknown>];
    expect('completed_via' in payload).toBe(false);
  });

  test('leaves completed_at null and clears completed_via + reset_epoch for in_progress', async () => {
    await setModuleStatus(USER, '1.3', 'in_progress');
    const [payload] = supa.argsFor('upsert') as [Record<string, unknown>];
    expect(payload.status).toBe('in_progress');
    expect(payload.completed_at).toBeNull();
    expect(payload.completed_via).toBeNull();
    expect(payload.reset_epoch).toBeNull();
  });

  // U10: the captured reset epoch is stamped into reset_epoch on completion
  // writes (null = the module had never been reset when the work happened).
  test('stamps reset_epoch with the captured epoch on a completion', async () => {
    await setModuleStatus(USER, '1.3', 'completed', 'lab', '2026-07-10T00:00:00+00:00');
    const [payload] = supa.argsFor('upsert') as [Record<string, unknown>];
    expect(payload.reset_epoch).toBe('2026-07-10T00:00:00+00:00');
  });

  test('writes reset_epoch null on a completion when no epoch was captured', async () => {
    await setModuleStatus(USER, '1.3', 'completed', 'lab');
    const [payload] = supa.argsFor('upsert') as [Record<string, unknown>];
    expect(payload.reset_epoch).toBeNull();
  });

  test('propagates a DB error', async () => {
    supa.setResult({ error: { message: 'boom' } });
    await expect(setModuleStatus(USER, 'm', 'completed')).rejects.toBeTruthy();
  });
});

// U9: the participation seam — record functions emit {userId, moduleId, via}
// to subscribers on SUCCESSFUL writes only, so useProgress can auto-complete
// the module. No emit on failure (a lost write must not fabricate a
// completion). FIX C: the event carries the userId that performed the write so
// subscribers can ignore other users' events.
describe('participation seam (onParticipation)', () => {
  test('recordLabSubmission emits via=lab with the writer userId + lab id on success', async () => {
    supa.setResult({ data: { id: 'sub-1' }, error: null });
    const events: ParticipationEvent[] = [];
    const off = onParticipation((e) => events.push(e));

    await recordLabSubmission(USER, { labId: '2.3', transcript: {}, status: 'submitted' });

    expect(events).toEqual([{ userId: USER, moduleId: '2.3', via: 'lab' }]);
    off();
  });

  test('recordQuizAttempt emits via=quiz with the writer userId on success — any score, pass or fail', async () => {
    const events: ParticipationEvent[] = [];
    const off = onParticipation((e) => events.push(e));

    await recordQuizAttempt(USER, {
      moduleId: '1.4',
      score: 1,
      maxScore: 5,
      passed: false,
      answers: null,
    });

    expect(events).toEqual([{ userId: USER, moduleId: '1.4', via: 'quiz' }]);
    off();
  });

  test('no emit when the insert fails', async () => {
    const events: ParticipationEvent[] = [];
    const off = onParticipation((e) => events.push(e));

    supa.setResult({ error: { message: 'rls denied' } });
    await expect(
      recordLabSubmission(USER, { labId: '2.3', transcript: {}, status: 'submitted' }),
    ).rejects.toBeTruthy();
    supa.setResult({ error: { message: 'insert failed' } });
    await expect(
      recordQuizAttempt(USER, { moduleId: 'm', score: 0, maxScore: 1, passed: false, answers: null }),
    ).rejects.toBeTruthy();

    expect(events).toEqual([]);
    off();
  });

  test('unsubscribe stops delivery', async () => {
    supa.setResult({ data: { id: 'sub-1' }, error: null });
    const events: ParticipationEvent[] = [];
    const off = onParticipation((e) => events.push(e));
    off();

    await recordLabSubmission(USER, { labId: '2.3', transcript: {}, status: 'submitted' });

    expect(events).toEqual([]);
  });

  test('a throwing listener neither breaks the write nor blocks other listeners', async () => {
    supa.setResult({ data: { id: 'sub-1' }, error: null });
    const events: ParticipationEvent[] = [];
    const offBad = onParticipation(() => {
      throw new Error('listener bug');
    });
    const offGood = onParticipation((e) => events.push(e));

    await expect(
      recordLabSubmission(USER, { labId: '2.3', transcript: {}, status: 'submitted' }),
    ).resolves.toBe('sub-1');
    expect(events).toEqual([{ userId: USER, moduleId: '2.3', via: 'lab' }]);

    offBad();
    offGood();
  });
});

describe('fetchModuleProgress', () => {
  test('splits rows into completed / in_progress and picks the latest in_progress', async () => {
    // Rows come back ordered by updated_at desc, so the first in_progress is latest.
    supa.setResult({
      data: [
        { module_id: '1.5', status: 'in_progress', updated_at: '2026-06-02T10:00:00Z' },
        { module_id: '1.4', status: 'completed', updated_at: '2026-06-01T10:00:00Z' },
        { module_id: '1.3', status: 'in_progress', updated_at: '2026-05-30T10:00:00Z' },
      ],
    });

    const snap = await fetchModuleProgress(USER);
    expect(snap.completedModuleIds).toEqual(['1.4']);
    expect(snap.inProgressModuleIds).toEqual(['1.5', '1.3']);
    expect(snap.latestInProgressId).toBe('1.5');
  });

  test('returns empty snapshot when there are no rows', async () => {
    supa.setResult({ data: [] });
    const snap = await fetchModuleProgress(USER);
    expect(snap).toEqual({
      completedModuleIds: [],
      inProgressModuleIds: [],
      latestInProgressId: null,
    });
  });

  test('propagates a DB error', async () => {
    supa.setResult({ error: { message: 'select failed' } });
    await expect(fetchModuleProgress(USER)).rejects.toBeTruthy();
  });
});

describe('fetchQuizSummary', () => {
  test('maps rows to best (highest score) and latest (most recent attempt)', async () => {
    supa.setResult({
      data: [
        { score: 3, max_score: 5, passed: false, attempted_at: '2026-06-01T10:00:00Z' },
        { score: 5, max_score: 5, passed: true, attempted_at: '2026-06-02T10:00:00Z' },
        { score: 4, max_score: 5, passed: false, attempted_at: '2026-06-03T10:00:00Z' },
      ],
    });

    const summary = await fetchQuizSummary(USER, '1.4');
    expect(summary.best).toEqual({ score: 5, maxScore: 5, passed: true });
    expect(summary.latest).toEqual({ score: 4, maxScore: 5, passed: false });
  });

  test('returns nulls when a module has no attempts', async () => {
    supa.setResult({ data: [] });
    const summary = await fetchQuizSummary(USER, '1.4');
    expect(summary).toEqual({ best: null, latest: null });
  });

  test('propagates a DB error', async () => {
    supa.setResult({ error: { message: 'boom' } });
    await expect(fetchQuizSummary(USER, '1.4')).rejects.toBeTruthy();
  });
});

// --- U10: the progress-reset epoch protocol (classification logic) ----------

const STALE_ERROR = {
  message: 'STALE_RESET_EPOCH: progress for module 1.3 was reset at 2026-07-15; the supplied completion epoch (null) predates it',
  code: 'P0001',
};

describe('isStaleResetEpochError', () => {
  test('matches the dedicated trigger error by its message prefix contract', () => {
    expect(isStaleResetEpochError(STALE_ERROR)).toBe(true);
  });

  test('rejects other errors, non-objects, and message-less shapes', () => {
    expect(isStaleResetEpochError({ message: 'network down' })).toBe(false);
    expect(isStaleResetEpochError(new Error('boom'))).toBe(false);
    expect(isStaleResetEpochError('STALE_RESET_EPOCH')).toBe(false); // bare string ≠ error object
    expect(isStaleResetEpochError(null)).toBe(false);
    expect(isStaleResetEpochError(undefined)).toBe(false);
  });
});

describe('isEpochCurrent (the reconcile drop rule comparison)', () => {
  test('a never-reset module is always current', () => {
    expect(isEpochCurrent(null, null)).toBe(true);
    expect(isEpochCurrent('2026-07-01T00:00:00.000Z', null)).toBe(true);
  });

  test('an unknown captured epoch on a reset module is stale (fail-closed)', () => {
    expect(isEpochCurrent(null, '2026-07-15T00:00:00+00:00')).toBe(false);
  });

  test('compares instants, not strings — client Z format vs PostgREST +00:00 format', () => {
    // Same instant in the two formats: lexicographic comparison would get
    // these wrong ('Z' > '0'); instant comparison must call them equal.
    expect(isEpochCurrent('2026-07-15T00:00:00.000Z', '2026-07-15T00:00:00+00:00')).toBe(true);
    // Captured a millisecond earlier than the reset → stale.
    expect(isEpochCurrent('2026-07-14T23:59:59.999Z', '2026-07-15T00:00:00+00:00')).toBe(false);
    // Captured after the reset (a post-reset completion) → current.
    expect(isEpochCurrent('2026-07-15T00:00:01.000Z', '2026-07-15T00:00:00+00:00')).toBe(true);
  });
});

describe('shouldResubmitAfterReset (the genuinely-new-work refinement)', () => {
  test('true only when the work happened strictly AFTER the current reset', () => {
    expect(shouldResubmitAfterReset('2026-07-16T00:00:00.000Z', '2026-07-15T00:00:00+00:00')).toBe(true);
    expect(shouldResubmitAfterReset('2026-07-14T00:00:00.000Z', '2026-07-15T00:00:00+00:00')).toBe(false);
    // Exactly at the reset instant is NOT after it.
    expect(shouldResubmitAfterReset('2026-07-15T00:00:00.000Z', '2026-07-15T00:00:00+00:00')).toBe(false);
  });

  test('null eventAt (legacy entry) or null resetAt (unverifiable) never resubmits', () => {
    expect(shouldResubmitAfterReset(null, '2026-07-15T00:00:00+00:00')).toBe(false);
    expect(shouldResubmitAfterReset('2026-07-16T00:00:00.000Z', null)).toBe(false);
    expect(shouldResubmitAfterReset(null, null)).toBe(false);
  });
});

describe('submitCompletion — terminal vs park classification (U10)', () => {
  const EPOCH = '2026-07-01T00:00:00+00:00';
  const RESET_AT = '2026-07-15T00:00:00+00:00';

  test("a clean write resolves 'ok' with one upsert", async () => {
    supa.setResult({ error: null });
    await expect(submitCompletion(USER, '1.3', 'lab', EPOCH, EPOCH)).resolves.toBe('ok');
    expect(supa.fromCalls).toEqual(['module_progress']);
  });

  test("a non-stale failure resolves 'retry' (today's park-and-retry semantics) without refetching", async () => {
    supa.setResult({ error: { message: 'fetch failed: offline' } });
    await expect(submitCompletion(USER, '1.3', 'lab', EPOCH, EPOCH)).resolves.toBe('retry');
    // No epoch refetch, no resubmit — the entry just parks.
    expect(supa.fromCalls).toEqual(['module_progress']);
  });

  test("a stale rejection whose eventAt PREDATES the reset resolves 'reset' (terminal, no resubmit)", async () => {
    supa.queueResults(
      { error: STALE_ERROR }, // the completion write
      { data: { progress_reset_at: RESET_AT }, error: null }, // the one refetch
    );
    await expect(
      submitCompletion(USER, '1.3', 'lab', EPOCH, '2026-07-02T00:00:00.000Z'),
    ).resolves.toBe('reset');
    expect(supa.fromCalls).toEqual(['module_progress', 'modules']);
  });

  // The stale-session rule: work done AFTER the reset (eventAt > T1) is
  // genuinely new — refetch the epoch ONCE and resubmit with it.
  test("a stale rejection whose eventAt POSTDATES the reset refetches once and resubmits with the fresh epoch → 'ok'", async () => {
    supa.queueResults(
      { error: STALE_ERROR }, // original write (stale in-memory epoch)
      { data: { progress_reset_at: RESET_AT }, error: null }, // refetch
      { error: null }, // resubmit with the fresh epoch
    );
    await expect(
      submitCompletion(USER, '1.3', 'lab', EPOCH, '2026-07-16T00:00:00.000Z'),
    ).resolves.toBe('ok');
    expect(supa.fromCalls).toEqual(['module_progress', 'modules', 'module_progress']);
    // The resubmit carries the FRESH epoch (the refetched progress_reset_at).
    const upserts = supa.ops.filter((o) => o.method === 'upsert');
    expect(upserts).toHaveLength(2);
    expect((upserts[1].args[0] as Record<string, unknown>).reset_epoch).toBe(RESET_AT);
  });

  test("a module the caller can no longer see (refetch → no row) resolves 'reset' (fail-closed)", async () => {
    supa.queueResults(
      { error: STALE_ERROR },
      { data: null, error: null }, // RLS hides the module → maybeSingle → null
    );
    await expect(
      submitCompletion(USER, '1.3', 'lab', null, '2026-07-16T00:00:00.000Z'),
    ).resolves.toBe('reset');
  });

  test("a transient refetch failure resolves 'retry' — the entry stays parked and the trigger re-adjudicates next replay", async () => {
    supa.queueResults(
      { error: STALE_ERROR },
      { error: { message: 'fetch failed: offline' } }, // the refetch itself fails
    );
    await expect(
      submitCompletion(USER, '1.3', 'lab', null, '2026-07-16T00:00:00.000Z'),
    ).resolves.toBe('retry');
  });

  test("a resubmit rejected stale AGAIN (a second reset raced us) resolves 'reset'", async () => {
    supa.queueResults(
      { error: STALE_ERROR },
      { data: { progress_reset_at: RESET_AT }, error: null },
      { error: STALE_ERROR }, // another reset landed between refetch and resubmit
    );
    await expect(
      submitCompletion(USER, '1.3', 'lab', null, '2026-07-16T00:00:00.000Z'),
    ).resolves.toBe('reset');
  });
});

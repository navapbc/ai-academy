import { describe, test, expect, beforeEach, vi } from 'vitest';
import { getSupabaseClient } from './supabaseClient';
import { createSupabaseMock } from '../test/supabaseMock';
import {
  fetchModuleProgress,
  onParticipation,
  setModuleStatus,
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

  test('leaves completed_at null and clears completed_via for in_progress', async () => {
    await setModuleStatus(USER, '1.3', 'in_progress');
    const [payload] = supa.argsFor('upsert') as [Record<string, unknown>];
    expect(payload.status).toBe('in_progress');
    expect(payload.completed_at).toBeNull();
    expect(payload.completed_via).toBeNull();
  });

  test('propagates a DB error', async () => {
    supa.setResult({ error: { message: 'boom' } });
    await expect(setModuleStatus(USER, 'm', 'completed')).rejects.toBeTruthy();
  });
});

// U9: the participation seam — record functions emit {moduleId, via} to
// subscribers on SUCCESSFUL writes only, so useProgress can auto-complete the
// module. No emit on failure (a lost write must not fabricate a completion).
describe('participation seam (onParticipation)', () => {
  test('recordLabSubmission emits via=lab with the lab id on success', async () => {
    supa.setResult({ data: { id: 'sub-1' }, error: null });
    const events: ParticipationEvent[] = [];
    const off = onParticipation((e) => events.push(e));

    await recordLabSubmission(USER, { labId: '2.3', transcript: {}, status: 'submitted' });

    expect(events).toEqual([{ moduleId: '2.3', via: 'lab' }]);
    off();
  });

  test('recordQuizAttempt emits via=quiz on success — any score, pass or fail', async () => {
    const events: ParticipationEvent[] = [];
    const off = onParticipation((e) => events.push(e));

    await recordQuizAttempt(USER, {
      moduleId: '1.4',
      score: 1,
      maxScore: 5,
      passed: false,
      answers: null,
    });

    expect(events).toEqual([{ moduleId: '1.4', via: 'quiz' }]);
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
    expect(events).toEqual([{ moduleId: '2.3', via: 'lab' }]);

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

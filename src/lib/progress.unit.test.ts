import { describe, test, expect, beforeEach, vi } from 'vitest';
import { getSupabaseClient } from './supabaseClient';
import { createSupabaseMock } from '../test/supabaseMock';
import {
  fetchModuleProgress,
  setModuleStatus,
  recordQuizAttempt,
  recordLabSubmission,
  fetchQuizSummary,
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

  test('leaves completed_at null for in_progress', async () => {
    await setModuleStatus(USER, '1.3', 'in_progress');
    const [payload] = supa.argsFor('upsert') as [Record<string, unknown>];
    expect(payload.status).toBe('in_progress');
    expect(payload.completed_at).toBeNull();
  });

  test('propagates a DB error', async () => {
    supa.setResult({ error: { message: 'boom' } });
    await expect(setModuleStatus(USER, 'm', 'completed')).rejects.toBeTruthy();
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

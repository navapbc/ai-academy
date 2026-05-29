import { describe, test, expect, beforeAll } from 'vitest';
import { getSupabaseClient } from './supabaseClient';
import {
  fetchModuleProgress,
  setModuleStatus,
  recordQuizAttempt,
  fetchQuizSummary,
} from './progress';

// Integration tests against the LOCAL Supabase stack. Require `npx supabase
// start` and the seeded demo user (demo@nava.dev / demo-password). RLS is
// owner-only, so we sign in first and every read/write is scoped to that user.
//
// The schema defines no delete policy, so test rows cannot be removed as the
// demo user. To stay deterministic we use a fixed module id for the upsert
// tests (re-runs update the same row) and a per-run unique module id for the
// append-only quiz tests (each run only sees its own attempts). `supabase db
// reset` clears accumulation.

const DEMO_EMAIL = 'demo@nava.dev';
const DEMO_PASSWORD = 'demo-password';
const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';

beforeAll(async () => {
  const { error } = await getSupabaseClient().auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  if (error) throw error;
});

describe('setModuleStatus + fetchModuleProgress', () => {
  test('upserts a module to completed and surfaces it as completed (idempotent)', async () => {
    const moduleId = 'test-mp-complete';

    // First mark in_progress, then completed — the unique (user_id, module_id)
    // key means this updates one row, it does not create two.
    await setModuleStatus(DEMO_USER_ID, moduleId, 'in_progress');
    await setModuleStatus(DEMO_USER_ID, moduleId, 'completed');

    const snapshot = await fetchModuleProgress(DEMO_USER_ID);
    expect(snapshot.completedModuleIds).toContain(moduleId);
    expect(snapshot.inProgressModuleIds).not.toContain(moduleId);
  });

  test('reports an in_progress module and exposes it as latestInProgressId', async () => {
    const moduleId = 'test-mp-inprogress';
    await setModuleStatus(DEMO_USER_ID, moduleId, 'in_progress');

    const snapshot = await fetchModuleProgress(DEMO_USER_ID);
    expect(snapshot.inProgressModuleIds).toContain(moduleId);
    // The most recently updated in_progress row wins.
    expect(snapshot.latestInProgressId).toBe(moduleId);
  });
});

describe('recordQuizAttempt + fetchQuizSummary', () => {
  test('records attempts and returns the best and latest', async () => {
    const moduleId = `test-quiz-${Date.now()}`;

    await recordQuizAttempt(DEMO_USER_ID, {
      moduleId,
      score: 3,
      maxScore: 5,
      passed: false,
      answers: { '0': 1, '1': 2 },
    });
    await recordQuizAttempt(DEMO_USER_ID, {
      moduleId,
      score: 5,
      maxScore: 5,
      passed: true,
      answers: { '0': 0, '1': 0 },
    });
    await recordQuizAttempt(DEMO_USER_ID, {
      moduleId,
      score: 4,
      maxScore: 5,
      passed: false,
      answers: null,
    });

    const summary = await fetchQuizSummary(DEMO_USER_ID, moduleId);
    expect(summary.best).toEqual({ score: 5, maxScore: 5, passed: true });
    expect(summary.latest).toEqual({ score: 4, maxScore: 5, passed: false });
  });

  test('returns nulls when a module has no attempts', async () => {
    const summary = await fetchQuizSummary(DEMO_USER_ID, `test-quiz-none-${Date.now()}`);
    expect(summary.best).toBeNull();
    expect(summary.latest).toBeNull();
  });
});

import { describe, test, expect, beforeAll } from 'vitest';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import {
  fetchModuleProgress,
  setModuleStatus,
  recordQuizAttempt,
  fetchQuizSummary,
} from './progress';

// Integration tests against the LOCAL Supabase stack. Require `npx supabase
// start` and the seeded demo user (demo@navapbc.com / demo-password — the
// address is @navapbc.com so it passes the enforce_allowed_email_domain
// trigger). RLS is owner-only, so we sign in first and every read/write is
// scoped to that user.
//
// These tests only run when a live stack is reachable. Without config (e.g. CI)
// or with the stack down, they SKIP rather than fail — the pure unit suites
// (progressCache, resolveCurrentModuleId) always run. So `npm run test:run` is
// green everywhere; the integration coverage kicks in once a seeded local stack
// is up.
//
// The schema defines no delete policy, so test rows cannot be removed as the
// demo user. To stay deterministic we use a fixed module id for the upsert
// tests (re-runs update the same row) and a per-run unique module id for the
// append-only quiz tests (each run only sees its own attempts). `supabase db
// reset` clears accumulation.

const DEMO_EMAIL = 'demo@navapbc.com';
const DEMO_PASSWORD = 'demo-password';
const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * True only when a local Supabase stack is actually reachable. Covers both the
 * no-config case (CI) and the configured-but-down case (forgot `supabase
 * start`): any HTTP answer from the REST endpoint means the stack is up; a
 * network error or timeout means it isn't.
 */
async function detectLiveStack(): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  try {
    const res = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(2000),
    });
    return res.status < 500;
  } catch {
    return false;
  }
}

const hasLiveStack = await detectLiveStack();

if (!hasLiveStack) {
  console.info(
    '[progress.test] Skipping Supabase integration tests: no reachable local stack. ' +
      'Set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY and run `npx supabase start` to enable them.',
  );
}

beforeAll(async () => {
  // No-op when skipping, so a missing/down stack never throws here.
  if (!hasLiveStack) return;
  const { error } = await getSupabaseClient().auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  if (error) throw error;
});

describe.skipIf(!hasLiveStack)('setModuleStatus + fetchModuleProgress', () => {
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

describe.skipIf(!hasLiveStack)('recordQuizAttempt + fetchQuizSummary', () => {
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

// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useProgress } from './useProgress';
import { addPendingCompletion, readPendingCompletions } from './pendingWrites';
import { writeProgressCache } from './progressCache';
import { fetchModuleProgress, setModuleStatus } from './progress';

// D-01 regression (audit 2026-06-09): the progress cache and pending-writes
// outbox are keyed per user. On a SHARED BROWSER, user B signing in after
// user A must (a) hydrate a clean slate, not A's cache, and (b) never have
// A's parked offline completion replayed under B's user id — that was the
// cross-account `module_progress` write of the original defect.
//
// `./progress` (the Supabase data-access layer) is mocked; each hook instance
// simulates a fresh sign-in (App remounts AcademyApp keyed on session.user.id).
vi.mock('./progress', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./progress')>();
  return {
    ...actual,
    fetchModuleProgress: vi.fn(),
    setModuleStatus: vi.fn(),
  };
});

const USER_A = 'user-aaa';
const USER_B = 'user-bbb';
const MODULES = ['1.1', '1.2', '1.3'];

const emptySnapshot = {
  completedModuleIds: [],
  inProgressModuleIds: [],
  latestInProgressId: null,
};

beforeEach(() => {
  localStorage.clear();
  vi.mocked(fetchModuleProgress).mockResolvedValue(emptySnapshot);
  vi.mocked(setModuleStatus).mockResolvedValue(undefined);
  vi.mocked(setModuleStatus).mockClear();
  vi.mocked(fetchModuleProgress).mockClear();
});

describe('useProgress across two users on one browser (D-01)', () => {
  test("user B hydrates a clean slate, not user A's cached progress", async () => {
    // User A's session left a populated cache behind.
    writeProgressCache(USER_A, { completedModuleIds: ['1.1', '1.2'], currentModuleId: '1.3' });

    const { result, unmount } = renderHook(() => useProgress(USER_B, MODULES));
    // Initial paint: nothing inherited from A.
    expect(result.current.progress.completedModuleIds).toEqual([]);
    expect(result.current.progress.currentModuleId).toBe('1.1');
    await waitFor(() => expect(fetchModuleProgress).toHaveBeenCalledWith(USER_B));
    // After reconcile, still nothing of A's unioned in.
    expect(result.current.progress.completedModuleIds).toEqual([]);
    unmount();
  });

  test("user A's parked offline completion is never written under user B's id", async () => {
    // A completed 1.1 offline; the write failed and was parked in A's outbox.
    addPendingCompletion(USER_A, '1.1');

    // B signs in on the same browser; the reconcile retries parked writes.
    const { unmount } = renderHook(() => useProgress(USER_B, MODULES));
    await waitFor(() => expect(fetchModuleProgress).toHaveBeenCalledWith(USER_B));
    // The retry loop must not have replayed A's module under B.
    expect(setModuleStatus).not.toHaveBeenCalled();
    // And A's parked write is still safely queued for A.
    expect(readPendingCompletions(USER_A)).toEqual(['1.1']);
    unmount();
  });

  test("user A's parked completion IS retried — under A's id — when A returns", async () => {
    addPendingCompletion(USER_A, '1.1');

    const { unmount } = renderHook(() => useProgress(USER_A, MODULES));
    await waitFor(() => expect(setModuleStatus).toHaveBeenCalledWith(USER_A, '1.1', 'completed'));
    // Confirmed write is drained from the outbox.
    await waitFor(() => expect(readPendingCompletions(USER_A)).toEqual([]));
    unmount();
  });
});

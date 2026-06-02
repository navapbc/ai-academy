// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useProgress } from './useProgress';

// Hook-level tests for progress ownership. The data layer is mocked so the
// optimistic local updates and the Supabase-sync calls can be observed without
// a network. resolveCurrentModuleId (the pure picker) is covered separately in
// resolveCurrentModuleId.test.ts.
const { fetchModuleProgress, setModuleStatus } = vi.hoisted(() => ({
  fetchModuleProgress: vi.fn(),
  setModuleStatus: vi.fn(async () => {}),
}));
vi.mock('./progress', () => ({ fetchModuleProgress, setModuleStatus }));

const ALL = ['m0', 'm1', 'm2'];

beforeEach(() => {
  localStorage.clear();
  fetchModuleProgress.mockReset();
  setModuleStatus.mockReset();
  setModuleStatus.mockResolvedValue(undefined);
  fetchModuleProgress.mockResolvedValue({
    completedModuleIds: [],
    inProgressModuleIds: [],
    latestInProgressId: null,
  });
});

describe('completeModule', () => {
  test('marks complete, advances the cursor, and syncs status=completed', async () => {
    const { result } = renderHook(() => useProgress('u1', ALL));
    await waitFor(() => expect(result.current.progress.currentModuleId).toBe('m0'));

    act(() => result.current.completeModule('m0'));

    expect(result.current.progress.completedModuleIds).toContain('m0');
    expect(result.current.progress.currentModuleId).toBe('m1');
    expect(setModuleStatus).toHaveBeenCalledWith('u1', 'm0', 'completed');
  });

  test('completing the last module keeps the cursor on it (no overrun)', async () => {
    const { result } = renderHook(() => useProgress('u1', ALL));
    await waitFor(() => expect(result.current.progress.currentModuleId).toBe('m0'));
    act(() => result.current.completeModule('m2'));
    expect(result.current.progress.currentModuleId).toBe('m2');
  });
});

describe('selectModule', () => {
  test('moves the cursor and records the module in_progress', async () => {
    const { result } = renderHook(() => useProgress('u1', ALL));
    await waitFor(() => expect(result.current.progress.currentModuleId).toBe('m0'));
    act(() => result.current.selectModule('m2'));
    expect(result.current.progress.currentModuleId).toBe('m2');
    expect(setModuleStatus).toHaveBeenCalledWith('u1', 'm2', 'in_progress');
  });
});

describe('sync-failure handling', () => {
  test('a failed completion keeps the optimistic local state and surfaces a non-blocking error', async () => {
    setModuleStatus.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useProgress('u1', ALL));
    await waitFor(() => expect(result.current.progress.currentModuleId).toBe('m0'));

    act(() => result.current.completeModule('m0'));

    // Local state stays optimistic even though the write failed.
    expect(result.current.progress.completedModuleIds).toContain('m0');
    await waitFor(() => expect(result.current.error).toBeTruthy());
  });

  // DOCUMENTS: DATA-02 — completeModule's catch message promises "It will retry
  // later," but there is NO retry/outbox anywhere. On the next mount the
  // reconcile effect REPLACES local state with the server snapshot, silently
  // dropping the failed completion (and possibly re-locking gated content).
  // Unskip once a real retry/flush-on-reconnect (or a merge-not-replace
  // reconcile) exists.
  test.skip('a failed completion is retried/flushed so it is not silently lost (DOCUMENTS: DATA-02)', async () => {
    setModuleStatus.mockRejectedValueOnce(new Error('offline'));
    const { result, rerender } = renderHook(() => useProgress('u1', ALL));
    await waitFor(() => expect(result.current.progress.currentModuleId).toBe('m0'));
    act(() => result.current.completeModule('m0'));

    // Desired contract: the pending write is retried (e.g. on next reconcile).
    setModuleStatus.mockResolvedValue(undefined);
    rerender();
    const calls = setModuleStatus.mock.calls as unknown as Array<[string, string, string]>;
    await waitFor(() =>
      expect(calls.filter((c) => c[1] === 'm0' && c[2] === 'completed').length).toBeGreaterThan(1),
    );
  });
});

// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useProgress } from './useProgress';

// In-memory Storage stand-in (node environment, no jsdom) — same pattern as
// progressCache.test.ts.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
}

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
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
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

  // DATA-02 — a failed completion is parked in the outbox and retried on the
  // next reconcile (and merged, not dropped), so it is never silently lost.
  test('a failed completion is retried on the next reconcile and not dropped (DATA-02)', async () => {
    // The optimistic write fails; the reconcile-time retry then succeeds.
    setModuleStatus.mockRejectedValueOnce(new Error('offline'));
    const { result, rerender } = renderHook(({ ids }) => useProgress('u1', ids), {
      initialProps: { ids: ALL },
    });
    await waitFor(() => expect(result.current.progress.currentModuleId).toBe('m0'));

    act(() => result.current.completeModule('m0'));
    expect(result.current.progress.completedModuleIds).toContain('m0');
    await waitFor(() => expect(result.current.error).toBeTruthy());

    // From now on writes succeed; re-running the reconcile effect (new ids
    // array ref) flushes the outbox.
    setModuleStatus.mockResolvedValue(undefined);
    rerender({ ids: [...ALL] });

    const calls = setModuleStatus.mock.calls as unknown as Array<[string, string, string]>;
    await waitFor(() =>
      expect(calls.filter((c) => c[1] === 'm0' && c[2] === 'completed').length).toBeGreaterThan(1),
    );
    // The completion survives reconcile (merge, not replace).
    expect(result.current.progress.completedModuleIds).toContain('m0');
  });
});

describe('gating-aware advance (FE-03)', () => {
  test('completeModule skips a locked next module and lands on the first unlocked one', async () => {
    // m2 is "locked" until m0 AND m1 are both complete; completing m0 must not
    // advance onto m2 — it should land on m1 (the next unlocked module).
    const isLocked = (id: string, completed: string[]) =>
      id === 'm2' && !(completed.includes('m0') && completed.includes('m1'));

    const { result } = renderHook(() => useProgress('u1', ALL, isLocked));
    await waitFor(() => expect(result.current.progress.currentModuleId).toBe('m0'));

    act(() => result.current.completeModule('m0'));
    expect(result.current.progress.currentModuleId).toBe('m1');
  });

  test('advancing past the last unlocked module stays put rather than landing on a locked one', async () => {
    // Everything after m0 is locked → cursor stays on m0.
    const isLocked = (id: string) => id !== 'm0';
    const { result } = renderHook(() => useProgress('u1', ALL, isLocked));
    await waitFor(() => expect(result.current.progress.currentModuleId).toBe('m0'));
    act(() => result.current.completeModule('m0'));
    expect(result.current.progress.currentModuleId).toBe('m0');
  });
});

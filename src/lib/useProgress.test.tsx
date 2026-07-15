// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useProgress } from './useProgress';
import type { ParticipationEvent } from './progress';

// Hook-level tests for progress ownership. The data layer is mocked so the
// optimistic local updates and the Supabase-sync calls can be observed without
// a network. The participation seam (U9) is mocked as a real listener set so
// tests can emit events and assert the hook's subscription behavior.
// resolveCurrentModuleId (the pure picker) is covered separately in
// resolveCurrentModuleId.test.ts.
const { fetchModuleProgress, setModuleStatus, onParticipation, listeners } = vi.hoisted(() => {
  const listeners = new Set<(e: { moduleId: string; via: string }) => void>();
  return {
    fetchModuleProgress: vi.fn(),
    setModuleStatus: vi.fn(async () => {}),
    listeners,
    onParticipation: vi.fn((cb: (e: { moduleId: string; via: string }) => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }),
  };
});
vi.mock('./progress', () => ({ fetchModuleProgress, setModuleStatus, onParticipation }));

function emit(event: ParticipationEvent) {
  for (const cb of [...listeners]) cb(event);
}

const ALL = ['m0', 'm1', 'm2'];

beforeEach(() => {
  localStorage.clear();
  listeners.clear();
  fetchModuleProgress.mockReset();
  setModuleStatus.mockReset();
  onParticipation.mockClear();
  setModuleStatus.mockResolvedValue(undefined);
  fetchModuleProgress.mockResolvedValue({
    completedModuleIds: [],
    inProgressModuleIds: [],
    latestInProgressId: null,
  });
});

describe('completeModule', () => {
  test('marks complete, advances the cursor, and syncs status=completed with its via', async () => {
    const { result } = renderHook(() => useProgress('u1', ALL));
    await waitFor(() => expect(result.current.progress.currentModuleId).toBe('m0'));

    act(() => result.current.completeModule('m0', 'explored'));

    expect(result.current.progress.completedModuleIds).toContain('m0');
    expect(result.current.progress.currentModuleId).toBe('m1');
    expect(setModuleStatus).toHaveBeenCalledWith('u1', 'm0', 'completed', 'explored');
  });

  test('completing the last module keeps the cursor on it (no overrun)', async () => {
    const { result } = renderHook(() => useProgress('u1', ALL));
    await waitFor(() => expect(result.current.progress.currentModuleId).toBe('m0'));
    act(() => result.current.completeModule('m2', 'explored'));
    expect(result.current.progress.currentModuleId).toBe('m2');
  });

  // U9 idempotence: the FIRST completion owns the write — a repeat never
  // writes again, so completed_via is never re-stamped.
  test('a repeat completion never writes a second time (via not re-stamped)', async () => {
    const { result } = renderHook(() => useProgress('u1', ALL));
    await waitFor(() => expect(result.current.progress.currentModuleId).toBe('m0'));

    act(() => result.current.completeModule('m0', 'explored'));
    act(() => result.current.completeModule('m0', 'lab'));

    const calls = setModuleStatus.mock.calls as unknown as Array<
      [string, string, string, string]
    >;
    const completedWrites = calls.filter((c) => c[1] === 'm0' && c[2] === 'completed');
    expect(completedWrites).toEqual([['u1', 'm0', 'completed', 'explored']]);
  });

  // The GLAT-Finish scenario: the seam already completed the module (no
  // advance), then the learner clicks the explicit Finish/Continue button —
  // it must still navigate, without writing or re-stamping.
  test('an explicit completion after a seam completion still advances the cursor (no second write)', async () => {
    const { result } = renderHook(() => useProgress('u1', ALL));
    await waitFor(() => expect(result.current.progress.currentModuleId).toBe('m0'));

    act(() => emit({ moduleId: 'm0', via: 'quiz' }));
    expect(result.current.progress.currentModuleId).toBe('m0'); // seam: no advance

    act(() => result.current.completeModule('m0', 'quiz')); // explicit Finish
    expect(result.current.progress.currentModuleId).toBe('m1');

    const calls = setModuleStatus.mock.calls as unknown as Array<
      [string, string, string, string]
    >;
    expect(calls.filter((c) => c[1] === 'm0' && c[2] === 'completed')).toHaveLength(1);
  });
});

describe('participation seam subscription (U9)', () => {
  test('a participation event completes the module with its via WITHOUT moving the cursor', async () => {
    const { result } = renderHook(() => useProgress('u1', ALL));
    await waitFor(() => expect(result.current.progress.currentModuleId).toBe('m0'));
    expect(onParticipation).toHaveBeenCalled();

    // The learner submits the lab of the module they're on.
    act(() => emit({ moduleId: 'm0', via: 'lab' }));

    expect(result.current.progress.completedModuleIds).toContain('m0');
    // Completion is an event, not navigation: the learner stays put.
    expect(result.current.progress.currentModuleId).toBe('m0');
    expect(setModuleStatus).toHaveBeenCalledWith('u1', 'm0', 'completed', 'lab');
  });

  test('a finished quiz attempt completes with via=quiz', async () => {
    const { result } = renderHook(() => useProgress('u1', ALL));
    await waitFor(() => expect(result.current.progress.currentModuleId).toBe('m0'));

    act(() => emit({ moduleId: 'm1', via: 'quiz' }));

    expect(result.current.progress.completedModuleIds).toContain('m1');
    expect(setModuleStatus).toHaveBeenCalledWith('u1', 'm1', 'completed', 'quiz');
  });

  test('an event for a module outside the visible curriculum is ignored', async () => {
    const { result } = renderHook(() => useProgress('u1', ALL));
    await waitFor(() => expect(result.current.progress.currentModuleId).toBe('m0'));

    act(() => emit({ moduleId: 'ghost', via: 'lab' }));

    expect(result.current.progress.completedModuleIds).not.toContain('ghost');
    expect(setModuleStatus).not.toHaveBeenCalledWith('u1', 'ghost', 'completed', 'lab');
  });

  test('unmount unsubscribes from the seam', async () => {
    const { result, unmount } = renderHook(() => useProgress('u1', ALL));
    await waitFor(() => expect(result.current.progress.currentModuleId).toBe('m0'));
    expect(listeners.size).toBeGreaterThan(0);
    unmount();
    expect(listeners.size).toBe(0);
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

    act(() => result.current.completeModule('m0', 'explored'));

    // Local state stays optimistic even though the write failed.
    expect(result.current.progress.completedModuleIds).toContain('m0');
    await waitFor(() => expect(result.current.error).toBeTruthy());
  });

  // DATA-02 — a failed completion is parked in the outbox and retried on the
  // next reconcile (and merged, not dropped), so it is never silently lost.
  // U9: the replay carries the original via so completed_via is stamped intact.
  test('a failed completion is retried on the next reconcile with its via intact (DATA-02/U9)', async () => {
    // The optimistic write fails; the reconcile-time retry then succeeds.
    setModuleStatus.mockRejectedValueOnce(new Error('offline'));
    const { result, rerender } = renderHook(({ ids }) => useProgress('u1', ids), {
      initialProps: { ids: ALL },
    });
    await waitFor(() => expect(result.current.progress.currentModuleId).toBe('m0'));

    act(() => result.current.completeModule('m0', 'quiz'));
    expect(result.current.progress.completedModuleIds).toContain('m0');
    await waitFor(() => expect(result.current.error).toBeTruthy());

    // From now on writes succeed; re-running the reconcile effect (new ids
    // array ref) flushes the outbox.
    setModuleStatus.mockResolvedValue(undefined);
    rerender({ ids: [...ALL] });

    const calls = setModuleStatus.mock.calls as unknown as Array<
      [string, string, string, string | null]
    >;
    await waitFor(() =>
      expect(calls.filter((c) => c[1] === 'm0' && c[2] === 'completed').length).toBeGreaterThan(1),
    );
    // The replayed write carries the via the completion was earned with.
    const replay = calls.filter((c) => c[1] === 'm0' && c[2] === 'completed').at(-1)!;
    expect(replay[3]).toBe('quiz');
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

    act(() => result.current.completeModule('m0', 'explored'));
    expect(result.current.progress.currentModuleId).toBe('m1');
  });

  test('advancing past the last unlocked module stays put rather than landing on a locked one', async () => {
    // Everything after m0 is locked → cursor stays on m0.
    const isLocked = (id: string) => id !== 'm0';
    const { result } = renderHook(() => useProgress('u1', ALL, isLocked));
    await waitFor(() => expect(result.current.progress.currentModuleId).toBe('m0'));
    act(() => result.current.completeModule('m0', 'explored'));
    expect(result.current.progress.currentModuleId).toBe('m0');
  });
});

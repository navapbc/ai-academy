// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useProgress } from './useProgress';
import { addPendingCompletion, readPendingCompletions } from './pendingWrites';
import type { CompletionSyncOutcome, ParticipationEvent } from './progress';

// Hook-level tests for progress ownership. The data layer is mocked so the
// optimistic local updates and the Supabase-sync calls can be observed without
// a network. Completion writes flow through submitCompletion (U10), which
// resolves to a classification: 'ok' | 'retry' (park + replay) | 'reset'
// (terminal — the STALE_RESET_EPOCH drop). The participation seam (U9) is
// mocked as a real listener set so tests can emit events and assert the hook's
// subscription behavior. resolveCurrentModuleId (the pure picker) is covered
// separately in resolveCurrentModuleId.test.ts; isEpochCurrent (the reconcile
// comparison) is the real implementation, imported from the actual module.
const { fetchModuleProgress, setModuleStatus, submitCompletion, onParticipation, listeners } =
  vi.hoisted(() => {
    const listeners = new Set<(e: { moduleId: string; via: string }) => void>();
    return {
      fetchModuleProgress: vi.fn(),
      setModuleStatus: vi.fn(async () => {}),
      submitCompletion: vi.fn(async (): Promise<CompletionSyncOutcome> => 'ok'),
      listeners,
      onParticipation: vi.fn((cb: (e: { moduleId: string; via: string }) => void) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      }),
    };
  });
vi.mock('./progress', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./progress')>();
  return {
    ...actual, // keeps the real isEpochCurrent for the reconcile drop rule
    fetchModuleProgress,
    setModuleStatus,
    submitCompletion,
    onParticipation,
  };
});

function emit(event: ParticipationEvent) {
  for (const cb of [...listeners]) cb(event);
}

const ALL = ['m0', 'm1', 'm2'];

const emptySnapshot = {
  completedModuleIds: [],
  inProgressModuleIds: [],
  latestInProgressId: null,
};

beforeEach(() => {
  localStorage.clear();
  listeners.clear();
  fetchModuleProgress.mockReset();
  setModuleStatus.mockReset();
  submitCompletion.mockReset();
  onParticipation.mockClear();
  setModuleStatus.mockResolvedValue(undefined);
  submitCompletion.mockResolvedValue('ok');
  fetchModuleProgress.mockResolvedValue(emptySnapshot);
});

describe('completeModule', () => {
  test('marks complete, advances the cursor, and syncs the completion with its via', async () => {
    const { result } = renderHook(() => useProgress('u1', ALL));
    await waitFor(() => expect(result.current.progress.currentModuleId).toBe('m0'));

    act(() => result.current.completeModule('m0', 'explored'));

    expect(result.current.progress.completedModuleIds).toContain('m0');
    expect(result.current.progress.currentModuleId).toBe('m1');
    // No getResetEpoch supplied → epoch null; eventAt is captured at event time.
    expect(submitCompletion).toHaveBeenCalledWith('u1', 'm0', 'explored', null, expect.any(String));
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

    const calls = submitCompletion.mock.calls as unknown as Array<[string, string, string]>;
    const writes = calls.filter((c) => c[1] === 'm0');
    expect(writes).toHaveLength(1);
    expect(writes[0][2]).toBe('explored');
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

    const calls = submitCompletion.mock.calls as unknown as Array<[string, string]>;
    expect(calls.filter((c) => c[1] === 'm0')).toHaveLength(1);
  });

  // U10 capture-at-completion-time: the epoch travels from the in-memory
  // module object (getResetEpoch) into the write, at the moment of completion.
  test('captures the module reset epoch from getResetEpoch at completion time', async () => {
    const getResetEpoch = (id: string) => (id === 'm0' ? '2026-07-10T00:00:00.000Z' : null);
    const { result } = renderHook(() => useProgress('u1', ALL, undefined, getResetEpoch));
    await waitFor(() => expect(result.current.progress.currentModuleId).toBe('m0'));

    act(() => result.current.completeModule('m0', 'explored'));

    expect(submitCompletion).toHaveBeenCalledWith(
      'u1',
      'm0',
      'explored',
      '2026-07-10T00:00:00.000Z',
      expect.any(String),
    );
    // ...and the captured epoch is persisted with the completion (cache shape).
    expect(result.current.progress.completionEpochs?.m0).toBe('2026-07-10T00:00:00.000Z');
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
    expect(submitCompletion).toHaveBeenCalledWith('u1', 'm0', 'lab', null, expect.any(String));
  });

  test('a finished quiz attempt completes with via=quiz', async () => {
    const { result } = renderHook(() => useProgress('u1', ALL));
    await waitFor(() => expect(result.current.progress.currentModuleId).toBe('m0'));

    act(() => emit({ moduleId: 'm1', via: 'quiz' }));

    expect(result.current.progress.completedModuleIds).toContain('m1');
    expect(submitCompletion).toHaveBeenCalledWith('u1', 'm1', 'quiz', null, expect.any(String));
  });

  test('an event for a module outside the visible curriculum is ignored', async () => {
    const { result } = renderHook(() => useProgress('u1', ALL));
    await waitFor(() => expect(result.current.progress.currentModuleId).toBe('m0'));

    act(() => emit({ moduleId: 'ghost', via: 'lab' }));

    expect(result.current.progress.completedModuleIds).not.toContain('ghost');
    expect(submitCompletion).not.toHaveBeenCalled();
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
  test('a transient failure keeps the optimistic local state and surfaces a non-blocking error', async () => {
    submitCompletion.mockResolvedValueOnce('retry');
    const { result } = renderHook(() => useProgress('u1', ALL));
    await waitFor(() => expect(result.current.progress.currentModuleId).toBe('m0'));

    act(() => result.current.completeModule('m0', 'explored'));

    // Local state stays optimistic even though the write failed.
    expect(result.current.progress.completedModuleIds).toContain('m0');
    await waitFor(() => expect(result.current.error).toBeTruthy());
  });

  // DATA-02 — a failed completion is parked in the outbox and retried on the
  // next reconcile (and merged, not dropped), so it is never silently lost.
  // U9/U10: the replay carries the original via AND the captured epoch/eventAt.
  test('a failed completion is retried on the next reconcile with via + epoch intact (DATA-02/U10)', async () => {
    // The optimistic write fails transiently; the reconcile-time retry succeeds.
    submitCompletion.mockResolvedValueOnce('retry');
    const getResetEpoch = () => '2026-07-01T00:00:00.000Z';
    const { result, rerender } = renderHook(
      ({ ids }) => useProgress('u1', ids, undefined, getResetEpoch),
      { initialProps: { ids: ALL } },
    );
    await waitFor(() => expect(result.current.progress.currentModuleId).toBe('m0'));

    act(() => result.current.completeModule('m0', 'quiz'));
    expect(result.current.progress.completedModuleIds).toContain('m0');
    await waitFor(() => expect(result.current.error).toBeTruthy());
    // Parked with the captured epoch + eventAt.
    expect(readPendingCompletions('u1')).toEqual([
      { id: 'm0', via: 'quiz', epoch: '2026-07-01T00:00:00.000Z', eventAt: expect.any(String) },
    ]);

    // From now on writes succeed; re-running the reconcile effect (new ids
    // array ref) flushes the outbox.
    rerender({ ids: [...ALL] });

    const calls = submitCompletion.mock.calls as unknown as Array<
      [string, string, string, string | null, string | null]
    >;
    await waitFor(() => expect(calls.filter((c) => c[1] === 'm0').length).toBeGreaterThan(1));
    // The replayed write carries the via + STORED epoch the completion was earned with.
    const replay = calls.filter((c) => c[1] === 'm0').at(-1)!;
    expect(replay[2]).toBe('quiz');
    expect(replay[3]).toBe('2026-07-01T00:00:00.000Z');
    // The completion survives reconcile (merge, not replace).
    expect(result.current.progress.completedModuleIds).toContain('m0');
    await waitFor(() => expect(readPendingCompletions('u1')).toEqual([]));
  });

  // U10 — THE resurrection guard at hook level (mirrors the DB acceptance
  // test): a parked entry replays with the epoch STORED at completion time,
  // never the module's CURRENT (post-reset) epoch from fresh curriculum.
  test('outbox replay echoes the STORED epoch, never the freshly fetched one', async () => {
    // Parked while the module's epoch was null (never reset at completion time).
    addPendingCompletion('u1', 'm1', 'lab', null, '2026-07-02T00:00:00.000Z');
    // The module has SINCE been reset — fresh curriculum now carries T1.
    const getResetEpoch = () => '2026-07-15T00:00:00.000Z';

    renderHook(() => useProgress('u1', ALL, undefined, getResetEpoch));

    await waitFor(() => expect(submitCompletion).toHaveBeenCalled());
    const calls = submitCompletion.mock.calls as unknown as Array<
      [string, string, string | null, string | null, string | null]
    >;
    const replay = calls.find((c) => c[1] === 'm1')!;
    // Echoes the stored null epoch — a re-deriving implementation would pass
    // '2026-07-15…' here and silently resurrect the reset.
    expect(replay[3]).toBeNull();
    expect(replay[4]).toBe('2026-07-02T00:00:00.000Z');
  });
});

describe('terminal reset classification (U10)', () => {
  test("a 'reset' outcome drops the completion, clears the outbox entry, and surfaces the module id", async () => {
    submitCompletion.mockResolvedValueOnce('reset');
    const { result } = renderHook(() => useProgress('u1', ALL));
    await waitFor(() => expect(result.current.progress.currentModuleId).toBe('m0'));

    act(() => result.current.completeModule('m0', 'explored'));

    await waitFor(() => expect(result.current.resetModuleIds.has('m0')).toBe(true));
    expect(result.current.progress.completedModuleIds).not.toContain('m0');
    expect(result.current.progress.completionEpochs?.m0).toBeUndefined();
    expect(readPendingCompletions('u1')).toEqual([]);
  });

  test("a parked entry whose replay resolves 'reset' is dropped, not re-parked", async () => {
    addPendingCompletion('u1', 'm1', 'quiz', null, '2026-07-02T00:00:00.000Z');
    submitCompletion.mockResolvedValue('reset');

    const { result } = renderHook(() => useProgress('u1', ALL));

    await waitFor(() => expect(result.current.resetModuleIds.has('m1')).toBe(true));
    expect(readPendingCompletions('u1')).toEqual([]);
    expect(result.current.progress.completedModuleIds).not.toContain('m1');
  });

  test('re-completing a reset module clears its reset notice', async () => {
    submitCompletion.mockResolvedValueOnce('reset');
    const { result } = renderHook(() => useProgress('u1', ALL));
    await waitFor(() => expect(result.current.progress.currentModuleId).toBe('m0'));

    act(() => result.current.completeModule('m0', 'explored'));
    await waitFor(() => expect(result.current.resetModuleIds.has('m0')).toBe(true));

    // The learner does the updated activity again (write now succeeds).
    act(() => result.current.completeModule('m0', 'explored'));
    await waitFor(() => expect(result.current.resetModuleIds.has('m0')).toBe(false));
    expect(result.current.progress.completedModuleIds).toContain('m0');
  });
});

describe('reconcile drop-on-newer-epoch (U10)', () => {
  test('a cached completion the server no longer has, on a since-reset module, is dropped and surfaced', async () => {
    // The cache says m1 completed with an epoch OLDER than the module's current
    // reset; the server snapshot does NOT have it (the reset deleted the row).
    localStorage.setItem(
      'sprint_progress:u1',
      JSON.stringify({
        v: 3,
        progress: {
          completedModuleIds: ['m0', 'm1'],
          currentModuleId: 'm2',
          completionEpochs: { m0: null, m1: '2026-07-01T00:00:00.000Z' },
        },
      }),
    );
    fetchModuleProgress.mockResolvedValue({
      completedModuleIds: ['m0'], // m0 survives server-side; m1 was reset
      inProgressModuleIds: [],
      latestInProgressId: null,
    });
    const getResetEpoch = (id: string) => (id === 'm1' ? '2026-07-15T00:00:00.000Z' : null);

    const { result } = renderHook(() => useProgress('u1', ALL, undefined, getResetEpoch));

    await waitFor(() => expect(result.current.resetModuleIds.has('m1')).toBe(true));
    expect(result.current.progress.completedModuleIds).toEqual(['m0']);
    expect(result.current.progress.completionEpochs?.m1).toBeUndefined();
  });

  test('a cached completion with an epoch AT/after the reset survives the union (completed after reset)', async () => {
    localStorage.setItem(
      'sprint_progress:u1',
      JSON.stringify({
        v: 3,
        progress: {
          completedModuleIds: ['m1'],
          currentModuleId: 'm2',
          completionEpochs: { m1: '2026-07-15T00:00:00.000Z' },
        },
      }),
    );
    fetchModuleProgress.mockResolvedValue(emptySnapshot);
    const getResetEpoch = (id: string) => (id === 'm1' ? '2026-07-15T00:00:00.000Z' : null);

    const { result } = renderHook(() => useProgress('u1', ALL, undefined, getResetEpoch));

    await waitFor(() => expect(fetchModuleProgress).toHaveBeenCalled());
    expect(result.current.progress.completedModuleIds).toContain('m1');
    expect(result.current.resetModuleIds.has('m1')).toBe(false);
  });

  test('a never-reset module keeps the DATA-02 monotonic union for local-only completions', async () => {
    localStorage.setItem(
      'sprint_progress:u1',
      JSON.stringify({
        v: 3,
        progress: { completedModuleIds: ['m1'], currentModuleId: 'm2', completionEpochs: { m1: null } },
      }),
    );
    fetchModuleProgress.mockResolvedValue(emptySnapshot);

    const { result } = renderHook(() => useProgress('u1', ALL, undefined, () => null));

    await waitFor(() => expect(fetchModuleProgress).toHaveBeenCalled());
    expect(result.current.progress.completedModuleIds).toContain('m1');
    expect(result.current.resetModuleIds.size).toBe(0);
  });

  test('a pending outbox entry is NOT reconcile-dropped — replay classification owns its fate', async () => {
    // m1 parked (offline completion), module since reset. The reconcile union
    // must keep m1 while the replay adjudicates (it may legitimately resubmit
    // genuinely-new work under the eventAt refinement).
    addPendingCompletion('u1', 'm1', 'lab', null, '2026-07-16T00:00:00.000Z');
    submitCompletion.mockResolvedValue('retry'); // still offline this reconcile
    localStorage.setItem(
      'sprint_progress:u1',
      JSON.stringify({
        v: 3,
        progress: { completedModuleIds: ['m1'], currentModuleId: 'm2', completionEpochs: { m1: null } },
      }),
    );
    fetchModuleProgress.mockResolvedValue(emptySnapshot);
    const getResetEpoch = (id: string) => (id === 'm1' ? '2026-07-15T00:00:00.000Z' : null);

    const { result } = renderHook(() => useProgress('u1', ALL, undefined, getResetEpoch));

    await waitFor(() => expect(fetchModuleProgress).toHaveBeenCalled());
    expect(result.current.progress.completedModuleIds).toContain('m1');
    expect(result.current.resetModuleIds.has('m1')).toBe(false);
    expect(readPendingCompletions('u1')).toHaveLength(1);
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

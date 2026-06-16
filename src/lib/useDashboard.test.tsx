// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { CohortSummary } from './dashboard';

// P5.2d: a realtime-triggered refresh must be a *background* refresh — it must
// not flip the dashboard to its loading spinner, and a transient failure must
// not wipe good data to the error screen. We mock the data layer and the
// realtime module (capturing the onChange it's handed) to drive that path.

const { fetchCohortSummaries, fetchScoreDistribution, fetchCohortLearners, realtimeRef } =
  vi.hoisted(() => ({
    fetchCohortSummaries: vi.fn(),
    fetchScoreDistribution: vi.fn(),
    fetchCohortLearners: vi.fn(),
    realtimeRef: { onChange: (() => {}) as () => void },
  }));

vi.mock('./dashboard', () => ({ fetchCohortSummaries, fetchScoreDistribution }));
vi.mock('./learnerDetail', () => ({ fetchCohortLearners }));
vi.mock('./dashboardRealtime', () => ({
  subscribeToDashboardChanges: (cb: () => void) => {
    realtimeRef.onChange = cb;
    return () => {};
  },
}));

import { useDashboard } from './useDashboard';

const cohort = (id: string): CohortSummary => ({
  cohortId: id,
  cohortName: id,
  learnerCount: 1,
  avgCompletionPct: 0.5,
  glatPassRate: 0,
  avgQuizPct: 0.7,
  reviewableTotal: 0,
});

// A mutable "current server state" the summaries fetcher reads, so the test is
// robust to however many times the mount effect runs (StrictMode double-invoke).
let nextSummaries: () => Promise<CohortSummary[]>;

beforeEach(() => {
  vi.clearAllMocks();
  nextSummaries = () => Promise.resolve([cohort('a')]);
  fetchCohortSummaries.mockImplementation(() => nextSummaries());
  fetchScoreDistribution.mockResolvedValue(new Map());
  fetchCohortLearners.mockResolvedValue([]);
});

describe('useDashboard realtime background refresh', () => {
  test('a realtime refresh updates data without ever entering the loading state', async () => {
    const { result } = renderHook(() => useDashboard());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.summaries).toHaveLength(1);

    // Hold the next read open so we can observe state *while it is in flight* —
    // a background refresh must keep `loading` false the whole time (a foreground
    // load would flip it true and flash the spinner).
    let resolveRefresh!: (v: CohortSummary[]) => void;
    nextSummaries = () => new Promise<CohortSummary[]>((res) => (resolveRefresh = res));

    await act(async () => {
      realtimeRef.onChange();
      await Promise.resolve();
    });
    expect(result.current.loading).toBe(false); // in-flight: no spinner
    expect(result.current.summaries).toHaveLength(1); // still showing prior data

    await act(async () => {
      resolveRefresh([cohort('a'), cohort('b')]);
      await Promise.resolve();
    });
    expect(result.current.summaries).toHaveLength(2);
    expect(result.current.loading).toBe(false);
  });

  test('a failed realtime refresh keeps the prior data and shows no error', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useDashboard());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.summaries).toHaveLength(1);

    nextSummaries = () => Promise.reject(new Error('transient'));
    await act(async () => {
      realtimeRef.onChange();
      await Promise.resolve();
    });

    expect(result.current.summaries).toHaveLength(1);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(errSpy).toHaveBeenCalled(); // the failure was logged, just not surfaced
    errSpy.mockRestore();
  });
});

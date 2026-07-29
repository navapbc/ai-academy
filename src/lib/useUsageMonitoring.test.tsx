// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { useUsageMonitoring } from './useUsageMonitoring';
import { fetchUsageByUser, type UsageByUser } from './usageMonitoring';

// `windowMs` is a user-facing picker, so two reads can be in flight at once.
// Without a generation guard the SLOWER response wins whichever window it was
// for — the 30-day totals would land under the 24-hour label.
vi.mock('./usageMonitoring', () => ({ fetchUsageByUser: vi.fn() }));

const DAY = 24 * 60 * 60 * 1000;

function usageRow(name: string): UsageByUser {
  return {
    userId: name,
    name,
    callCount: 1,
    inputTokens: 1,
    outputTokens: 1,
    totalTokens: 2,
    overThreshold: false,
  };
}

function Probe({ windowMs }: { windowMs: number }) {
  const { rows, loading, error } = useUsageMonitoring(windowMs);
  return (
    <div>
      <div data-testid="names">{rows.map((r) => r.name).join(',') || 'empty'}</div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="error">{error ?? 'none'}</div>
    </div>
  );
}

/** Hands back a resolver per call so the test controls completion order. */
function deferredFetches() {
  const pending: { resolve: (v: UsageByUser[]) => void; reject: (e: unknown) => void }[] = [];
  vi.mocked(fetchUsageByUser).mockImplementation(
    () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
  );
  return pending;
}

beforeEach(() => {
  vi.mocked(fetchUsageByUser).mockReset();
});

describe('useUsageMonitoring', () => {
  test('shows the newest window even when an older read resolves last', async () => {
    const pending = deferredFetches();

    const { rerender } = render(<Probe windowMs={30 * DAY} />);
    await waitFor(() => expect(pending).toHaveLength(1));

    rerender(<Probe windowMs={DAY} />);
    await waitFor(() => expect(pending).toHaveLength(2));

    // The newest request (24 hours) comes back first.
    await act(async () => pending[1].resolve([usageRow('24h-user')]));
    expect(screen.getByTestId('names')).toHaveTextContent('24h-user');
    expect(screen.getByTestId('loading')).toHaveTextContent('false');

    // The superseded 30-day read lands afterwards and must be ignored.
    await act(async () => pending[0].resolve([usageRow('30d-user')]));
    expect(screen.getByTestId('names')).toHaveTextContent('24h-user');
  });

  test('a superseded read’s failure does not overwrite good data with an error', async () => {
    const pending = deferredFetches();

    const { rerender } = render(<Probe windowMs={30 * DAY} />);
    await waitFor(() => expect(pending).toHaveLength(1));
    rerender(<Probe windowMs={DAY} />);
    await waitFor(() => expect(pending).toHaveLength(2));

    await act(async () => pending[1].resolve([usageRow('24h-user')]));
    await act(async () => pending[0].reject(new Error('stale window failed')));

    expect(screen.getByTestId('error')).toHaveTextContent('none');
    expect(screen.getByTestId('names')).toHaveTextContent('24h-user');
  });

  test('surfaces an error when the current read fails', async () => {
    const pending = deferredFetches();

    render(<Probe windowMs={DAY} />);
    await waitFor(() => expect(pending).toHaveLength(1));
    await act(async () => pending[0].reject(new Error('rls denied')));

    expect(screen.getByTestId('error')).toHaveTextContent(/usage monitoring/i);
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
  });
});

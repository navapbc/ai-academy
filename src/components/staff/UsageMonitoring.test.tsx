// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UsageMonitoring from './UsageMonitoring';
import type { UsageByUser } from '../../lib/usageMonitoring';

const { fetchUsageByUser } = vi.hoisted(() => ({ fetchUsageByUser: vi.fn() }));

// Mock the fetcher, but keep the real WINDOW_OPTIONS / DEFAULT_THRESHOLD_TOKENS
// constants the component (and its hook) depend on.
vi.mock('../../lib/usageMonitoring', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/usageMonitoring')>();
  return { ...actual, fetchUsageByUser };
});

const HEAVY: UsageByUser = {
  userId: 'u-2',
  name: 'Grace Hopper',
  callCount: 40,
  inputTokens: 900_000,
  outputTokens: 200_000,
  totalTokens: 1_100_000,
  overThreshold: true,
};
const LIGHT: UsageByUser = {
  userId: 'u-1',
  name: 'Ada Lovelace',
  callCount: 3,
  inputTokens: 300,
  outputTokens: 150,
  totalTokens: 450,
  overThreshold: false,
};
const noop = () => {};

beforeEach(() => {
  fetchUsageByUser.mockReset();
});

describe('UsageMonitoring', () => {
  test('renders a per-user table from fetched rows', async () => {
    fetchUsageByUser.mockResolvedValue([HEAVY, LIGHT]);
    render(<UsageMonitoring onBack={noop} />);

    expect(await screen.findByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    // Formatted totals appear.
    expect(screen.getByText('1,100,000')).toBeInTheDocument();
    expect(screen.getByText('450')).toBeInTheDocument();
  });

  test('flags the over-threshold row', async () => {
    fetchUsageByUser.mockResolvedValue([HEAVY, LIGHT]);
    render(<UsageMonitoring onBack={noop} />);

    const heavyCell = await screen.findByText('Grace Hopper');
    const heavyRow = heavyCell.closest('tr');
    expect(heavyRow).toHaveAttribute('data-flagged', 'true');
    expect(within(heavyRow as HTMLElement).getByText(/over threshold/i)).toBeInTheDocument();

    const lightRow = screen.getByText('Ada Lovelace').closest('tr');
    expect(lightRow).not.toHaveAttribute('data-flagged');
  });

  test('shows the empty state when there are no rows', async () => {
    fetchUsageByUser.mockResolvedValue([]);
    render(<UsageMonitoring onBack={noop} />);

    expect(await screen.findByText(/no claude usage recorded/i)).toBeInTheDocument();
  });

  test('shows the error state on fetch failure, with a retry', async () => {
    fetchUsageByUser.mockRejectedValueOnce(new Error('boom'));
    render(<UsageMonitoring onBack={noop} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not load/i);

    fetchUsageByUser.mockResolvedValue([LIGHT]);
    await userEvent.click(within(alert).getByRole('button', { name: /retry/i }));

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
  });

  test('clicking a column header re-sorts the table', async () => {
    fetchUsageByUser.mockResolvedValue([HEAVY, LIGHT]);
    render(<UsageMonitoring onBack={noop} />);
    await screen.findByText('Grace Hopper');

    // Default sort is total desc → Grace (heavy) first.
    let rows = screen.getAllByRole('row');
    // rows[0] is the header row.
    expect(within(rows[1]).getByText('Grace Hopper')).toBeInTheDocument();

    // Sort by user name (asc) → Ada first.
    await userEvent.click(screen.getByRole('button', { name: /sort by user/i }));
    rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('Ada Lovelace')).toBeInTheDocument();
  });
});

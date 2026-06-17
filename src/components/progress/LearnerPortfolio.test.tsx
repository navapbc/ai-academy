// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import LearnerPortfolio from './LearnerPortfolio';
import type { LearnerPortfolio as Portfolio } from '../../lib/learnerPortfolio';

const { fetchLearnerPortfolio } = vi.hoisted(() => ({ fetchLearnerPortfolio: vi.fn() }));
vi.mock('../../lib/learnerPortfolio', () => ({ fetchLearnerPortfolio }));

const FULL: Portfolio = {
  pairedCalibration: {
    gapPct: 12,
    estimatePct: 42,
    actualSpeedupPct: 30,
    offMs: 1000,
    onMs: 700,
    offDefects: 2,
    onDefects: 1,
    createdAt: '2026-05-01T00:00:00Z',
  },
  confidenceCalibration: {
    calibrated: 4,
    over: 1,
    under: 1,
    unanswered: 0,
    score: 4,
    maxScore: 6,
    createdAt: '2026-05-01T00:00:00Z',
  },
  failureLog: {
    entries: [
      { date: '2026-05-02', task: 'Draft a notice', error: 'Invented a statute cite', caught: 'Checked eCFR', tell: 'Too confident' },
    ],
    entryCount: 1,
    createdAt: '2026-05-02T00:00:00Z',
  },
  useCasePortfolio: {
    entries: [{ verdict: 'doesnt', task: 'Final eligibility call', approach: 'Draft only', watch: 'Never auto-decide' }],
    statement: { delegation: 'I delegated the first draft.', diligence: 'I validated every figure.' },
    helpsCount: 0,
    doesntCount: 1,
    wordCount: 120,
    createdAt: '2026-05-03T00:00:00Z',
  },
};

const EMPTY: Portfolio = {
  pairedCalibration: null,
  confidenceCalibration: null,
  failureLog: null,
  useCasePortfolio: null,
};

beforeEach(() => {
  fetchLearnerPortfolio.mockReset();
});

describe('LearnerPortfolio (P5.3b)', () => {
  test('renders each artifact when present', async () => {
    fetchLearnerPortfolio.mockResolvedValue(FULL);
    render(<LearnerPortfolio userId="me" />);

    // 2.15 calibration number + read.
    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByText(/point gap/i)).toBeInTheDocument();
    // 2.8 over/under labels.
    expect(screen.getByText('Over-relied')).toBeInTheDocument();
    expect(screen.getByText('Under-relied')).toBeInTheDocument();
    // 2.9 failure entry.
    expect(screen.getByText('Draft a notice')).toBeInTheDocument();
    expect(screen.getByText(/Invented a statute cite/)).toBeInTheDocument();
    // 2.11 use-case entry + a 4D dimension label.
    expect(screen.getByText('Final eligibility call')).toBeInTheDocument();
    expect(screen.getByText('Delegation')).toBeInTheDocument();
    expect(screen.getByText('Diligence')).toBeInTheDocument();

    expect(fetchLearnerPortfolio).toHaveBeenCalledWith('me');
  });

  test('shows per-instrument empty states when nothing is submitted', async () => {
    fetchLearnerPortfolio.mockResolvedValue(EMPTY);
    render(<LearnerPortfolio userId="me" />);

    expect(await screen.findByText(/Complete the 2.15 paired/i)).toBeInTheDocument();
    expect(screen.getByText(/Complete the 2.8 confidence-calibration/i)).toBeInTheDocument();
    expect(screen.getByText(/Log AI failures you catch in the 2.9 lab/i)).toBeInTheDocument();
    expect(screen.getByText(/Build your use-case library and 4D Diligence Statement/i)).toBeInTheDocument();
  });

  test('shows an error + retry when the fetch fails', async () => {
    fetchLearnerPortfolio.mockRejectedValueOnce(new Error('boom'));
    render(<LearnerPortfolio userId="me" />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not load your portfolio/i);
  });
});

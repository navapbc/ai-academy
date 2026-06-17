// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReviewQueue from './ReviewQueue';
import type { ReviewQueueItem } from '../../lib/reviewQueue';

const { fetchReviewQueue } = vi.hoisted(() => ({ fetchReviewQueue: vi.fn() }));
vi.mock('../../lib/reviewQueue', async (importActual) => {
  // Keep the real pure summarizeSubmission; only stub the network fetch.
  const actual = await importActual<typeof import('../../lib/reviewQueue')>();
  return { ...actual, fetchReviewQueue };
});

const ITEM: ReviewQueueItem = {
  submissionId: 's1',
  learnerUserId: 'u1',
  learnerName: 'Ada Lovelace',
  labId: '2.2',
  transcript: { kind: 'critique', critique: 'The artifact overstates eligibility.' },
  rubricScores: {
    grader: 'llm',
    perAnchor: [{ id: 'a', label: 'Specificity', score: 1, max: 2, rationale: 'partly specific' }],
    overall: 1,
    maxOverall: 2,
  },
  grader: 'llm',
  createdAt: '2026-05-01T00:00:00Z',
};

beforeEach(() => {
  fetchReviewQueue.mockReset();
});

describe('ReviewQueue (P5.5b)', () => {
  test('lists reviewable submissions with score, and opens a detail with the verdict', async () => {
    fetchReviewQueue.mockResolvedValue([ITEM]);
    render(<ReviewQueue onBack={() => {}} />);

    expect(await screen.findByRole('button', { name: /Ada Lovelace/ })).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument(); // overall/max in the list

    await userEvent.click(screen.getByRole('button', { name: /Ada Lovelace/ }));

    // Detail: the learner's submission text + the GradeResultCard.
    expect(screen.getByText(/overstates eligibility/i)).toBeInTheDocument();
    expect(screen.getByText('Specificity')).toBeInTheDocument(); // anchor label from GradeResultCard
    expect(screen.getByText(/LLM verdict/i)).toBeInTheDocument();
  });

  test('shows the empty state when nothing is awaiting review', async () => {
    fetchReviewQueue.mockResolvedValue([]);
    render(<ReviewQueue onBack={() => {}} />);
    expect(await screen.findByText(/no submissions awaiting review/i)).toBeInTheDocument();
  });

  test('shows an error + retry when the fetch fails', async () => {
    fetchReviewQueue.mockRejectedValueOnce(new Error('boom'));
    render(<ReviewQueue onBack={() => {}} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not load the review queue/i);
  });
});

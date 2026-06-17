// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LearnerDashboard from './LearnerDashboard';
import type { LearnerDetailData } from '../lib/learnerDetail';

const { fetchLearnerDetail } = vi.hoisted(() => ({ fetchLearnerDetail: vi.fn() }));
vi.mock('../lib/learnerDetail', () => ({ fetchLearnerDetail }));

const DETAIL: LearnerDetailData = {
  modules: [
    { cellId: '1.1', title: 'Intro', stage: '1a', completed: true, bestQuizPct: 1, quizPassed: true },
    { cellId: '2.1', title: 'Prompting', stage: '2', completed: false, bestQuizPct: null, quizPassed: null },
    { cellId: '2.14', title: 'GLAT', stage: '2', completed: true, bestQuizPct: 0.9, quizPassed: true },
  ],
  labs: [{ id: 'a', labId: 'lab-2.1', status: 'reviewable', createdAt: '2026-01-01T00:00:00Z' }],
};

beforeEach(() => {
  fetchLearnerDetail.mockReset();
});

describe('LearnerDashboard (self-view)', () => {
  test('renders own summary cards, module rows, and a lab badge', async () => {
    fetchLearnerDetail.mockResolvedValue(DETAIL);
    render(<LearnerDashboard userId="me" />);

    expect(screen.getByRole('heading', { name: 'Your progress' })).toBeInTheDocument();

    // Cards computed locally from the detail.
    expect(await screen.findByText('Prompting')).toBeInTheDocument();
    expect(screen.getByText('2 of 3 modules')).toBeInTheDocument(); // completion note
    expect(screen.getByText('Passed')).toBeInTheDocument(); // GLAT card (2.14 passed)
    expect(screen.getByText('Stage 1a')).toBeInTheDocument();
    expect(screen.getByText('Stage 2')).toBeInTheDocument();
    expect(screen.getByText('lab-2.1')).toBeInTheDocument();
    expect(screen.getByText('reviewable')).toBeInTheDocument();

    // Reads its own data for the signed-in user.
    expect(fetchLearnerDetail).toHaveBeenCalledWith('me');
  });

  test('shows the empty lab message when there are no submissions', async () => {
    fetchLearnerDetail.mockResolvedValue({ modules: DETAIL.modules, labs: [] });
    render(<LearnerDashboard userId="me" />);
    expect(await screen.findByText(/haven’t submitted any labs/i)).toBeInTheDocument();
  });

  test('shows an error + retry when the fetch fails', async () => {
    fetchLearnerDetail.mockRejectedValueOnce(new Error('boom'));
    render(<LearnerDashboard userId="me" />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not load/i);

    fetchLearnerDetail.mockResolvedValue(DETAIL);
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByText('Prompting')).toBeInTheDocument();
  });
});

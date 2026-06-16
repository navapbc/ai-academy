// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LearnerDetail from './LearnerDetail';
import type { LearnerRosterEntry, LearnerDetailData } from '../../lib/learnerDetail';

const { fetchLearnerDetail } = vi.hoisted(() => ({ fetchLearnerDetail: vi.fn() }));
vi.mock('../../lib/learnerDetail', () => ({ fetchLearnerDetail }));

const LEARNER: LearnerRosterEntry = {
  userId: 'u-1',
  cohortId: 'c-a',
  name: 'Ada Lovelace',
  email: 'ada@navapbc.com',
  completionPct: 0.5,
  avgQuizPct: 0.82,
  glatPassed: true,
  reviewableLabs: 1,
};

const DETAIL: LearnerDetailData = {
  modules: [
    { cellId: '1.1', title: 'Intro', stage: '1a', completed: true, bestQuizPct: 1, quizPassed: true },
    { cellId: '2.1', title: 'Prompting', stage: '2', completed: false, bestQuizPct: null, quizPassed: null },
  ],
  labs: [{ id: 'a', labId: 'lab-2.1', status: 'reviewable', createdAt: '2026-01-01T00:00:00Z' }],
};

beforeEach(() => {
  fetchLearnerDetail.mockReset();
});

describe('LearnerDetail', () => {
  test('renders the rollup cards, module rows, and lab status badge', async () => {
    fetchLearnerDetail.mockResolvedValue(DETAIL);
    render(<LearnerDetail learner={LEARNER} onBack={() => {}} />);

    expect(screen.getByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument();
    expect(screen.getByText('Passed')).toBeInTheDocument(); // GLAT card

    expect(await screen.findByText('Prompting')).toBeInTheDocument();
    expect(screen.getByText('Stage 1a')).toBeInTheDocument();
    expect(screen.getByText('Stage 2')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument(); // 1.1 best quiz
    expect(screen.getByText('lab-2.1')).toBeInTheDocument();
    expect(screen.getByText('reviewable')).toBeInTheDocument();
  });

  test('the back button calls onBack', async () => {
    fetchLearnerDetail.mockResolvedValue(DETAIL);
    const onBack = vi.fn();
    render(<LearnerDetail learner={LEARNER} onBack={onBack} />);

    await userEvent.click(screen.getByRole('button', { name: /back to cohorts/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  test('shows an error + retry when the fetch fails', async () => {
    fetchLearnerDetail.mockRejectedValueOnce(new Error('boom'));
    render(<LearnerDetail learner={LEARNER} onBack={() => {}} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not load/i);

    fetchLearnerDetail.mockResolvedValue(DETAIL);
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByText('Prompting')).toBeInTheDocument();
  });
});

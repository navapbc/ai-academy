// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LearnerDashboard from './LearnerDashboard';
import type { LearnerDetailData } from '../lib/learnerDetail';

const { fetchLearnerDetail } = vi.hoisted(() => ({ fetchLearnerDetail: vi.fn() }));
vi.mock('../lib/learnerDetail', () => ({ fetchLearnerDetail }));

// The embedded portfolio section (P5.3b) fetches independently; stub it so these
// tests stay hermetic and focused on the detail panels (portfolio has its own test).
const { fetchLearnerPortfolio } = vi.hoisted(() => ({ fetchLearnerPortfolio: vi.fn() }));
vi.mock('../lib/learnerPortfolio', () => ({ fetchLearnerPortfolio }));

const DETAIL: LearnerDetailData = {
  modules: [
    { cellId: 'c1-w0-setup', title: 'Intro', origin: 'course', section: 'Course lessons', completed: true, bestQuizPct: 1, quizPassed: true },
    { cellId: 'c1-w0-wrap', title: 'Wrap-up', origin: 'course', section: 'Course lessons', completed: false, bestQuizPct: null, quizPassed: null },
    { cellId: '2.1', title: 'Prompting', origin: 'matrix', section: 'Supplemental coursework', completed: false, bestQuizPct: null, quizPassed: null },
    { cellId: '2.14', title: 'GLAT', origin: 'matrix', section: 'Supplemental coursework', completed: true, bestQuizPct: 0.9, quizPassed: true },
  ],
  labs: [{ id: 'a', labId: 'lab-2.1', status: 'reviewable', createdAt: '2026-01-01T00:00:00Z' }],
};

beforeEach(() => {
  fetchLearnerDetail.mockReset();
  fetchLearnerPortfolio.mockReset();
  fetchLearnerPortfolio.mockResolvedValue({
    pairedCalibration: null,
    confidenceCalibration: null,
    failureLog: null,
    useCasePortfolio: null,
  });
});

describe('LearnerDashboard (self-view)', () => {
  test('renders own summary cards, module rows, and a lab badge', async () => {
    fetchLearnerDetail.mockResolvedValue(DETAIL);
    render(<LearnerDashboard userId="me" />);

    expect(screen.getByRole('heading', { name: 'Your progress' })).toBeInTheDocument();

    // Cards computed locally from the detail.
    expect(await screen.findByText('Prompting')).toBeInTheDocument();
    // Completion excludes supplemental (matrix) modules — only the 2 course
    // rows count, 1 of them completed — even though 3 of the 4 total rows are.
    expect(screen.getByText('1 of 2 modules')).toBeInTheDocument(); // completion note
    expect(screen.getByText('Passed')).toBeInTheDocument(); // GLAT card (2.14 passed)
    // Section headings (U13): grouped by curriculum section, not stage.
    expect(screen.getByText('Course lessons')).toBeInTheDocument();
    expect(screen.getByText('Supplemental coursework')).toBeInTheDocument();
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

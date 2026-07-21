// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LearnerDashboard from './LearnerDashboard';
import type { LearnerDetailData } from '../lib/learnerDetail';
import type { CurriculumSection, Module } from '../types';

const { fetchLearnerDetail } = vi.hoisted(() => ({ fetchLearnerDetail: vi.fn() }));
vi.mock('../lib/learnerDetail', () => ({ fetchLearnerDetail }));

// The embedded portfolio section (P5.3b) fetches independently; stub it so these
// tests stay hermetic and focused on the detail panels (portfolio has its own test).
const { fetchLearnerPortfolio } = vi.hoisted(() => ({ fetchLearnerPortfolio: vi.fn() }));
vi.mock('../lib/learnerPortfolio', () => ({ fetchLearnerPortfolio }));

function courseModule(id: string): Module {
  return {
    id,
    cellId: id,
    title: `Module ${id}`,
    type: 'content',
    content: '# Lesson',
    phaseId: 'week-0',
    origin: 'course',
    stage: null,
    visibility: 'public',
    status: 'published',
    dimension: ['Diligence'],
    evidenceType: 'quiz',
    selfReportValidity: 'medium',
    progressResetAt: null,
  };
}

const SECTIONS: CurriculumSection[] = [
  {
    kind: 'week',
    id: 'week-0',
    week: 'Week 0',
    title: 'Claude Set-up',
    description: '',
    courseId: 'c-1',
    courseTitle: 'Course 1',
    modules: [courseModule('c1-w0-setup'), courseModule('c1-w0-wrap')],
  },
  {
    kind: 'week',
    id: 'week-1',
    week: 'Week 1',
    title: 'Break Claude on Purpose',
    description: '',
    courseId: 'c-1',
    courseTitle: 'Course 1',
    modules: [courseModule('c1-w1-a')],
  },
];

const DETAIL: LearnerDetailData = {
  modules: [
    { cellId: 'c1-w0-setup', title: 'Intro', origin: 'course', section: 'Course lessons', completed: true, bestQuizPct: null, quizPassed: null },
    { cellId: 'c1-w0-wrap', title: 'Wrap-up', origin: 'course', section: 'Course lessons', completed: true, bestQuizPct: null, quizPassed: null },
    { cellId: 'c1-w1-a', title: 'Ground rules', origin: 'course', section: 'Course lessons', completed: false, bestQuizPct: null, quizPassed: null },
    { cellId: '2.1', title: 'Prompting', origin: 'matrix', section: 'Supplemental coursework', completed: false, bestQuizPct: 0.9, quizPassed: null },
    { cellId: '2.14', title: 'GLAT', origin: 'matrix', section: 'Supplemental coursework', completed: true, bestQuizPct: null, quizPassed: true },
  ],
  labs: [
    { id: 'a', labId: 'c1-w0-setup', status: 'submitted', createdAt: '2026-01-01T00:00:00Z' },
    { id: 'b', labId: '2.1', status: 'reviewable', createdAt: '2026-01-02T00:00:00Z' },
  ],
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
  test('Course 1 starts expanded; Supplemental & resources starts collapsed', async () => {
    fetchLearnerDetail.mockResolvedValue(DETAIL);
    render(<LearnerDashboard userId="me" sections={SECTIONS} />);
    await screen.findByRole('button', { name: 'Course 1' });

    expect(screen.getByRole('button', { name: 'Course 1' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Week 0')).toBeInTheDocument(); // Course 1 content visible immediately

    const supplementalToggle = screen.getByRole('button', { name: 'Supplemental & resources' });
    expect(supplementalToggle).toHaveAttribute('aria-expanded', 'false');
    // Collapsed content is unmounted, not just hidden — 'Prompting' (a supplemental
    // module title) must not be in the document at all yet.
    expect(screen.queryByText('Prompting')).not.toBeInTheDocument();

    await userEvent.click(supplementalToggle);
    expect(supplementalToggle).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText('Prompting')).toBeInTheDocument();
  });

  test('renders Course 1 and Supplemental blocks with the right numbers', async () => {
    fetchLearnerDetail.mockResolvedValue(DETAIL);
    render(<LearnerDashboard userId="me" sections={SECTIONS} />);

    expect(screen.getByRole('heading', { name: 'Your progress' })).toBeInTheDocument();
    await screen.findByRole('button', { name: 'Course 1' });

    // Course 1: 2 of 3 course modules complete; Week 0 is fully done, Week 1 isn't
    // — so Week 1 is the current week. Expanded by default, so no click needed.
    const course1Section = screen.getByRole('heading', { name: 'Course 1' }).closest('section')!;
    expect(screen.getByText('2 of 3 modules')).toBeInTheDocument();

    const currentWeekCard = screen.getByText('Current week').parentElement!;
    expect(within(currentWeekCard).getByText('Week 1')).toBeInTheDocument();
    expect(within(currentWeekCard).getByText('Break Claude on Purpose')).toBeInTheDocument();

    // Per-week list rows (Week 0's own row — unambiguous since it isn't "current").
    expect(screen.getByText('Week 0')).toBeInTheDocument();
    expect(screen.getByText('2 of 2')).toBeInTheDocument(); // Week 0 row count
    expect(screen.getByText('0 of 1')).toBeInTheDocument(); // Week 1 row count

    // Course 1's own module list is nested in the same section, right below the
    // week list, and — since Course 1 has no quizzes — has no "Best quiz" column.
    expect(within(course1Section).getByText('Course lessons')).toBeInTheDocument();
    expect(within(course1Section).getByText('Ground rules')).toBeInTheDocument();
    expect(within(course1Section).queryByText('Best quiz')).not.toBeInTheDocument();

    // Supplemental & resources starts collapsed — expand it to check its content.
    await userEvent.click(screen.getByRole('button', { name: 'Supplemental & resources' }));
    const supplementalSection = screen.getByRole('heading', { name: 'Supplemental & resources' }).closest('section')!;

    // 1 of 2 explored, GLAT passed, quiz avg 90% — and its own module list DOES
    // have the "Best quiz" column (real data here).
    expect(within(supplementalSection).getByText('1 of 2')).toBeInTheDocument();
    expect(within(supplementalSection).getByText('Passed')).toBeInTheDocument();
    expect(within(supplementalSection).getByText('Labs in review')).toBeInTheDocument();
    expect(within(supplementalSection).getByText('Best quiz')).toBeInTheDocument();
    const avgQuizCard = within(supplementalSection).getByText('Avg quiz score').parentElement!;
    expect(within(avgQuizCard).getByText('90%')).toBeInTheDocument();
    expect(within(supplementalSection).getByText('Supplemental coursework')).toBeInTheDocument();

    // Lab statuses — the submissions list is grouped inside Supplemental &
    // resources (labs are supplemental work), not its own top-level section.
    expect(within(supplementalSection).getByText('Your lab submissions')).toBeInTheDocument();
    expect(within(supplementalSection).getByText('submitted')).toBeInTheDocument();
    expect(within(supplementalSection).getByText('reviewable')).toBeInTheDocument();

    expect(fetchLearnerDetail).toHaveBeenCalledWith('me');
  });

  test('hides the Course 1 block when no weeks are visible (unenrolled learner)', async () => {
    fetchLearnerDetail.mockResolvedValue(DETAIL);
    render(<LearnerDashboard userId="me" sections={[]} />);

    await screen.findByRole('heading', { name: 'Supplemental & resources' });
    expect(screen.queryByRole('heading', { name: 'Course 1' })).not.toBeInTheDocument();
    expect(screen.getByText(/not enrolled in Course 1/i)).toBeInTheDocument();
    // Supplemental still renders (collapsed) — it's ungated.
    expect(screen.getByRole('button', { name: 'Supplemental & resources' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  test('omits the Supplemental block when there is no matrix/custom content', async () => {
    fetchLearnerDetail.mockResolvedValue({
      modules: DETAIL.modules.filter((m) => m.origin === 'course'),
      labs: [],
    });
    render(<LearnerDashboard userId="me" sections={SECTIONS} />);

    expect(await screen.findByText('Intro')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Supplemental & resources' })).not.toBeInTheDocument();
  });

  test('shows the empty lab message when there are no submissions', async () => {
    fetchLearnerDetail.mockResolvedValue({ modules: DETAIL.modules, labs: [] });
    render(<LearnerDashboard userId="me" sections={SECTIONS} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Supplemental & resources' }));
    expect(await screen.findByText(/haven’t submitted any labs/i)).toBeInTheDocument();
  });

  test('shows an error + retry when the fetch fails', async () => {
    fetchLearnerDetail.mockRejectedValueOnce(new Error('boom'));
    render(<LearnerDashboard userId="me" sections={SECTIONS} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not load/i);

    fetchLearnerDetail.mockResolvedValue(DETAIL);
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByRole('button', { name: 'Course 1' })).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CourseManagement from './CourseManagement';
import type { CourseAuthoringData } from '../../lib/adminCourses';

// Mock the whole adminCourses module (writes + read) so the test exercises only
// the panel's UI logic. Mirrors WorkshopManagement.test.tsx.
const api = vi.hoisted(() => ({
  fetchCourseAuthoring: vi.fn(),
  createWeek: vi.fn(),
  updateWeek: vi.fn(),
  reorderWeeks: vi.fn(),
  deleteWeek: vi.fn(),
  assignModule: vi.fn(),
  unassignModule: vi.fn(),
  reorderWeekModules: vi.fn(),
}));
vi.mock('../../lib/adminCourses', () => api);

// Course 1 with three weeks: Week 0 empty, Week 1 with two ordered members,
// Week 5 empty. The assignable picker already excludes drafts/archived/assigned
// (buildCourseAuthoring, unit-tested in adminCourses.test.ts) — here it offers
// exactly '1.1' and '2.1'.
const DATA: CourseAuthoringData = {
  courses: [
    {
      id: 'c1',
      slug: 'course-1',
      title: 'Understanding & Deciding When to Use AI',
      weeks: [
        { id: 'w0', title: 'Week 0', subtitle: 'Claude Set-up', members: [] },
        {
          id: 'w1',
          title: 'Week 1',
          subtitle: 'Break Claude on Purpose',
          members: [
            { cellId: 'c1-w1-break', title: 'Break Claude', status: 'published', origin: 'course', archived: false },
            { cellId: 'c1-w1-wrong', title: 'Confidently wrong', status: 'published', origin: 'course', archived: false },
          ],
        },
        { id: 'w5', title: 'Week 5', subtitle: null, members: [] },
      ],
    },
  ],
  assignable: [
    { cellId: '1.1', title: 'Rules of the road', status: 'published', origin: 'matrix', archived: false },
    { cellId: '2.1', title: 'Your first lab', status: 'published', origin: 'matrix', archived: false },
  ],
};

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.fetchCourseAuthoring.mockResolvedValue(DATA);
  api.createWeek.mockResolvedValue(undefined);
  api.updateWeek.mockResolvedValue(undefined);
  api.reorderWeeks.mockResolvedValue(undefined);
  api.deleteWeek.mockResolvedValue(undefined);
  api.assignModule.mockResolvedValue(undefined);
  api.unassignModule.mockResolvedValue(undefined);
  api.reorderWeekModules.mockResolvedValue(undefined);
});

describe('CourseManagement (restructure U3)', () => {
  test('renders the course with its weeks in order and member titles', async () => {
    render(<CourseManagement onBack={() => {}} />);
    expect(
      await screen.findByRole('heading', { name: /understanding & deciding when to use ai/i }),
    ).toBeInTheDocument();

    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual([
      'Week 0 — Claude Set-up',
      'Week 1 — Break Claude on Purpose',
      'Week 5',
    ]);
    expect(screen.getByText('Break Claude')).toBeInTheDocument();
    expect(screen.getByText('Confidently wrong')).toBeInTheDocument();
  });

  test('assign picks a published module and calls assignModule for that week', async () => {
    render(<CourseManagement onBack={() => {}} />);
    await screen.findByText('Break Claude');

    const picker = screen.getByLabelText(/assign a published module to week 0/i);
    // Only the assignable (published, unassigned) modules are offered.
    expect(within(picker).getByRole('option', { name: /1\.1/ })).toBeInTheDocument();
    expect(within(picker).queryByRole('option', { name: /c1-w1-break/ })).not.toBeInTheDocument();

    await userEvent.selectOptions(picker, '1.1');
    await userEvent.click(within(picker.closest('div')!).getByRole('button', { name: 'Assign' }));

    expect(api.assignModule).toHaveBeenCalledWith('w0', '1.1');
    expect(api.fetchCourseAuthoring).toHaveBeenCalledTimes(2); // initial + reload
  });

  test('move a member up reorders the week with the full ordered list', async () => {
    render(<CourseManagement onBack={() => {}} />);
    await screen.findByText('Break Claude');

    await userEvent.click(screen.getByRole('button', { name: /move c1-w1-wrong up/i }));
    expect(api.reorderWeekModules).toHaveBeenCalledWith('w1', ['c1-w1-wrong', 'c1-w1-break']);
  });

  test('unassign removes exactly that member', async () => {
    render(<CourseManagement onBack={() => {}} />);
    await screen.findByText('Break Claude');

    await userEvent.click(screen.getByRole('button', { name: /unassign c1-w1-break/i }));
    expect(api.unassignModule).toHaveBeenCalledWith('c1-w1-break');
  });

  test('move a week down reorders the course weeks with the full ordered list', async () => {
    render(<CourseManagement onBack={() => {}} />);
    await screen.findByText('Break Claude');

    await userEvent.click(screen.getByRole('button', { name: /move week 0 down/i }));
    expect(api.reorderWeeks).toHaveBeenCalledWith('c1', ['w1', 'w0', 'w5']);
  });

  test('create week posts title + subtitle (blank subtitle → null)', async () => {
    render(<CourseManagement onBack={() => {}} />);
    await screen.findByText('Break Claude');

    await userEvent.click(screen.getByRole('button', { name: /new week/i }));
    await userEvent.type(screen.getByLabelText(/^title$/i), 'Week 9');
    await userEvent.click(screen.getByRole('button', { name: /create week/i }));

    expect(api.createWeek).toHaveBeenCalledWith('c1', 'Week 9', null);
  });

  test('empty title blocks week creation (button disabled)', async () => {
    render(<CourseManagement onBack={() => {}} />);
    await screen.findByText('Break Claude');

    await userEvent.click(screen.getByRole('button', { name: /new week/i }));
    expect(screen.getByRole('button', { name: /create week/i })).toBeDisabled();
    expect(api.createWeek).not.toHaveBeenCalled();
  });

  test('rename week pre-fills the form and posts updateWeek', async () => {
    render(<CourseManagement onBack={() => {}} />);
    await screen.findByText('Break Claude');

    await userEvent.click(screen.getByRole('button', { name: /rename week 5/i }));
    const title = screen.getByLabelText(/^title$/i);
    expect(title).toHaveValue('Week 5');
    await userEvent.type(screen.getByLabelText(/subtitle/i), 'Ship It');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(api.updateWeek).toHaveBeenCalledWith('w5', 'Week 5', 'Ship It');
  });

  test('delete is offered only for empty weeks and confirms first', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<CourseManagement onBack={() => {}} />);
    await screen.findByText('Break Claude');

    // Week 1 has members → its delete button is disabled (unassign first).
    expect(screen.getByRole('button', { name: /delete week 1/i })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: /delete week 5/i }));
    expect(api.deleteWeek).toHaveBeenCalledWith('w5');
    vi.restoreAllMocks();
  });

  test('delete does nothing when the confirm is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<CourseManagement onBack={() => {}} />);
    await screen.findByText('Break Claude');

    await userEvent.click(screen.getByRole('button', { name: /delete week 5/i }));
    expect(api.deleteWeek).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  test('surfaces the server message when a write fails (e.g. named-offender 400)', async () => {
    api.assignModule.mockRejectedValueOnce(
      new Error('`1.1` is already assigned to Week 1. Unassign it first.'),
    );
    render(<CourseManagement onBack={() => {}} />);
    await screen.findByText('Break Claude');

    const picker = screen.getByLabelText(/assign a published module to week 0/i);
    await userEvent.selectOptions(picker, '1.1');
    await userEvent.click(within(picker.closest('div')!).getByRole('button', { name: 'Assign' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already assigned to Week 1/i);
  });
});

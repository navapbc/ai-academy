// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CohortManagement from './CohortManagement';
import type { CohortManagementData } from '../../lib/adminCohorts';

const h = vi.hoisted(() => ({
  fetchCohortManagement: vi.fn(),
  createCohort: vi.fn(),
  renameCohort: vi.fn(),
  archiveCohort: vi.fn(),
  deleteCohort: vi.fn(),
  enrollLearner: vi.fn(),
  unenrollLearner: vi.fn(),
  assignChampion: vi.fn(),
  unassignChampion: vi.fn(),
}));
vi.mock('../../lib/adminCohorts', () => h);

const DATA: CohortManagementData = {
  cohorts: [
    {
      id: 'c-a',
      name: 'Alpha cohort',
      archivedAt: null,
      members: [{ id: 'u1', name: 'Ada Lovelace', email: 'ada@navapbc.com', role: 'learner' }],
      champions: [],
    },
    {
      id: 'c-b',
      name: 'Beta cohort',
      archivedAt: null,
      members: [],
      champions: [],
    },
    {
      id: 'c-z',
      name: 'Zeta cohort (2025)',
      archivedAt: '2026-06-30T00:00:00Z',
      members: [{ id: 'u1', name: 'Ada Lovelace', email: 'ada@navapbc.com', role: 'learner' }],
      champions: [{ id: 'u2', name: 'Grace Hopper', email: 'grace@navapbc.com', role: 'champion' }],
    },
  ],
  users: [
    { id: 'u1', name: 'Ada Lovelace', email: 'ada@navapbc.com', role: 'learner' },
    { id: 'u2', name: 'Grace Hopper', email: 'grace@navapbc.com', role: 'champion' },
  ],
};

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset();
  h.fetchCohortManagement.mockResolvedValue(DATA);
  for (const fn of [h.createCohort, h.renameCohort, h.archiveCohort, h.deleteCohort, h.enrollLearner, h.unenrollLearner, h.assignChampion, h.unassignChampion])
    fn.mockResolvedValue(undefined);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('CohortManagement (P5.5a / U5 multi-enrollment)', () => {
  test('renders active cohorts with members after load; archived cohorts hidden by default', async () => {
    render(<CohortManagement onBack={() => {}} />);
    const alpha = await screen.findByRole('heading', { name: 'Alpha cohort' });
    expect(alpha).toBeInTheDocument();
    expect(screen.getByText('Learners (1)')).toBeInTheDocument();
    // the one member is listed with an Unenroll affordance
    expect(screen.getByRole('button', { name: 'Unenroll' })).toBeInTheDocument();
    // the archived cohort is not rendered until the toggle is on
    expect(screen.queryByRole('heading', { name: 'Zeta cohort (2025)' })).not.toBeInTheDocument();
  });

  test('creating a cohort calls createCohort then reloads', async () => {
    render(<CohortManagement onBack={() => {}} />);
    await screen.findByText('Alpha cohort');

    await userEvent.type(screen.getByLabelText(/new cohort name/i), 'Fall 2026');
    await userEvent.click(screen.getByRole('button', { name: /create/i }));

    expect(h.createCohort).toHaveBeenCalledWith('Fall 2026');
    expect(h.fetchCohortManagement).toHaveBeenCalledTimes(2); // initial + reload
  });

  test('enrolling a learner from the picker calls enrollLearner with the cohort + user', async () => {
    render(<CohortManagement onBack={() => {}} />);
    await screen.findByText('Alpha cohort');

    // u1 is already an Alpha member, so only u2 (Grace) is enrollable there.
    const enrollSelects = screen.getAllByLabelText(/enroll a learner/i);
    const alphaEnroll = enrollSelects[0];
    await userEvent.selectOptions(alphaEnroll, 'u2');
    // The Add button sits in the same picker row as its select.
    const picker = alphaEnroll.closest('div')!;
    await userEvent.click(within(picker).getByRole('button', { name: 'Add' }));

    expect(h.enrollLearner).toHaveBeenCalledWith('c-a', 'u2');
  });

  test('unenroll is cohort-scoped: passes both the cohort id and the user id', async () => {
    render(<CohortManagement onBack={() => {}} />);
    await screen.findByText('Alpha cohort');

    await userEvent.click(screen.getByRole('button', { name: 'Unenroll' }));

    expect(h.unenrollLearner).toHaveBeenCalledWith('c-a', 'u1');
  });

  test('archiving a cohort confirms and calls archiveCohort', async () => {
    render(<CohortManagement onBack={() => {}} />);
    await screen.findByText('Alpha cohort');

    await userEvent.click(screen.getByRole('button', { name: 'Archive Alpha cohort' }));

    expect(window.confirm).toHaveBeenCalled();
    expect(h.archiveCohort).toHaveBeenCalledWith('c-a');
  });

  test('delete is disabled for a cohort with enrollments and enabled at zero', async () => {
    render(<CohortManagement onBack={() => {}} />);
    await screen.findByText('Alpha cohort');

    // Alpha has one member → delete disabled (the function would 409 anyway).
    expect(screen.getByRole('button', { name: 'Delete Alpha cohort' })).toBeDisabled();

    // Beta has zero members → delete allowed.
    const deleteBeta = screen.getByRole('button', { name: 'Delete Beta cohort' });
    expect(deleteBeta).toBeEnabled();
    await userEvent.click(deleteBeta);
    expect(h.deleteCohort).toHaveBeenCalledWith('c-b');
  });

  test('the show-archived toggle reveals a read-only archived cohort', async () => {
    render(<CohortManagement onBack={() => {}} />);
    await screen.findByText('Alpha cohort');

    await userEvent.click(screen.getByLabelText(/show archived cohorts/i));

    expect(screen.getByRole('heading', { name: 'Zeta cohort (2025)' })).toBeInTheDocument();
    expect(screen.getByText('Archived · read-only')).toBeInTheDocument();

    const zetaCard = screen
      .getByRole('heading', { name: 'Zeta cohort (2025)' })
      .closest('div[class*="rounded-xl"]') as HTMLElement;
    // Read-only: no enroll/assign pickers, no unenroll, no rename/archive.
    expect(within(zetaCard).queryByLabelText(/enroll a learner/i)).not.toBeInTheDocument();
    expect(within(zetaCard).queryByLabelText(/assign a champion/i)).not.toBeInTheDocument();
    expect(within(zetaCard).queryByRole('button', { name: 'Unenroll' })).not.toBeInTheDocument();
    expect(
      within(zetaCard).queryByRole('button', { name: 'Rename Zeta cohort (2025)' }),
    ).not.toBeInTheDocument();
    expect(
      within(zetaCard).queryByRole('button', { name: 'Archive Zeta cohort (2025)' }),
    ).not.toBeInTheDocument();
    // Unassign stays (explicit unassign is the only demotion path post-archive)…
    expect(within(zetaCard).getByRole('button', { name: 'Unassign' })).toBeInTheDocument();
    // …and delete is present but disabled while enrollments exist.
    expect(
      within(zetaCard).getByRole('button', { name: 'Delete Zeta cohort (2025)' }),
    ).toBeDisabled();
  });

  test('surfaces an error when an action fails (e.g. the delete 409 guard)', async () => {
    h.createCohort.mockRejectedValueOnce(new Error('Only an admin may manage cohorts.'));
    render(<CohortManagement onBack={() => {}} />);
    await screen.findByText('Alpha cohort');

    await userEvent.type(screen.getByLabelText(/new cohort name/i), 'X');
    await userEvent.click(screen.getByRole('button', { name: /create/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/only an admin may manage cohorts/i);
  });
});

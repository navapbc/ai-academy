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
      members: [{ id: 'u1', name: 'Ada Lovelace', email: 'ada@navapbc.com', role: 'learner' }],
      champions: [],
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
  for (const fn of [h.createCohort, h.renameCohort, h.deleteCohort, h.enrollLearner, h.unenrollLearner, h.assignChampion, h.unassignChampion])
    fn.mockResolvedValue(undefined);
});

describe('CohortManagement (P5.5a)', () => {
  test('renders cohorts with members after load', async () => {
    render(<CohortManagement onBack={() => {}} />);
    expect(await screen.findByRole('heading', { name: 'Alpha cohort' })).toBeInTheDocument();
    expect(screen.getByText('Learners (1)')).toBeInTheDocument();
    expect(screen.getByText('Champions (0)')).toBeInTheDocument();
    // the one member is listed with an Unenroll affordance
    expect(screen.getByRole('button', { name: 'Unenroll' })).toBeInTheDocument();
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

    // u1 is already a member, so only u2 (Grace) is enrollable.
    const enrollSelect = screen.getByLabelText(/enroll a learner/i);
    await userEvent.selectOptions(enrollSelect, 'u2');
    // The Add button sits in the same picker row as its select.
    const picker = enrollSelect.closest('div')!;
    await userEvent.click(within(picker).getByRole('button', { name: 'Add' }));

    expect(h.enrollLearner).toHaveBeenCalledWith('c-a', 'u2');
  });

  test('surfaces an error when an action fails', async () => {
    h.createCohort.mockRejectedValueOnce(new Error('Only an admin may manage cohorts.'));
    render(<CohortManagement onBack={() => {}} />);
    await screen.findByText('Alpha cohort');

    await userEvent.type(screen.getByLabelText(/new cohort name/i), 'X');
    await userEvent.click(screen.getByRole('button', { name: /create/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/only an admin may manage cohorts/i);
  });
});

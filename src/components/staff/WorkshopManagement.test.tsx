// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WorkshopManagement from './WorkshopManagement';
import type { Workshop } from '../../lib/workshops';
import type { Phase } from '../../types';

// Mock the write client (adminWorkshops), the workshop read (workshops), and the
// curriculum read (modules) so the test exercises only the panel's UI logic.
const admin = vi.hoisted(() => ({
  createWorkshop: vi.fn(),
  updateWorkshop: vi.fn(),
  deleteWorkshop: vi.fn(),
}));
vi.mock('../../lib/adminWorkshops', () => admin);

const reads = vi.hoisted(() => ({
  fetchWorkshops: vi.fn(),
  fetchCurriculum: vi.fn(),
}));
vi.mock('../../lib/workshops', () => ({ fetchWorkshops: reads.fetchWorkshops }));
vi.mock('../../lib/modules', () => ({ fetchCurriculum: reads.fetchCurriculum }));

const WORKSHOPS: Workshop[] = [
  { id: 'w1', title: 'Prompting basics', intro: null, stepCellIds: ['1.1', '1.4'] },
];

// Only the fields WorkshopManagement reads (cellId, title, status). One draft
// module is present to prove the picker offers PUBLISHED cells only.
const PHASES = [
  {
    modules: [
      { cellId: '1.1', title: 'Rules of the road', status: 'published' },
      { cellId: '1.4', title: 'Getting access', status: 'published' },
      { cellId: '2.1', title: 'Your first lab', status: 'published' },
      { cellId: '9.9', title: 'Draft lesson', status: 'draft' },
    ],
  },
] as unknown as Phase[];

beforeEach(() => {
  for (const fn of [...Object.values(admin), ...Object.values(reads)]) fn.mockReset();
  reads.fetchWorkshops.mockResolvedValue(WORKSHOPS);
  reads.fetchCurriculum.mockResolvedValue(PHASES);
  admin.createWorkshop.mockResolvedValue(undefined);
  admin.updateWorkshop.mockResolvedValue(undefined);
  admin.deleteWorkshop.mockResolvedValue(undefined);
});

describe('WorkshopManagement (X.3 Unit 3)', () => {
  test('renders the workshop list with title + step count', async () => {
    render(<WorkshopManagement onBack={() => {}} />);
    expect(await screen.findByRole('heading', { name: 'Prompting basics' })).toBeInTheDocument();
    expect(screen.getByText('2 steps')).toBeInTheDocument();
  });

  test('empty state when there are no workshops', async () => {
    reads.fetchWorkshops.mockResolvedValue([]);
    render(<WorkshopManagement onBack={() => {}} />);
    expect(await screen.findByText(/no workshops yet/i)).toBeInTheDocument();
  });

  test('create calls createWorkshop with title + ordered stepCellIds (published only)', async () => {
    render(<WorkshopManagement onBack={() => {}} />);
    await screen.findByText('Prompting basics');

    await userEvent.click(screen.getByRole('button', { name: /new workshop/i }));
    await userEvent.type(screen.getByLabelText(/^title$/i), 'Advanced flow');

    const picker = screen.getByLabelText(/add a published module/i);
    // The draft cell (9.9) must NOT be offered.
    expect(within(picker).queryByRole('option', { name: /9\.9/ })).not.toBeInTheDocument();

    // Add 1.1 then 2.1 (in that order); the "Add" button sits beside the select.
    const addBtn = () =>
      within(picker.closest('div')!).getByRole('button', { name: 'Add' });
    await userEvent.selectOptions(picker, '1.1');
    await userEvent.click(addBtn());
    await userEvent.selectOptions(picker, '2.1');
    await userEvent.click(addBtn());

    await userEvent.click(screen.getByRole('button', { name: /create workshop/i }));

    expect(admin.createWorkshop).toHaveBeenCalledWith('Advanced flow', ['1.1', '2.1'], null);
    expect(reads.fetchWorkshops).toHaveBeenCalledTimes(2); // initial + reload
  });

  test('reorder (move up) changes the saved step order', async () => {
    render(<WorkshopManagement onBack={() => {}} />);
    await screen.findByText('Prompting basics');

    // Edit the existing workshop (steps: 1.1, 1.4).
    await userEvent.click(screen.getByRole('button', { name: /edit prompting basics/i }));

    // Move the second step (1.4) up so order becomes 1.4, 1.1.
    await userEvent.click(screen.getByRole('button', { name: /move 1\.4 up/i }));
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(admin.updateWorkshop).toHaveBeenCalledWith('w1', 'Prompting basics', ['1.4', '1.1'], null);
  });

  test('empty title blocks the save (button disabled)', async () => {
    render(<WorkshopManagement onBack={() => {}} />);
    await screen.findByText('Prompting basics');

    await userEvent.click(screen.getByRole('button', { name: /new workshop/i }));
    expect(screen.getByRole('button', { name: /create workshop/i })).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/^title$/i), '   ');
    expect(screen.getByRole('button', { name: /create workshop/i })).toBeDisabled();
    expect(admin.createWorkshop).not.toHaveBeenCalled();
  });

  test('delete confirms then calls deleteWorkshop', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<WorkshopManagement onBack={() => {}} />);
    await screen.findByText('Prompting basics');

    await userEvent.click(screen.getByRole('button', { name: /delete prompting basics/i }));
    expect(admin.deleteWorkshop).toHaveBeenCalledWith('w1');
    vi.restoreAllMocks();
  });

  test('surfaces an error when a write fails', async () => {
    admin.createWorkshop.mockRejectedValueOnce(new Error('Only an admin may manage workshops.'));
    render(<WorkshopManagement onBack={() => {}} />);
    await screen.findByText('Prompting basics');

    await userEvent.click(screen.getByRole('button', { name: /new workshop/i }));
    await userEvent.type(screen.getByLabelText(/^title$/i), 'X');
    await userEvent.click(screen.getByRole('button', { name: /create workshop/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/only an admin may manage workshops/i);
  });
});

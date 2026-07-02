// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WorkshopList from './WorkshopList';
import type { Workshop } from '../lib/workshops';

const { useWorkshops } = vi.hoisted(() => ({ useWorkshops: vi.fn() }));
vi.mock('../lib/useWorkshops', () => ({ useWorkshops }));

const WORKSHOPS: Workshop[] = [
  { id: 'w1', title: 'Writing with AI', intro: 'A curated path', stepCellIds: ['2.6', '2.7', '2.10'] },
  { id: 'w2', title: 'Empty path', intro: null, stepCellIds: [] },
];

function mockHook(over: Partial<ReturnType<typeof useWorkshops>> = {}) {
  useWorkshops.mockReturnValue({
    workshops: WORKSHOPS,
    loading: false,
    error: null,
    reload: vi.fn(),
    getWorkshop: vi.fn(),
    ...over,
  });
}

beforeEach(() => {
  useWorkshops.mockReset();
});

describe('WorkshopList', () => {
  test('renders workshops with derived per-workshop progress', () => {
    mockHook();
    render(<WorkshopList completedModuleIds={['2.6', '2.10']} onLaunch={() => {}} />);

    expect(screen.getByRole('heading', { name: 'Workshops' })).toBeInTheDocument();
    expect(screen.getByText('Writing with AI')).toBeInTheDocument();
    // 2 of the 3 steps complete (2.6, 2.10 done; 2.7 not).
    expect(screen.getByText('2 of 3 steps')).toBeInTheDocument();
    expect(screen.getByText('67%')).toBeInTheDocument();
  });

  test('a fully complete workshop shows a Complete badge', () => {
    mockHook({ workshops: [WORKSHOPS[0]] });
    render(
      <WorkshopList completedModuleIds={['2.6', '2.7', '2.10']} onLaunch={() => {}} />,
    );
    expect(screen.getByText('Complete')).toBeInTheDocument();
    expect(screen.getByText('3 of 3 steps')).toBeInTheDocument();
  });

  test('launching a workshop calls onLaunch with its id', async () => {
    mockHook({ workshops: [WORKSHOPS[0]] });
    const onLaunch = vi.fn();
    render(<WorkshopList completedModuleIds={[]} onLaunch={onLaunch} />);

    await userEvent.click(screen.getByRole('button', { name: /start workshop/i }));
    expect(onLaunch).toHaveBeenCalledWith('w1');
  });

  test('a partially complete workshop offers Continue', () => {
    mockHook({ workshops: [WORKSHOPS[0]] });
    render(<WorkshopList completedModuleIds={['2.6']} onLaunch={() => {}} />);
    expect(screen.getByRole('button', { name: /continue workshop/i })).toBeInTheDocument();
  });

  test('an empty workshop disables its launch button', () => {
    mockHook({ workshops: [WORKSHOPS[1]] });
    render(<WorkshopList completedModuleIds={[]} onLaunch={() => {}} />);
    expect(screen.getByRole('button', { name: /start workshop/i })).toBeDisabled();
  });

  test('empty state when there are no workshops', () => {
    mockHook({ workshops: [] });
    render(<WorkshopList completedModuleIds={[]} onLaunch={() => {}} />);
    expect(screen.getByText(/no workshops are available yet/i)).toBeInTheDocument();
  });

  test('error state shows a retry that reloads', async () => {
    const reload = vi.fn();
    mockHook({ workshops: [], error: 'Could not load workshops.', reload });
    render(<WorkshopList completedModuleIds={[]} onLaunch={() => {}} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/could not load/i);
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(reload).toHaveBeenCalled();
  });
});

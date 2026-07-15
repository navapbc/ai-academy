// @vitest-environment jsdom
import { describe, test, expect, vi } from 'vitest';
import type React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WorkshopRunner from './WorkshopRunner';
import type { Module } from '../types';
import type { Workshop } from '../lib/workshops';

// ModuleRenderer is mocked to a recognizable marker exposing the module id and a
// button that fires onComplete (with a via, per U9) — so we assert the runner
// reuses it per step and routes completion through the passed-in callback (no
// second write), without pulling in the real renderer's children.
vi.mock('./ModuleRenderer', () => ({
  default: ({ module, onComplete }: { module: Module; onComplete: (via: string) => void }) => (
    <div data-testid="stub-module-renderer">
      <span>STEP:{module.id}</span>
      <button onClick={() => onComplete('explored')}>complete step</button>
    </div>
  ),
}));

function makeModule(id: string): Module {
  return {
    id,
    cellId: id,
    origin: 'matrix',
    visibility: 'public',
    title: `Module ${id}`,
    type: 'content',
    content: '# body',
    phaseId: 'stage-2',
    stage: '2',
    status: 'published',
    dimension: ['Diligence'],
    evidenceType: 'quiz',
    selfReportValidity: 'medium',
    progressResetAt: null,
  };
}

const WORKSHOP: Workshop = {
  id: 'w1',
  title: 'Writing with AI',
  intro: 'A curated path',
  stepCellIds: ['2.6', '2.7', '2.10'],
};

const modules = new Map([
  ['2.6', makeModule('2.6')],
  ['2.7', makeModule('2.7')],
  ['2.10', makeModule('2.10')],
]);

function renderRunner(over: Partial<React.ComponentProps<typeof WorkshopRunner>> = {}) {
  const props: React.ComponentProps<typeof WorkshopRunner> = {
    workshop: WORKSHOP,
    moduleById: (id) => modules.get(id),
    isStepLocked: () => false,
    completedModuleIds: [],
    selectedPersona: 'default',
    onCompleteModule: vi.fn(),
    onExit: vi.fn(),
    ...over,
  };
  const result = render(<WorkshopRunner {...props} />);
  return { ...result, props };
}

describe('WorkshopRunner', () => {
  test('renders the first step via ModuleRenderer and shows position + progress', () => {
    renderRunner({ completedModuleIds: ['2.6'] });
    expect(screen.getByText('STEP:2.6')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
    // Derived progress: 1 of the 3 steps completed.
    expect(screen.getByText('1 of 3 complete')).toBeInTheDocument();
  });

  test('next / prev navigate between steps', async () => {
    renderRunner();
    expect(screen.getByText('STEP:2.6')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('STEP:2.7')).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('STEP:2.10')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: /previous/i }));
    expect(screen.getByText('STEP:2.7')).toBeInTheDocument();
  });

  test('completing a step routes to onCompleteModule with the module id and via (no second write)', async () => {
    const { props } = renderRunner();
    await userEvent.click(screen.getByRole('button', { name: /complete step/i }));
    expect(props.onCompleteModule).toHaveBeenCalledWith('2.6', 'explored');
  });

  test('a step whose module is unavailable shows an unavailable state, not the renderer; nav still works', async () => {
    // 2.7 is not in the curriculum map (unpublished/archived).
    renderRunner({ moduleById: (id) => (id === '2.7' ? undefined : modules.get(id)) });

    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/isn't available/i)).toBeInTheDocument();
    expect(screen.queryByTestId('stub-module-renderer')).not.toBeInTheDocument();
    // The unavailable step still identifies which cell it is, and next/prev work.
    expect(screen.getByText(/2\.7/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('STEP:2.10')).toBeInTheDocument();
  });

  test('a gated/locked step shows the locked state and never renders the module', () => {
    renderRunner({ isStepLocked: (m) => m.id === '2.6' });
    expect(screen.getByText(/this step is locked/i)).toBeInTheDocument();
    expect(screen.queryByTestId('stub-module-renderer')).not.toBeInTheDocument();
  });

  test('a single-step workshop disables both nav buttons', () => {
    renderRunner({ workshop: { ...WORKSHOP, stepCellIds: ['2.6'] } });
    expect(screen.getByText('Step 1 of 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  test('an empty workshop shows a no-steps message', () => {
    renderRunner({ workshop: { ...WORKSHOP, stepCellIds: [] } });
    expect(screen.getByText(/no steps yet/i)).toBeInTheDocument();
  });

  test('exit calls onExit', async () => {
    const { props } = renderRunner();
    await userEvent.click(screen.getByRole('button', { name: /all workshops/i }));
    expect(props.onExit).toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LockedNotice from './LockedNotice';

// The Stage-2 gate's content-view fallback (P3.11). Shown when the current
// module is locked; reports progress and routes to the first incomplete
// Stage-1a module.
describe('LockedNotice', () => {
  test('reports Stage-1a progress and the locked-stage message', () => {
    render(<LockedNotice completed={1} total={3} onGoToStage1a={() => {}} canGoToStage1a />);
    expect(screen.getByText('Stage 2 is locked')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  test('the "Go to Stage 1a" button fires the handler when there is somewhere to go', async () => {
    const onGo = vi.fn();
    render(<LockedNotice completed={0} total={3} onGoToStage1a={onGo} canGoToStage1a />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Go to Stage 1a/i }));
    expect(onGo).toHaveBeenCalledOnce();
  });

  test('the button is disabled when there is nowhere to go', () => {
    render(<LockedNotice completed={3} total={3} onGoToStage1a={() => {}} canGoToStage1a={false} />);
    expect(screen.getByRole('button', { name: /Go to Stage 1a/i })).toBeDisabled();
  });
});

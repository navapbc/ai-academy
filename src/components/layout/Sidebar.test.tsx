// @vitest-environment jsdom
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Sidebar from './Sidebar';
import type { Phase, UserProgress } from '../../types';

// The role-gated Staff nav entry (P5.1d). A learner must have no path to the
// staff view — the entry only renders for champions/admins (the RoleGuard on
// the view is the backstop). Empty phases keep the test focused on the nav.
const phases: Phase[] = [];
const progress: UserProgress = { completedModuleIds: [], currentModuleId: '' };

function renderSidebar(isStaff: boolean, onViewChange = vi.fn()) {
  render(
    <Sidebar
      isOpen
      onClose={() => {}}
      phases={phases}
      progress={progress}
      onModuleSelect={() => {}}
      overallProgress={0}
      onOpenSupport={() => {}}
      activeView="learning"
      onViewChange={onViewChange}
      isStaff={isStaff}
      stage1aDone={false}
      stage1aCompleted={0}
      stage1aTotal={7}
    />,
  );
  return onViewChange;
}

describe('Sidebar staff entry (P5.1d)', () => {
  test('a learner sees no Staff entry', () => {
    renderSidebar(false);
    expect(screen.queryByRole('button', { name: /Staff/i })).not.toBeInTheDocument();
  });

  test('a staff user sees the Staff entry and it navigates to the staff view', async () => {
    const onViewChange = renderSidebar(true);
    const staffButton = screen.getByRole('button', { name: /Staff/i });
    expect(staffButton).toBeInTheDocument();
    await userEvent.setup().click(staffButton);
    expect(onViewChange).toHaveBeenCalledWith('staff');
  });
});

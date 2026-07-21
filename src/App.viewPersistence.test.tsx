// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import type { Curriculum, CurriculumSection, Module, UserProgress } from './types';

// Regression test: the active top-nav tab (Learning/Playground/My progress/
// Staff) must survive a page refresh instead of always bouncing back to
// Learning. Mirrors App.progress.test.tsx's mock seams.
const { useCurriculum, useAuth, useProgress, useRole } = vi.hoisted(() => ({
  useCurriculum: vi.fn(),
  useAuth: vi.fn(),
  useProgress: vi.fn(),
  useRole: vi.fn(),
}));
vi.mock('./lib/useCurriculum', () => ({ useCurriculum }));
vi.mock('./lib/auth', () => ({ useAuth, AuthProvider: ({ children }: { children: unknown }) => children }));
vi.mock('./lib/useProgress', () => ({ useProgress }));
vi.mock('./lib/useRole', () => ({
  useRole,
  isAllowed: (role: string | null, allow: readonly string[]) => !!role && allow.includes(role),
}));

function visibleModule(id: string, title: string): Module {
  return {
    id,
    cellId: id,
    title,
    type: 'content',
    content: `# ${title}`,
    phaseId: 'supplemental',
    origin: 'matrix',
    stage: '1a',
    visibility: 'public',
    status: 'published',
    dimension: ['Diligence'],
    evidenceType: 'quiz',
    selfReportValidity: 'medium',
    progressResetAt: null,
  };
}

const twoVisible: CurriculumSection[] = [
  {
    kind: 'supplemental',
    id: 'supplemental',
    week: 'Supplemental',
    title: 'Supplemental coursework',
    description: '',
    modules: [visibleModule('1.4', 'Data classification'), visibleModule('1.5', 'Prompting basics')],
  },
];

const curriculum: Curriculum = { sections: twoVisible, moduleRowCount: 2 };

function mockProgress(progress: UserProgress) {
  useProgress.mockReturnValue({
    progress,
    completeModule: vi.fn(),
    selectModule: vi.fn(),
    resetModuleIds: new Set<string>(),
    error: null,
    dismissError: vi.fn(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  localStorage.setItem('academy-entered-u1', '1');
  useAuth.mockReturnValue({
    loading: false,
    session: { user: { id: 'u1' } },
    signOut: vi.fn(),
    user: { id: 'u1', email: 'demo@navapbc.com' },
  });
  useRole.mockReturnValue({ role: 'learner', loading: false, isStaff: false });
  useCurriculum.mockReturnValue({ curriculum, loading: false, error: null });
  mockProgress({ completedModuleIds: [], currentModuleId: '1.4' });
});

describe('App — active tab survives a refresh', () => {
  test('switching to Playground and remounting (simulating a refresh) stays on Playground', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);

    await user.click(screen.getByRole('button', { name: /playground/i }));
    expect(screen.getByLabelText('Prompting playground')).toBeInTheDocument();

    // A page refresh throws away React state but not localStorage.
    unmount();
    render(<App />);

    expect(screen.getByLabelText('Prompting playground')).toBeInTheDocument();
  });

  test('with no stored tab, a fresh session still defaults to Learning', () => {
    render(<App />);
    expect(screen.getByLabelText('Data classification')).toBeInTheDocument();
  });
});

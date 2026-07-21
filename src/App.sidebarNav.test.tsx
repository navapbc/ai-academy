// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import type { Curriculum, CurriculumSection, Module, UserProgress } from './types';

// Regression test: selecting a sidebar module row while on a non-Learning tab
// (Playground/My progress/Staff) must switch back to the Learning view so the
// selected module's content is actually visible, not just update state silently.
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
});

describe('App — sidebar module selection navigates from any tab', () => {
  test('selecting a module from the sidebar while on Playground switches to the Learning content pane', async () => {
    const user = userEvent.setup();
    mockProgress({ completedModuleIds: [], currentModuleId: '1.4' });
    render(<App />);

    await user.click(screen.getByRole('button', { name: /playground/i }));
    expect(screen.getByLabelText('Prompting playground')).toBeInTheDocument();

    // `selectModule` is mocked, so it won't actually change `currentModuleId` —
    // what matters here is that clicking a sidebar row switches back to the
    // Learning content pane. Click the row for the already-current module.
    const nav = screen.getByRole('navigation', { name: /course navigation/i });
    await user.click(within(nav).getByRole('button', { name: /Data classification/i }));

    expect(screen.queryByLabelText('Prompting playground')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Data classification')).toBeInTheDocument();
  });
});

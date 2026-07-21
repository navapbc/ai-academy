// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';
import type { Curriculum, CurriculumSection, Module, UserProgress } from './types';

// Regression test: the Sidebar's "Your Training" overall percentage/count must
// exclude 'matrix'-origin modules (the ungated "Supplemental coursework"
// section) — matches the same exclusion applied to the My Progress dashboard's
// Completion card (summarizeOwnProgress).
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

function courseModule(id: string, title: string): Module {
  return {
    id,
    cellId: id,
    title,
    type: 'content',
    content: `# ${title}`,
    phaseId: 'week-w-0',
    origin: 'course',
    stage: null,
    visibility: 'public',
    status: 'published',
    dimension: ['Diligence'],
    evidenceType: 'quiz',
    selfReportValidity: 'medium',
    progressResetAt: null,
  };
}

function matrixModule(id: string, title: string): Module {
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

// 1 completed + 1 not-yet-started course module, plus 2 completed supplemental
// modules. A denominator that (wrongly) includes supplemental would read 3/4
// (75%); the correct, course-only denominator is 1/2 (50%).
const sections: CurriculumSection[] = [
  {
    kind: 'week',
    id: 'week-w-0',
    week: 'Week 0',
    title: 'Orientation',
    description: '',
    courseId: 'c-1',
    courseTitle: 'Course 1',
    modules: [courseModule('c1-w0-a', 'Setup'), courseModule('c1-w0-b', 'Wrap-up')],
  },
  {
    kind: 'supplemental',
    id: 'supplemental',
    week: 'Supplemental',
    title: 'Supplemental coursework',
    description: '',
    modules: [matrixModule('1.4', 'Data classification'), matrixModule('1.5', 'Prompting basics')],
  },
];

const curriculum: Curriculum = { sections, moduleRowCount: 4 };

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

describe('Sidebar "Your Training" headline excludes supplemental coursework', () => {
  test('completed supplemental modules do not move the percentage or the N of M count', () => {
    mockProgress({
      completedModuleIds: ['c1-w0-a', '1.4', '1.5'],
      currentModuleId: 'c1-w0-a',
    });
    render(<App />);

    expect(screen.getByText('50%')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: /Overall training progress/i });
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText('1 of 2 complete')).toBeInTheDocument();
  });
});

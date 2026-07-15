// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';
import type { Curriculum, CurriculumSection, Module, UserProgress } from './types';

// Visible-denominator guard (restructure U2, review FIX E-1): the headline
// progress is numerator = completions ∩ the VISIBLE module set, denominator =
// visible modules. A learner whose stored completions include ids no longer
// visible to them (a module unassigned/archived, a lost enrollment, a stale
// cache) must see ≤ 100%, computed over the intersection — never an inflated
// percentage. Mirrors App.empty.test.tsx's mock seams.
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

/** Two visible modules — the denominator the UI must compute against. */
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
  // jsdom has no scrollIntoView; the (hidden) Playground calls it on mount.
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  useAuth.mockReturnValue({
    loading: false,
    session: { user: { id: 'u1' } },
    signOut: vi.fn(),
    user: { id: 'u1', email: 'demo@navapbc.com' },
  });
  useRole.mockReturnValue({ role: 'learner', loading: false, isStaff: false });
  useCurriculum.mockReturnValue({ curriculum, loading: false, error: null });
});

describe('App — visible-denominator progress guard (U2 / FIX E-1)', () => {
  test('a completed id NOT in the visible set is excluded: 1 visible completion of 2 renders 50%, not 100%', () => {
    // 'ghost' is a completion for a module the learner can no longer see.
    mockProgress({ completedModuleIds: ['1.4', 'ghost'], currentModuleId: '1.4' });
    render(<App />);

    expect(screen.getByText('50%')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: /Overall training progress/i });
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    // The headline count uses the same intersection.
    expect(screen.getByText('1 of 2 complete')).toBeInTheDocument();
  });

  test('invisible completions can never push the percentage past 100%', () => {
    // Every visible module completed PLUS two stale invisible ids: a raw
    // completions/visible ratio would be 4/2 = 200%.
    mockProgress({
      completedModuleIds: ['1.4', '1.5', 'ghost-a', 'ghost-b'],
      currentModuleId: '1.5',
    });
    render(<App />);

    expect(screen.getByText('100%')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: /Overall training progress/i });
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByText('2 of 2 complete')).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';
import type { Curriculum, CurriculumSection, Module } from './types';

// FE-02, re-cut in restructure U2: the empty/error state keys on the modules
// query returning ZERO ROWS (curriculum.moduleRowCount === 0) — never on
// section shape. A viewer who legitimately receives only public rows (e.g. an
// unenrolled learner post-U4) groups into fewer sections and must render the
// academy normally.
const { useCurriculum, useAuth, useProgress, useRole, useWorkshops } = vi.hoisted(() => ({
  useCurriculum: vi.fn(),
  useAuth: vi.fn(),
  useProgress: vi.fn(),
  useRole: vi.fn(),
  useWorkshops: vi.fn(),
}));
vi.mock('./lib/useCurriculum', () => ({ useCurriculum }));
vi.mock('./lib/auth', () => ({ useAuth, AuthProvider: ({ children }: { children: unknown }) => children }));
vi.mock('./lib/useProgress', () => ({ useProgress }));
vi.mock('./lib/useRole', () => ({
  useRole,
  isAllowed: (role: string | null, allow: readonly string[]) => !!role && allow.includes(role),
}));
vi.mock('./lib/useWorkshops', () => ({ useWorkshops }));

const module14: Module = {
  id: '1.4',
  cellId: '1.4',
  title: 'Data classification',
  type: 'content',
  content: '# Data classification',
  phaseId: 'supplemental',
  origin: 'matrix',
  stage: '1a',
  visibility: 'public',
  status: 'published',
  dimension: ['Diligence'],
  evidenceType: 'quiz',
  selfReportValidity: 'medium',
};

const supplementalOnly: CurriculumSection[] = [
  {
    kind: 'supplemental',
    id: 'supplemental',
    week: 'Supplemental',
    title: 'Supplemental coursework',
    description: '',
    modules: [module14],
  },
];

const curriculumOf = (sections: CurriculumSection[], moduleRowCount: number): Curriculum => ({
  sections,
  moduleRowCount,
});

function signedIn() {
  useAuth.mockReturnValue({
    loading: false,
    session: { user: { id: 'u1' } },
    signOut: vi.fn(),
    user: { id: 'u1', email: 'demo@navapbc.com' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has no scrollIntoView; the (hidden) Playground calls it on mount.
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  useProgress.mockReturnValue({
    progress: { completedModuleIds: [], currentModuleId: '1.4' },
    completeModule: vi.fn(),
    selectModule: vi.fn(),
    error: null,
    dismissError: vi.fn(),
  });
  useRole.mockReturnValue({ role: 'learner', loading: false, isStaff: false });
  useWorkshops.mockReturnValue({
    workshops: [],
    loading: false,
    error: null,
    reload: vi.fn(),
    getWorkshop: vi.fn(() => undefined),
  });
});

describe('App — curriculum gating (U2 zero-rows discriminator)', () => {
  test('shows the empty-state message (no crash) when the modules query returned zero rows', () => {
    signedIn();
    useCurriculum.mockReturnValue({ curriculum: curriculumOf([], 0), loading: false, error: null });
    render(<App />);
    expect(screen.getByText(/No curriculum content is available yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  test('renders the academy normally when rows exist but group into only public sections (no FE-02 misfire)', () => {
    signedIn();
    useCurriculum.mockReturnValue({
      curriculum: curriculumOf(supplementalOnly, 1),
      loading: false,
      error: null,
    });
    render(<App />);
    expect(screen.queryByText(/No curriculum content is available yet/i)).not.toBeInTheDocument();
    // The academy shell mounted: the sidebar section header + the module row.
    expect(screen.getByRole('button', { name: /Supplemental coursework/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Data classification' })).toBeInTheDocument();
  });

  test('shows the empty-state message when rows exist but NONE are learner-visible (crash guard)', () => {
    signedIn();
    // e.g. every returned row is an unassigned course draft: sections all empty.
    useCurriculum.mockReturnValue({
      curriculum: curriculumOf([], 3),
      loading: false,
      error: null,
    });
    render(<App />);
    expect(screen.getByText(/No curriculum content is available yet/i)).toBeInTheDocument();
  });

  test('shows the fetch-error message when useCurriculum errors', () => {
    signedIn();
    useCurriculum.mockReturnValue({ curriculum: null, loading: false, error: 'Could not load the curriculum.' });
    render(<App />);
    expect(screen.getByText('Could not load the curriculum.')).toBeInTheDocument();
  });

  test('shows a spinner while the curriculum is loading', () => {
    signedIn();
    useCurriculum.mockReturnValue({ curriculum: null, loading: true, error: null });
    const { container } = render(<App />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });
});

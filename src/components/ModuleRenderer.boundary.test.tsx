// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ModuleRenderer from './ModuleRenderer';
import type { Module, PairedCalibrationConfig } from '../types';

// D-16 regression (audit 2026-06-09): a malformed authored row (quiz_json /
// lab_config_json) used to throw inside the exercise/quiz render and bubble to
// the app-level ErrorBoundary — white-screening the WHOLE academy. With the
// scoped SectionBoundary, only the failing widget shows a fallback card and the
// rest of the lesson survives. Unlike the dispatch test, the exercise/quiz
// children here are REAL (un-mocked) so the malformed configs actually throw.
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../lib/progress', () => ({
  fetchQuizSummary: vi.fn(async () => ({ best: null, latest: null })),
  recordQuizAttempt: vi.fn(async () => {}),
  recordLabSubmission: vi.fn(async () => 'sub-1'),
}));

beforeEach(() => {
  // React logs caught boundary errors; keep output clean.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

const base: Module = {
  id: '2.15',
  cellId: '2.15',
  origin: 'matrix',
  visibility: 'public',
  title: 'T',
  type: 'content',
  content: '# Lesson body text',
  phaseId: 'stage-2',
  stage: '2',
  status: 'published',
  dimension: ['Diligence'],
  evidenceType: 'performance-task',
  selfReportValidity: 'medium',
};

function renderModule(over: Partial<Module>) {
  return render(
    <ModuleRenderer module={{ ...base, ...over }} selectedPersona="default" onComplete={() => {}} />,
  );
}

describe('ModuleRenderer — malformed authored content is contained (D-16)', () => {
  test('a paired-calibration config missing offTask shows the scoped fallback; the lesson survives', () => {
    // Authoring typo: offTask absent. PairedCalibration reads offTask.label at render.
    const malformed = { kind: 'paired-calibration', intro: 'x' } as unknown as PairedCalibrationConfig;
    renderModule({ labConfig: malformed });

    // Pre-fix this render THROWS (jsdom: the whole tree unmounts). Post-fix:
    expect(screen.getByText('Lesson body text')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/This interactive exercise couldn['’]t load/);
  });

  test('a quiz question without options shows the scoped quiz fallback; the lesson survives', () => {
    renderModule({
      quiz: [{ question: 'Q1?' } as unknown as NonNullable<Module['quiz']>[number]],
    });

    expect(screen.getByText('Lesson body text')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/This quiz couldn['’]t load/);
  });

  test('a broken exercise does not take down a healthy quiz beside it', () => {
    const malformed = { kind: 'paired-calibration' } as unknown as PairedCalibrationConfig;
    renderModule({
      labConfig: malformed,
      quiz: [
        {
          question: 'Which is safest?',
          options: ['A', 'B'],
          correctIndex: 0,
        } as unknown as NonNullable<Module['quiz']>[number],
      ],
    });

    // The exercise card failed…
    expect(screen.getByRole('alert')).toHaveTextContent(/This interactive exercise couldn['’]t load/);
    // …but the quiz — the completion gate — still renders and works.
    expect(screen.getByText('Which is safest?')).toBeInTheDocument();
  });

  test('healthy content renders with no fallback (boundary is transparent)', () => {
    renderModule({
      quiz: [
        {
          question: 'Plain question?',
          options: ['A', 'B'],
          correctIndex: 0,
        } as unknown as NonNullable<Module['quiz']>[number],
      ],
    });
    expect(screen.getByText('Plain question?')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

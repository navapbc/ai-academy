// @vitest-environment jsdom
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModuleRenderer from './ModuleRenderer';
import type { LabConfig, Module, ModuleType } from '../types';

// Verifies ModuleRenderer's dispatch: module.type picks the interactive widget
// (renderInteractive) and labConfig.kind picks the exercise (renderExercise).
// Every child is mocked to a recognizable marker so we assert routing only, not
// child behavior. This is the seam new exercise kinds plug into, so a missing
// case (silent null render — see FE-06) is exactly what this guards.
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../lib/progress', () => ({ fetchQuizSummary: vi.fn(async () => ({ best: null, latest: null })) }));

// Inline factories (no shared helper) so nothing is referenced during the
// hoisted vi.mock execution.
vi.mock('./PrivacySimulator', () => ({ default: () => <div>STUB:PrivacySimulator</div> }));
vi.mock('./Lab', () => ({ default: () => <div>STUB:Lab</div> }));
vi.mock('./Quiz', () => ({
  default: () => <div data-testid="stub-quiz">STUB:Quiz</div>,
}));
vi.mock('./UseCaseLib', () => ({ default: () => <div>STUB:UseCaseLib</div> }));
vi.mock('./ScenarioSorter', () => ({ default: () => <div>STUB:ScenarioSorter</div> }));
vi.mock('./exercises/DataClassifier', () => ({ default: () => <div>STUB:DataClassifier</div> }));
vi.mock('./exercises/ToolTriage', () => ({ default: () => <div>STUB:ToolTriage</div> }));
vi.mock('./exercises/FailureSpotter', () => ({ default: () => <div>STUB:FailureSpotter</div> }));
vi.mock('./exercises/ScenarioExercise', () => ({ default: () => <div>STUB:ScenarioExercise</div> }));
vi.mock('./exercises/ReflectionCapture', () => ({ default: () => <div>STUB:ReflectionCapture</div> }));
vi.mock('./exercises/Critique', () => ({ default: () => <div>STUB:Critique</div> }));
vi.mock('./exercises/Synthesis', () => ({ default: () => <div>STUB:Synthesis</div> }));
vi.mock('./exercises/OutputAudit', () => ({ default: () => <div>STUB:OutputAudit</div> }));
vi.mock('./exercises/Calibration', () => ({ default: () => <div>STUB:Calibration</div> }));
vi.mock('./exercises/VoiceEdit', () => ({ default: () => <div>STUB:VoiceEdit</div> }));
vi.mock('./exercises/PromptEval', () => ({ default: () => <div>STUB:PromptEval</div> }));
vi.mock('./exercises/IterationLab', () => ({ default: () => <div>STUB:IterationLab</div> }));
vi.mock('./exercises/ChatCompare', () => ({ default: () => <div>STUB:ChatCompare</div> }));
vi.mock('./exercises/DecisionScenario', () => ({ default: () => <div>STUB:DecisionScenario</div> }));
vi.mock('./exercises/GlatExam', () => ({ default: () => <div>STUB:GlatExam objective gate</div> }));

const base: Module = {
  id: '1.x',
  cellId: '1.x',
  origin: 'matrix',
  visibility: 'public',
  title: 'T',
  type: 'content',
  content: '',
  phaseId: 'stage-1a',
  stage: '1a',
  status: 'published',
  dimension: ['Diligence'],
  evidenceType: 'quiz',
  selfReportValidity: 'medium',
};

function renderModule(
  over: Partial<Module>,
  opts: { isCompleted?: boolean; onComplete?: (via: string) => void } = {},
) {
  return render(
    <ModuleRenderer
      module={{ ...base, ...over }}
      selectedPersona="default"
      isCompleted={opts.isCompleted ?? false}
      onComplete={opts.onComplete ?? (() => {})}
    />,
  );
}

describe('renderInteractive — dispatch by module.type', () => {
  const cases: [ModuleType, string | null][] = [
    ['simulator', 'STUB:PrivacySimulator'],
    ['quiz', 'STUB:Quiz'],
    ['use-case', 'STUB:UseCaseLib'],
    ['sorter', 'STUB:ScenarioSorter'],
  ];
  test.each(cases)('type %s renders %s', (type, marker) => {
    renderModule({ type });
    expect(screen.getByText(marker!)).toBeInTheDocument();
  });

  test('type "glossary" renders the inline glossary heading', () => {
    renderModule({ type: 'glossary' });
    expect(screen.getByText(/AI Glossary/i)).toBeInTheDocument();
  });
});

describe('renderExercise — dispatch by labConfig.kind', () => {
  const kinds: [LabConfig['kind'], string][] = [
    ['prompt-construction', 'STUB:Lab'],
    ['data-classifier', 'STUB:DataClassifier'],
    ['tool-triage', 'STUB:ToolTriage'],
    ['failure-spotter', 'STUB:FailureSpotter'],
    ['disclosure-builder', 'STUB:ScenarioExercise'],
    ['regulatory-check', 'STUB:ScenarioExercise'],
    ['context-diagnostic', 'STUB:ScenarioExercise'],
    ['reflection', 'STUB:ReflectionCapture'],
    ['critique', 'STUB:Critique'],
    ['synthesis', 'STUB:Synthesis'],
    ['output-audit', 'STUB:OutputAudit'],
    ['calibration', 'STUB:Calibration'],
    ['voice-edit', 'STUB:VoiceEdit'],
    ['prompt-eval', 'STUB:PromptEval'],
    ['iteration', 'STUB:IterationLab'],
    ['chat-compare', 'STUB:ChatCompare'],
    ['decision-scenario', 'STUB:DecisionScenario'],
    ['glat', 'STUB:GlatExam objective gate'],
  ];
  test.each(kinds)('kind %s renders %s', (kind, marker) => {
    renderModule({ type: 'lab', labConfig: { kind } as LabConfig });
    expect(screen.getByText(marker)).toBeInTheDocument();
  });

});

// U9 explored-affordance rule: EVERY incomplete module renders exactly one
// footer "Mark as explored" button — it coexists with an inline quiz or
// exercise (those auto-complete via participation events in the data layer).
// Once completed by any path, the footer is a static "Completed ✓" state.
describe('completion footer (U9)', () => {
  test('an incomplete content module shows the "Mark as explored" footer button', () => {
    renderModule({ type: 'content', content: '# Lesson' });
    expect(screen.getByRole('button', { name: /mark as explored/i })).toBeInTheDocument();
    expect(screen.queryByText(/Completed ✓/)).not.toBeInTheDocument();
  });

  test('clicking "Mark as explored" completes with via=explored', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    renderModule({ type: 'content', content: '# Lesson' }, { onComplete });
    await user.click(screen.getByRole('button', { name: /mark as explored/i }));
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledWith('explored');
  });

  test('a completed module shows the static Completed state and no button (one-way)', () => {
    renderModule({ type: 'content', content: '# Lesson' }, { isCompleted: true });
    expect(screen.getByText(/Completed ✓/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mark as explored/i })).not.toBeInTheDocument();
  });

  test('the footer button COEXISTS with an inline quiz (quizzes never gate)', () => {
    renderModule({
      type: 'content',
      content: '# Lesson',
      quiz: [{ question: 'q', options: ['a', 'b'], correctIndex: 0, explanation: 'e' }],
    });
    expect(screen.getByText('STUB:Quiz')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mark as explored/i })).toBeInTheDocument();
  });

  test('the footer button coexists with a lab exercise (old lab-gates special case dissolved)', () => {
    renderModule({
      type: 'content',
      content: '# Lesson',
      labConfig: { kind: 'prompt-construction' } as LabConfig,
      quiz: [{ question: 'q', options: ['a', 'b'], correctIndex: 0, explanation: 'e' }],
    });
    expect(screen.getByText('STUB:Lab')).toBeInTheDocument();
    expect(screen.getByText('STUB:Quiz')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mark as explored/i })).toBeInTheDocument();
  });

  test('the footer button coexists with the GLAT (no longer the only completion path)', () => {
    renderModule({
      type: 'content',
      content: '# Lesson',
      labConfig: { kind: 'glat' } as LabConfig,
    });
    expect(screen.getByText('STUB:GlatExam objective gate')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mark as explored/i })).toBeInTheDocument();
  });

  // FE-06 — a type:'lab' module whose labConfig is missing (or whose kind is
  // unhandled) renders no exercise widget. The footer explored button means it
  // is no longer a dead-end, but the visible fallback notice still flags the
  // missing activity.
  test('a lab module with no labConfig shows the missing-activity fallback (FE-06)', () => {
    renderModule({ type: 'lab', content: '# Lab intro' });
    expect(screen.getByText(/isn't available yet|not configured/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mark as explored/i })).toBeInTheDocument();
  });
});

describe('editorial-status badge (W3-2 / D10 / audit D-08)', () => {
  test('an in_review module shows the "draft — under review" badge', () => {
    renderModule({ type: 'content', content: '# Lesson', status: 'in_review' });
    expect(screen.getByText(/Draft — under review/i)).toBeInTheDocument();
  });

  test('a published module shows no draft badge', () => {
    renderModule({ type: 'content', content: '# Lesson', status: 'published' });
    expect(screen.queryByText(/Draft — under review/i)).not.toBeInTheDocument();
  });
});

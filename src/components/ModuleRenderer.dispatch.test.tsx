// @vitest-environment jsdom
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
// Surfaces the `gates` prop so the 2.1 lab-gates wiring (W2-3/D8) is assertable;
// keeps the STUB:Quiz text so the routing assertions are unaffected.
vi.mock('./Quiz', () => ({
  default: ({ gates = true }: { gates?: boolean }) => (
    <div data-testid="stub-quiz" data-gates={String(gates)}>STUB:Quiz</div>
  ),
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
vi.mock('./exercises/GlatExam', () => ({ default: () => <div>STUB:GlatExam objective gate</div> }));

const base: Module = {
  id: '1.x',
  cellId: '1.x',
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

function renderModule(over: Partial<Module>) {
  return render(
    <ModuleRenderer module={{ ...base, ...over }} selectedPersona="default" onComplete={() => {}} />,
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
    ['glat', 'STUB:GlatExam objective gate'],
  ];
  test.each(kinds)('kind %s renders %s', (kind, marker) => {
    renderModule({ type: 'lab', labConfig: { kind } as LabConfig });
    expect(screen.getByText(marker)).toBeInTheDocument();
  });

  test('dispatches glat → GlatExam', () => {
    renderModule({
      type: 'lab',
      labConfig: {
        kind: 'glat',
        passThreshold: 0.8,
        sectionA: [],
        sectionBC: [
          { id: 'B1', question: 'Q1?', options: ['a', 'b'], correctIndex: 0, rationale: 'r' },
        ],
      },
    });
    expect(screen.getByText(/objective gate/i)).toBeInTheDocument();
  });
});

describe('completion affordance', () => {
  test('a content module with no inline quiz shows the "completed this section" button', () => {
    renderModule({ type: 'content', content: '# Lesson' });
    expect(screen.getByText(/completed this section/i)).toBeInTheDocument();
  });

  test('a content module WITH an inline quiz suppresses the standalone complete button (quiz is the gate)', () => {
    renderModule({
      type: 'content',
      content: '# Lesson',
      quiz: [{ question: 'q', options: ['a', 'b'], correctIndex: 0, explanation: 'e' }],
    });
    expect(screen.queryByText(/completed this section/i)).not.toBeInTheDocument();
    expect(screen.getByText('STUB:Quiz')).toBeInTheDocument();
    // The default: the inline quiz IS the gate (gates=true).
    expect(screen.getByTestId('stub-quiz')).toHaveAttribute('data-gates', 'true');
  });

  // W2-3 / D8 / audit D-02: cell 2.1 — the hands-on prompt-construction lab gates,
  // so its inline quiz is rendered as an ungated concept check (gates=false).
  test('a prompt-construction module renders its inline quiz as practice (the lab gates, not the quiz)', () => {
    renderModule({
      type: 'content',
      content: '# Lesson',
      labConfig: { kind: 'prompt-construction' } as LabConfig,
      quiz: [{ question: 'q', options: ['a', 'b'], correctIndex: 0, explanation: 'e' }],
    });
    // Both the lab and the quiz render…
    expect(screen.getByText('STUB:Lab')).toBeInTheDocument();
    expect(screen.getByText('STUB:Quiz')).toBeInTheDocument();
    // …but the quiz is non-gating; the lab's own onComplete is the gate.
    expect(screen.getByTestId('stub-quiz')).toHaveAttribute('data-gates', 'false');
  });

  // FE-06 — a type:'lab' module whose labConfig is missing (or whose kind is
  // unhandled) used to render no exercise, no quiz, and no completion control: a
  // silent dead-end. It now shows a visible fallback notice.
  test('a lab module with no labConfig shows a fallback instead of a silent dead-end (FE-06)', () => {
    renderModule({ type: 'lab', content: '# Lab intro' });
    expect(screen.getByText(/isn't available yet|not configured/i)).toBeInTheDocument();
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

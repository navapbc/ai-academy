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
vi.mock('./Quiz', () => ({ default: () => <div>STUB:Quiz</div> }));
vi.mock('./UseCaseLib', () => ({ default: () => <div>STUB:UseCaseLib</div> }));
vi.mock('./ScenarioSorter', () => ({ default: () => <div>STUB:ScenarioSorter</div> }));
vi.mock('./exercises/DataClassifier', () => ({ default: () => <div>STUB:DataClassifier</div> }));
vi.mock('./exercises/ToolTriage', () => ({ default: () => <div>STUB:ToolTriage</div> }));
vi.mock('./exercises/FailureSpotter', () => ({ default: () => <div>STUB:FailureSpotter</div> }));
vi.mock('./exercises/ScenarioExercise', () => ({ default: () => <div>STUB:ScenarioExercise</div> }));
vi.mock('./exercises/ReflectionCapture', () => ({ default: () => <div>STUB:ReflectionCapture</div> }));
vi.mock('./exercises/Critique', () => ({ default: () => <div>STUB:Critique</div> }));
vi.mock('./exercises/OutputAudit', () => ({ default: () => <div>STUB:OutputAudit</div> }));
vi.mock('./exercises/Calibration', () => ({ default: () => <div>STUB:Calibration</div> }));

const base: Module = {
  id: '1.x',
  cellId: '1.x',
  title: 'T',
  type: 'content',
  content: '',
  phaseId: 'stage-1a',
  stage: '1a',
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
    ['reflection', 'STUB:ReflectionCapture'],
    ['critique', 'STUB:Critique'],
    ['output-audit', 'STUB:OutputAudit'],
    ['calibration', 'STUB:Calibration'],
  ];
  test.each(kinds)('kind %s renders %s', (kind, marker) => {
    renderModule({ type: 'lab', labConfig: { kind } as LabConfig });
    expect(screen.getByText(marker)).toBeInTheDocument();
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
  });

  // FE-06 — a type:'lab' module whose labConfig is missing (or whose kind is
  // unhandled) used to render no exercise, no quiz, and no completion control: a
  // silent dead-end. It now shows a visible fallback notice.
  test('a lab module with no labConfig shows a fallback instead of a silent dead-end (FE-06)', () => {
    renderModule({ type: 'lab', content: '# Lab intro' });
    expect(screen.getByText(/isn't available yet|not configured/i)).toBeInTheDocument();
  });
});

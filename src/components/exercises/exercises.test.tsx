// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DataClassifier from './DataClassifier';
import ToolTriage from './ToolTriage';
import FailureSpotter from './FailureSpotter';
import ScenarioExercise from './ScenarioExercise';
import ReflectionCapture from './ReflectionCapture';
import OutputAudit from './OutputAudit';
import type {
  DataClassifierConfig,
  ToolTriageConfig,
  FailureSpotterConfig,
  ScenarioExerciseConfig,
  ReflectionConfig,
  OutputAuditConfig,
} from '../../types';

// The graded practice exercises. They render after the lesson, auto-grade
// against the seeded answers, and record a lab_submissions row — but they are
// NOT the completion gate (the inline quiz is), which is structurally enforced:
// none of these components even accept an onComplete prop. These tests confirm
// they render, accept input, grade, and call recordLabSubmission.
const { recordLabSubmission } = vi.hoisted(() => ({ recordLabSubmission: vi.fn(async () => {}) }));
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../../lib/progress', () => ({ recordLabSubmission }));

beforeEach(() => recordLabSubmission.mockClear());

describe('DataClassifier', () => {
  const config: DataClassifierConfig = {
    kind: 'data-classifier',
    tools: [
      { id: 't1', label: 'Approved internal tool' },
      { id: 't2', label: 'Public chatbot' },
    ],
    classes: ['Public', 'PII'],
    items: [{ text: 'A client SSN', dataClass: 'PII', tool: 't1', why: 'SSNs are sensitive.' }],
  };

  test('grades a correct class+tool pick, records the submission, shows the score', async () => {
    const user = userEvent.setup();
    render(<DataClassifier config={config} labId="1.4" />);

    expect(screen.getByText('A client SSN')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'PII' }));
    await user.click(screen.getByRole('radio', { name: 'Approved internal tool' }));
    await user.click(screen.getByRole('button', { name: 'Submit answers' }));

    expect(screen.getByText('You scored 1 / 1')).toBeInTheDocument();
    await waitFor(() => expect(recordLabSubmission).toHaveBeenCalled());
    expect(recordLabSubmission).toHaveBeenCalledWith('u1', expect.objectContaining({
      labId: '1.4',
      status: 'submitted',
      transcript: expect.objectContaining({ score: 1, maxScore: 1 }),
    }));
  });

  test('a wrong pick scores 0 and surfaces the rationale', async () => {
    const user = userEvent.setup();
    render(<DataClassifier config={config} labId="1.4" />);
    await user.click(screen.getByRole('radio', { name: 'Public' }));
    await user.click(screen.getByRole('radio', { name: 'Public chatbot' }));
    await user.click(screen.getByRole('button', { name: 'Submit answers' }));
    expect(screen.getByText('You scored 0 / 1')).toBeInTheDocument();
    expect(screen.getByText('SSNs are sensitive.')).toBeInTheDocument();
  });
});

describe('ToolTriage', () => {
  const config: ToolTriageConfig = {
    kind: 'tool-triage',
    tools: [
      { id: 't1', label: 'Redacting assistant' },
      { id: 't2', label: 'Raw paste into web LLM' },
    ],
    cases: [{ text: 'Summarize a memo with names', tool: 't1', why: 'Redact first.' }],
  };

  test('grades the best-tool pick and records a submission', async () => {
    const user = userEvent.setup();
    render(<ToolTriage config={config} labId="1.5" />);
    await user.click(screen.getByRole('radio', { name: 'Redacting assistant' }));
    await user.click(screen.getByRole('button', { name: 'Submit answers' }));
    expect(screen.getByText('You scored 1 / 1')).toBeInTheDocument();
    await waitFor(() => expect(recordLabSubmission).toHaveBeenCalledWith('u1', expect.objectContaining({ labId: '1.5' })));
  });
});

describe('FailureSpotter', () => {
  const config: FailureSpotterConfig = {
    kind: 'failure-spotter',
    items: [
      {
        id: 'f1',
        artifactMd: 'AI says the deadline is **yesterday**.',
        issue: { prompt: "What's wrong?", options: ['Nothing', 'Hallucinated fact'], correctIndex: 1, why: 'It invented a date.' },
        mitigation: { prompt: 'Best next step?', options: ['Ship it', 'Verify against source'], correctIndex: 1, why: 'Always verify.' },
      },
    ],
  };

  test('scores both sub-questions (issue + mitigation) and records the submission', async () => {
    const user = userEvent.setup();
    render(<FailureSpotter config={config} labId="1.7" />);
    await user.click(screen.getByRole('radio', { name: 'Hallucinated fact' }));
    await user.click(screen.getByRole('radio', { name: 'Verify against source' }));
    await user.click(screen.getByRole('button', { name: 'Submit answers' }));
    expect(screen.getByText('You scored 2 / 2')).toBeInTheDocument();
    await waitFor(() => expect(recordLabSubmission).toHaveBeenCalledWith('u1', expect.objectContaining({ labId: '1.7' })));
  });
});

describe('ScenarioExercise (disclosure-builder / regulatory-check)', () => {
  const config: ScenarioExerciseConfig = {
    kind: 'disclosure-builder',
    items: [
      { prompt: 'A public blog post drafted by AI', options: ['No disclosure', 'Note AI assistance', 'Hide it', 'Lie'], correctIndex: 1, why: 'Disclose AI assistance.' },
    ],
    takeaway: { title: 'Your disclosure cheat-sheet', intro: 'Keep these handy.' },
  };

  test('grades the single-select pick, records, and shows the keepable takeaway', async () => {
    const user = userEvent.setup();
    render(<ScenarioExercise config={config} labId="1.9" />);
    await user.click(screen.getByRole('radio', { name: 'Note AI assistance' }));
    await user.click(screen.getByRole('button', { name: 'Submit answers' }));
    expect(screen.getByText('You scored 1 / 1')).toBeInTheDocument();
    expect(screen.getByText('Your disclosure cheat-sheet')).toBeInTheDocument();
    await waitFor(() => expect(recordLabSubmission).toHaveBeenCalledWith('u1', expect.objectContaining({ labId: '1.9' })));
  });
});

describe('ReflectionCapture', () => {
  const config: ReflectionConfig = {
    kind: 'reflection',
    prompt: 'What surprised you?',
    guidance: 'A few sentences.',
    minWords: 30,
  };

  test('blocks submit below the 50-word floor, then saves and confirms', async () => {
    render(<ReflectionCapture config={config} labId="1.8" />);
    const textarea = screen.getByPlaceholderText(/Write your reflection/i);
    const submit = () => screen.getByRole('button', { name: /Submit reflection/i });

    fireEvent.change(textarea, { target: { value: 'too short' } });
    expect(submit()).toBeDisabled();

    fireEvent.change(textarea, { target: { value: Array.from({ length: 55 }, (_, i) => `word${i}`).join(' ') } });
    expect(submit()).toBeEnabled();

    fireEvent.click(submit());
    await waitFor(() => expect(screen.getByText('Reflection saved')).toBeInTheDocument());
    expect(recordLabSubmission).toHaveBeenCalledWith('u1', expect.objectContaining({
      labId: '1.8',
      transcript: expect.objectContaining({ kind: 'reflection' }),
    }));
  });
});

describe('OutputAudit', () => {
  const config: OutputAuditConfig = {
    kind: 'output-audit',
    intro: 'Audit each claim.',
    artifact: { label: 'AI-generated notice', bodyMd: 'The payment standard is **$1,850 nationwide**.' },
    claims: [
      { id: 'c1', text: 'Governed by 24 CFR Part 982.', status: 'supported', why: 'Real, citable.' },
      { id: 'c2', text: 'Payment standard is $1,850 nationwide.', status: 'fabricated', why: 'No fixed national figure.' },
    ],
  };

  test('renders the artifact + claims, grades a mixed audit, reveals why, records the submission (kind=output-audit)', async () => {
    const user = userEvent.setup();
    render(<OutputAudit config={config} labId="1.2" />);

    // Artifact rendered (markdown) and both claims shown.
    expect(screen.getByText('AI-generated notice')).toBeInTheDocument();
    expect(screen.getByText('Governed by 24 CFR Part 982.')).toBeInTheDocument();

    // Audit: c1 correct (supported), c2 wrong (call it supported → it's fabricated).
    const groups = screen.getAllByRole('radiogroup');
    await user.click(within(groups[0]).getByRole('radio', { name: /^Supported/ }));
    await user.click(within(groups[1]).getByRole('radio', { name: /^Supported/ }));
    await user.click(screen.getByRole('button', { name: 'Submit answers' }));

    expect(screen.getByText('You scored 1 / 2')).toBeInTheDocument();
    // Per-claim rationale revealed after grading.
    expect(screen.getByText('No fixed national figure.')).toBeInTheDocument();

    await waitFor(() => expect(recordLabSubmission).toHaveBeenCalled());
    expect(recordLabSubmission).toHaveBeenCalledWith('u1', expect.objectContaining({
      labId: '1.2',
      status: 'submitted',
      transcript: expect.objectContaining({ kind: 'output-audit', score: 1, maxScore: 2 }),
    }));
  });

  test('does not accept an onComplete prop (the quiz is the gate, not this exercise)', () => {
    // Structural guard: OutputAudit's Props are { config, labId } only. A TS
    // error here (excess prop) is the real test; this also asserts no gate call.
    const onComplete = vi.fn();
    // @ts-expect-error onComplete is intentionally not part of OutputAudit's props
    render(<OutputAudit config={config} labId="1.2" onComplete={onComplete} />);
    expect(onComplete).not.toHaveBeenCalled();
  });
});

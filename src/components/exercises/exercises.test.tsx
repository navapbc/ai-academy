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
import Calibration from './Calibration';
import Synthesis from './Synthesis';
import VoiceEdit from './VoiceEdit';
import DashboardCritique from './DashboardCritique';
import UseCasePortfolio from './UseCasePortfolio';
import FailureLog from './FailureLog';
import type {
  DataClassifierConfig,
  ToolTriageConfig,
  FailureSpotterConfig,
  ScenarioExerciseConfig,
  ReflectionConfig,
  OutputAuditConfig,
  CalibrationConfig,
  SynthesisConfig,
  VoiceEditConfig,
  DashboardCritiqueConfig,
  UseCasePortfolioConfig,
  FailureLogConfig,
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

describe('ScenarioExercise (context-diagnostic — 2.5, P4.5a)', () => {
  // Same component, third kind: a context-window diagnostic. Confirms the kind
  // routes through the shared grade/why/takeaway/record path with no special-casing.
  const config: ScenarioExerciseConfig = {
    kind: 'context-diagnostic',
    items: [
      {
        prompt: 'The model contradicts a rule it stated correctly 40 minutes ago.',
        options: ['Switch tools', 'Start a fresh thread and re-paste the rule', 'It will self-correct', 'Paste the whole manual'],
        correctIndex: 1,
        why: 'The fact scrolled out of the window; restart with just the rule.',
      },
      {
        prompt: 'You have one narrow eligibility question and an 80-page manual.',
        options: ['Paste the whole manual', 'Paste only the relevant section', 'Paste nothing', 'Split it across messages'],
        correctIndex: 1,
        why: 'Irrelevant context pulls the answer off target.',
      },
    ],
    takeaway: {
      title: 'Working with the context window — quick reference',
      intro: 'Keep these moves handy.',
    },
  };

  test('grades a correct + a wrong pick, reveals the why, shows the quick reference, and records (labId 2.5)', async () => {
    const user = userEvent.setup();
    render(<ScenarioExercise config={config} labId="2.5" />);

    expect(screen.getByText('The model contradicts a rule it stated correctly 40 minutes ago.')).toBeInTheDocument();

    // Item 1 correct, item 2 wrong (pick "Paste the whole manual" → correct is index 1).
    const groups = screen.getAllByRole('radiogroup');
    await user.click(within(groups[0]).getByRole('radio', { name: 'Start a fresh thread and re-paste the rule' }));
    await user.click(within(groups[1]).getByRole('radio', { name: 'Paste the whole manual' }));
    await user.click(screen.getByRole('button', { name: 'Submit answers' }));

    expect(screen.getByText('You scored 1 / 2')).toBeInTheDocument();
    expect(screen.getByText('Irrelevant context pulls the answer off target.')).toBeInTheDocument();
    expect(screen.getByText('Working with the context window — quick reference')).toBeInTheDocument();

    await waitFor(() => expect(recordLabSubmission).toHaveBeenCalledWith('u1', expect.objectContaining({
      labId: '2.5',
      status: 'submitted',
      transcript: expect.objectContaining({ score: 1, maxScore: 2 }),
    })));
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

describe('Calibration', () => {
  const config: CalibrationConfig = {
    kind: 'calibration',
    intro: 'Same tool, different tasks.',
    scale: [
      { id: 'use-as-is', label: 'Use as-is' },
      { id: 'light-check', label: 'Light check' },
      { id: 'verify-everything', label: 'Verify everything' },
      { id: 'dont-rely', label: "Don't rely on it" },
    ],
    items: [
      { id: 'easy', task: 'Reformat a list you wrote.', target: 'use-as-is', why: 'No facts at stake.' },
      { id: 'risky', task: 'Compute an exact benefit figure for a notice.', target: 'verify-everything', why: 'Benefit math drives a determination.' },
    ],
  };

  test('renders items + scale, grades, reveals per-item why + the over/under summary, records kind=calibration', async () => {
    const user = userEvent.setup();
    render(<Calibration config={config} labId="2.8" />);

    expect(screen.getByText('Reformat a list you wrote.')).toBeInTheDocument();
    const groups = screen.getAllByRole('radiogroup');
    expect(groups).toHaveLength(2);

    // easy: calibrated (use-as-is). risky: OVER-reliance (pick use-as-is, target verify-everything).
    await user.click(within(groups[0]).getByRole('radio', { name: /Use as-is/ }));
    await user.click(within(groups[1]).getByRole('radio', { name: /Use as-is/ }));
    await user.click(screen.getByRole('button', { name: 'Submit answers' }));

    // Summary card + per-item rationale.
    expect(screen.getByText(/Your calibration: 1 of 2 matched/)).toBeInTheDocument();
    expect(screen.getByText(/Over-reliance · 1/)).toBeInTheDocument();
    expect(screen.getByText(/Under-reliance · 0/)).toBeInTheDocument();
    expect(screen.getByText('Benefit math drives a determination.')).toBeInTheDocument();

    await waitFor(() => expect(recordLabSubmission).toHaveBeenCalled());
    expect(recordLabSubmission).toHaveBeenCalledWith('u1', expect.objectContaining({
      labId: '2.8',
      status: 'submitted',
      transcript: expect.objectContaining({
        kind: 'calibration',
        score: 1,
        maxScore: 2,
        summary: expect.objectContaining({ over: 1, under: 0, calibrated: 1 }),
      }),
    }));
  });

  test('does not accept an onComplete prop (the quiz is the gate, not this exercise)', () => {
    const onComplete = vi.fn();
    // @ts-expect-error onComplete is intentionally not part of Calibration's props
    render(<Calibration config={config} labId="2.8" onComplete={onComplete} />);
    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe('Synthesis', () => {
  const config: SynthesisConfig = {
    kind: 'synthesis',
    brief: { instruction: 'Synthesize these notes into themes for the readout.' },
    sources: { label: 'Interview notes', bodyMd: 'P1 — positive.\n\nP7 — could not finish.' },
    rubric: { anchors: [{ id: 'a', label: 'Surface the dissenting voice', description: 'Keeps it.' }] },
  };

  test('does not accept an onComplete prop (the quiz is the gate, not this exercise)', () => {
    const onComplete = vi.fn();
    // @ts-expect-error onComplete is intentionally not part of Synthesis's props
    render(<Synthesis config={config} labId="2.7" onComplete={onComplete} />);
    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe('VoiceEdit', () => {
  const config: VoiceEditConfig = {
    kind: 'voice-edit',
    brief: { instruction: 'Turn this case note into a plain-language notice.' },
    source: { label: 'Internal case note', bodyMd: 'Submit Form CCS-9 by August 15, 2026.' },
    rubric: { anchors: [{ id: 'a', label: 'Keep every specific', description: 'Keeps it.' }] },
  };

  test('does not accept an onComplete prop (the quiz is the gate, not this exercise)', () => {
    const onComplete = vi.fn();
    // @ts-expect-error onComplete is intentionally not part of VoiceEdit's props
    render(<VoiceEdit config={config} labId="2.6" onComplete={onComplete} />);
    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe('DashboardCritique', () => {
  const config: DashboardCritiqueConfig = {
    kind: 'dashboard-critique',
    intro: 'This dashboard looks great. Name what it leaves out.',
    dashboard: {
      title: 'AI-Assisted Drafting — Team Productivity',
      metrics: [
        { label: 'Drafts/day', value: '12', trend: '▲30%' },
        { label: 'Avg draft time', value: '4m', trend: '▼' },
      ],
    },
    signals: [
      { id: 'rework', label: 'Rework / correction rate', hidden: true, why: 'A third came back for correction.' },
      { id: 'drafts', label: 'Drafts per day', hidden: false, why: 'This is already on the dashboard.' },
      { id: 'throughput', label: 'Net throughput', hidden: true, why: 'Net output barely moved.' },
    ],
  };

  test('renders metrics + signals, grades a mixed selection, reveals why, records kind=dashboard-critique', async () => {
    const user = userEvent.setup();
    render(<DashboardCritique config={config} labId="2.13" />);

    // Dashboard metric + checklist signal rendered.
    expect(screen.getByText('Drafts/day')).toBeInTheDocument();
    expect(screen.getByText('Rework / correction rate')).toBeInTheDocument();

    // Name one hidden signal (rework), miss the other (throughput), and wrongly
    // flag a visible decoy (drafts).
    await user.click(screen.getByRole('checkbox', { name: 'Rework / correction rate' }));
    await user.click(screen.getByRole('checkbox', { name: 'Drafts per day' }));
    await user.click(screen.getByRole('button', { name: 'Check my answer' }));

    // Summary + per-signal rationale revealed after grading.
    expect(screen.getByText('You named 1 of 2 hidden signals')).toBeInTheDocument();
    expect(screen.getByText('A third came back for correction.')).toBeInTheDocument(); // correct
    expect(screen.getByText('Net output barely moved.')).toBeInTheDocument(); // missed
    expect(screen.getByText('This is already on the dashboard.')).toBeInTheDocument(); // false flag

    await waitFor(() => expect(recordLabSubmission).toHaveBeenCalled());
    expect(recordLabSubmission).toHaveBeenCalledWith('u1', expect.objectContaining({
      labId: '2.13',
      status: 'submitted',
      transcript: expect.objectContaining({
        kind: 'dashboard-critique',
        correct: ['rework'],
        missed: ['throughput'],
        falseFlags: ['drafts'],
        hiddenTotal: 2,
        namedCount: 1,
      }),
    }));
  });

  test('does not accept an onComplete prop (the quiz is the gate, not this exercise)', () => {
    const onComplete = vi.fn();
    // @ts-expect-error onComplete is intentionally not part of DashboardCritique's props
    render(<DashboardCritique config={config} labId="2.13" onComplete={onComplete} />);
    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe('UseCasePortfolio (2.11, P4.8)', () => {
  const config: UseCasePortfolioConfig = {
    kind: 'use-case-portfolio',
    intro: 'Build your library, then write one Diligence Statement.',
    library: {
      title: 'Your personal AI use-case library',
      helper: 'Log where AI helps and where it doesn’t.',
      minEntries: 2,
      taskPlaceholder: 'The task',
      approachPlaceholder: 'The prompt or approach',
      watchPlaceholder: 'The failure mode to watch',
    },
    diligence: {
      title: 'Diligence Statement',
      helper: 'One high-stakes use case across the 4 dimensions.',
      dimensions: [
        { id: 'delegation', label: 'Delegation', prompt: 'What did you hand over?' },
        { id: 'description', label: 'Description', prompt: 'How did you frame it?' },
        { id: 'discernment', label: 'Discernment', prompt: 'How did you check it?' },
        { id: 'diligence', label: 'Diligence', prompt: 'How were you accountable?' },
      ],
      targetWords: 40,
      minWords: 12,
    },
  };

  const fillEntry = async (user: ReturnType<typeof userEvent.setup>, n: number, text: string) => {
    await user.type(screen.getByLabelText(`Use case ${n}: the task`), `${text} task`);
    await user.type(screen.getByLabelText(`Use case ${n}: the prompt or approach`), `${text} approach`);
    await user.type(screen.getByLabelText(`Use case ${n}: the failure mode to watch`), `${text} watch`);
  };

  const threeWords = 'one two three';

  test('gates submit until the library + 4D statement are complete, then records kind=use-case-portfolio', async () => {
    const user = userEvent.setup();
    render(<UseCasePortfolio config={config} labId="2.11" />);

    const saveBtn = () => screen.getByRole('button', { name: /Save portfolio/i });
    expect(saveBtn()).toBeDisabled();
    // The readiness line tells the learner what's missing.
    expect(screen.getByText(/Before you submit/i)).toBeInTheDocument();

    // Entry 1 (Helps, the default).
    await fillEntry(user, 1, 'first');
    // Add a second entry and mark it "Doesn't help" (one toggle per entry).
    await user.click(screen.getByRole('button', { name: /Add a use case/i }));
    await fillEntry(user, 2, 'second');
    const doesntToggles = screen.getAllByRole('button', { name: /Doesn’t help/i });
    await user.click(doesntToggles[1]);

    // Fill all four dimensions (≥12 words total).
    for (const d of config.diligence.dimensions) {
      await user.type(screen.getByLabelText(d.label), threeWords);
    }

    await waitFor(() => expect(saveBtn()).toBeEnabled());
    await user.click(saveBtn());

    await waitFor(() => expect(recordLabSubmission).toHaveBeenCalled());
    expect(recordLabSubmission).toHaveBeenCalledWith('u1', expect.objectContaining({
      labId: '2.11',
      status: 'submitted',
      transcript: expect.objectContaining({
        kind: 'use-case-portfolio',
        // Both counts are over COMPLETE entries (1 Helps + 1 Doesn't help here).
        helpsCount: 1,
        doesntCount: 1,
        wordCount: 12,
      }),
    }));
    expect(screen.getByText('Portfolio saved')).toBeInTheDocument();
  });

  test('does not accept an onComplete prop (the quiz is the gate, not this exercise)', () => {
    const onComplete = vi.fn();
    // @ts-expect-error onComplete is intentionally not part of UseCasePortfolio's props
    render(<UseCasePortfolio config={config} labId="2.11" onComplete={onComplete} />);
    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe('FailureLog (2.9, P4.9)', () => {
  const config: FailureLogConfig = {
    kind: 'failure-log',
    intro: 'Log how AI breaks on your work.',
    title: 'Your personal failure-mode log',
    helper: 'Log a real failure per entry.',
    minEntries: 2,
    targetEntries: 6,
    taskPlaceholder: 'The task',
    errorPlaceholder: 'What went wrong',
    caughtPlaceholder: 'How you caught it',
    tellPlaceholder: 'The tell',
  };

  const fillEntry = async (user: ReturnType<typeof userEvent.setup>, i: number, n: number) => {
    // The date input (type=date) is set via fireEvent for reliability in jsdom.
    fireEvent.change(document.getElementById(`failure-${i}-date`)!, { target: { value: `2026-03-0${n}` } });
    await user.type(screen.getByLabelText('The task', { selector: `#failure-${i}-task` }), `task ${n}`);
    await user.type(screen.getByLabelText('What went wrong', { selector: `#failure-${i}-error` }), `error ${n}`);
    await user.type(screen.getByLabelText('How you caught it', { selector: `#failure-${i}-caught` }), `caught ${n}`);
    await user.type(screen.getByLabelText('The tell to watch next time', { selector: `#failure-${i}-tell` }), `tell ${n}`);
  };

  test('gates submit until minEntries complete dated entries exist, then records kind=failure-log', async () => {
    const user = userEvent.setup();
    render(<FailureLog config={config} labId="2.9" />);

    const saveBtn = () => screen.getByRole('button', { name: /Save failure log/i });
    expect(saveBtn()).toBeDisabled();
    expect(screen.getByText(/Before you submit/i)).toBeInTheDocument();

    await fillEntry(user, 0, 1);
    await user.click(screen.getByRole('button', { name: /Add an entry/i }));
    await fillEntry(user, 1, 2);

    await waitFor(() => expect(saveBtn()).toBeEnabled());
    await user.click(saveBtn());

    await waitFor(() => expect(recordLabSubmission).toHaveBeenCalled());
    expect(recordLabSubmission).toHaveBeenCalledWith('u1', expect.objectContaining({
      labId: '2.9',
      status: 'submitted',
      transcript: expect.objectContaining({ kind: 'failure-log', entryCount: 2 }),
    }));
    // Only complete entries are recorded, so the array length matches entryCount.
    const recorded = (recordLabSubmission.mock.calls[0] as unknown[])[1] as { transcript: { entries: unknown[] } };
    expect(recorded.transcript.entries).toHaveLength(2);
    expect(screen.getByText('Failure log saved')).toBeInTheDocument();
  });

  test('does not accept an onComplete prop (the quiz is the gate, not this exercise)', () => {
    const onComplete = vi.fn();
    // @ts-expect-error onComplete is intentionally not part of FailureLog's props
    render(<FailureLog config={config} labId="2.9" onComplete={onComplete} />);
    expect(onComplete).not.toHaveBeenCalled();
  });
});

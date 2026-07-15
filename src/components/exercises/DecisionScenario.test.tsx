// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import DecisionScenario from './DecisionScenario';
import type { DecisionScenarioConfig } from '../../types';

// The decision-scenario exercise (restructure U7): "Walk the Workflow" — a
// linear checkpoint scenario (DELEGATE → GROUND → SCOPE → VERIFY) with
// per-option authored feedback revealed before the story continues. UNGRADED —
// finishing records ONE lab_submissions row with every choice; it never gates
// completion. These tests mock the auth/progress layers and confirm: the
// end-to-end walk records one submission with all choices; single-select
// reveals-and-locks on selection; multi-select requires "Check answer" and
// reveals feedback for every checked option; Continue stays disabled until
// feedback is revealed; Previous re-reads a locked checkpoint but never
// re-answers; the progress indicator + uppercase phase label advance; the
// post-finish read-through is read-only; a failed submission keeps the finished
// state and Retry re-records; and the reveal is announced via the polite live
// region.

const { recordLabSubmission } = vi.hoisted(() => ({
  recordLabSubmission: vi.fn(async () => 'sub-1'),
}));
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../../lib/progress', () => ({ recordLabSubmission }));

beforeEach(() => {
  recordLabSubmission.mockClear();
  recordLabSubmission.mockImplementation(async () => 'sub-1');
});

const marina: DecisionScenarioConfig = {
  kind: 'decision-scenario',
  title: 'Walk the workflow with Marina',
  introMd: 'Marina has a **stack of intake notes** to summarize by Friday.',
  checkpoints: [
    {
      id: 'cp-delegate',
      phase: 'delegate',
      setupMd: 'Marina wonders how much of the task to hand to Claude.',
      prompt: 'What should Marina delegate?',
      options: [
        { text: 'The whole decision', feedbackMd: 'Delegating the *decision* gives away her judgment.' },
        { text: 'The first-draft summary', feedbackMd: 'Right-sized: drafting is delegable, judgment is not.' },
      ],
    },
    {
      id: 'cp-ground',
      phase: 'ground',
      setupMd: 'Claude needs something real to work from.',
      prompt: 'How should Marina ground the task?',
      options: [
        { text: 'Paste the intake notes', feedbackMd: 'Grounding with the real notes anchors the output.' },
        { text: 'Let Claude answer from memory', feedbackMd: 'Ungrounded output invites confident fabrication.' },
      ],
    },
    {
      id: 'cp-scope',
      phase: 'scope',
      multiSelect: true,
      setupMd: 'Marina writes her prompt.',
      prompt: 'Which constraints belong in scope? Pick all that apply.',
      options: [
        { text: 'A one-page limit', feedbackMd: 'A length bound keeps the summary reviewable.' },
        { text: 'A plain-language audience', feedbackMd: 'Audience framing shapes the tone.' },
        { text: 'Permission to invent missing details', feedbackMd: 'Never scope IN fabrication.' },
      ],
    },
    {
      id: 'cp-verify',
      phase: 'verify',
      setupMd: 'The draft comes back clean-looking.',
      prompt: 'How does Marina verify it?',
      options: [
        { text: 'Ship it as-is', feedbackMd: 'Unverified output is her name on a guess.' },
        { text: 'Check each claim against the notes', feedbackMd: 'Verification against the source closes the loop.' },
      ],
    },
  ],
  closingMd: 'Marina ships a summary she can **stand behind**.',
};

function start() {
  fireEvent.click(screen.getByRole('button', { name: /Start the scenario/i }));
}

function clickContinue() {
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
}

/** Answers all four checkpoints and clicks Finish (delegate=1, ground=0, scope={0,1}, verify=1). */
function walkToFinish() {
  start();
  fireEvent.click(screen.getByRole('button', { name: /The first-draft summary/ }));
  clickContinue();
  fireEvent.click(screen.getByRole('button', { name: /Paste the intake notes/ }));
  clickContinue();
  fireEvent.click(screen.getByRole('checkbox', { name: /A one-page limit/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /A plain-language audience/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
  clickContinue();
  fireEvent.click(screen.getByRole('button', { name: /Check each claim against the notes/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
}

describe('DecisionScenario', () => {
  test('renders the intro first; checkpoints only start on "Start the scenario"', () => {
    render(<DecisionScenario config={marina} labId="c1-w3" />);
    expect(screen.getByText(/stack of intake notes/)).toBeInTheDocument();
    expect(screen.queryByText(/Checkpoint 1 of 4/)).not.toBeInTheDocument();
    start();
    expect(screen.getByText(/Checkpoint 1 of 4/)).toBeInTheDocument();
    expect(recordLabSubmission).not.toHaveBeenCalled();
  });

  test('the 4-checkpoint walk records ONE submission with every choice (indexes per checkpoint)', async () => {
    render(<DecisionScenario config={marina} labId="c1-w3" />);
    walkToFinish();

    await waitFor(() => expect(recordLabSubmission).toHaveBeenCalledTimes(1));
    expect(recordLabSubmission).toHaveBeenCalledWith('u1', {
      labId: 'c1-w3',
      status: 'submitted',
      transcript: {
        kind: 'decision-scenario',
        choices: [
          { checkpointId: 'cp-delegate', selected: [1] },
          { checkpointId: 'cp-ground', selected: [0] },
          { checkpointId: 'cp-scope', selected: [0, 1] },
          { checkpointId: 'cp-verify', selected: [1] },
        ],
      },
    });
    // The closing renders and the learner sees the recorded confirmation.
    expect(screen.getByText(/ships a summary she can/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Choices recorded/)).toBeInTheDocument());
  });

  test('single-select: choosing reveals that option\'s feedback and locks the choice', () => {
    render(<DecisionScenario config={marina} labId="c1-w3" />);
    start();

    fireEvent.click(screen.getByRole('button', { name: /The first-draft summary/ }));
    expect(screen.getByText(/Right-sized: drafting is delegable/)).toBeInTheDocument();
    expect(screen.getByText('Your choice')).toBeInTheDocument();

    // Immutable once revealed: every option is disabled and clicking the other
    // option changes nothing.
    const other = screen.getByRole('button', { name: /The whole decision/ });
    expect(other).toBeDisabled();
    fireEvent.click(other);
    expect(screen.queryByText(/gives away her judgment/)).not.toBeInTheDocument();
    expect(screen.getAllByText('Your choice')).toHaveLength(1);
  });

  test('multi-select: feedback waits for "Check answer", reveals for EACH selected option, then locks', () => {
    render(<DecisionScenario config={marina} labId="c1-w3" />);
    start();
    fireEvent.click(screen.getByRole('button', { name: /The first-draft summary/ }));
    clickContinue();
    fireEvent.click(screen.getByRole('button', { name: /Paste the intake notes/ }));
    clickContinue();

    // Nothing to check yet — the button is disabled with zero selections.
    expect(screen.getByRole('button', { name: 'Check answer' })).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: /A one-page limit/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Permission to invent missing details/ }));
    // Selections alone reveal nothing (and Continue stays locked).
    expect(screen.queryByText(/length bound keeps the summary/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
    // Feedback for BOTH selected options; none for the unselected one.
    expect(screen.getByText(/length bound keeps the summary/)).toBeInTheDocument();
    expect(screen.getByText(/Never scope IN fabrication/)).toBeInTheDocument();
    expect(screen.queryByText(/Audience framing shapes the tone/)).not.toBeInTheDocument();

    // Locked: checkboxes disabled, Check answer gone, selections immutable.
    screen.getAllByRole('checkbox').forEach((cb) => expect(cb).toBeDisabled());
    expect(screen.queryByRole('button', { name: 'Check answer' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /A plain-language audience/ }));
    expect(screen.queryByText(/Audience framing shapes the tone/)).not.toBeInTheDocument();
  });

  test('Continue is disabled until the checkpoint\'s feedback is revealed', () => {
    render(<DecisionScenario config={marina} labId="c1-w3" />);
    start();
    const cont = screen.getByRole('button', { name: 'Continue' });
    expect(cont).toBeDisabled();
    fireEvent.click(cont);
    expect(screen.getByText(/Checkpoint 1 of 4/)).toBeInTheDocument(); // didn't advance

    fireEvent.click(screen.getByRole('button', { name: /The whole decision/ }));
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  test('Previous re-reads a completed checkpoint — locked choice + revealed feedback, never re-answerable', () => {
    render(<DecisionScenario config={marina} labId="c1-w3" />);
    start();
    fireEvent.click(screen.getByRole('button', { name: /The first-draft summary/ }));
    clickContinue();
    expect(screen.getByText(/Checkpoint 2 of 4/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    // Back on checkpoint 1: the locked choice and its feedback are shown…
    expect(screen.getByText(/Checkpoint 1 of 4/)).toBeInTheDocument();
    expect(screen.getByText(/Right-sized: drafting is delegable/)).toBeInTheDocument();
    expect(screen.getByText('Your choice')).toBeInTheDocument();
    // …and it cannot be re-answered.
    const other = screen.getByRole('button', { name: /The whole decision/ });
    expect(other).toBeDisabled();
    // Continue is available again (feedback already revealed) and moves forward.
    const cont = screen.getByRole('button', { name: 'Continue' });
    expect(cont).toBeEnabled();
    fireEvent.click(cont);
    expect(screen.getByText(/Checkpoint 2 of 4/)).toBeInTheDocument();
  });

  test('the progress indicator and uppercase phase label advance checkpoint by checkpoint', () => {
    render(<DecisionScenario config={marina} labId="c1-w3" />);
    start();
    expect(screen.getByText('Checkpoint 1 of 4')).toBeInTheDocument();
    expect(screen.getByText('DELEGATE')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /The first-draft summary/ }));
    clickContinue();
    expect(screen.getByText('Checkpoint 2 of 4')).toBeInTheDocument();
    expect(screen.getByText('GROUND')).toBeInTheDocument();
    expect(screen.queryByText('DELEGATE')).not.toBeInTheDocument();
  });

  test('post-finish: the full read-through is read-only (all checkpoints, choices, feedback)', async () => {
    render(<DecisionScenario config={marina} labId="c1-w3" />);
    walkToFinish();
    await waitFor(() => expect(screen.getByText(/Choices recorded/)).toBeInTheDocument());

    // Every checkpoint renders with its revealed feedback and locked choice.
    expect(screen.getByText('Checkpoint 1 of 4')).toBeInTheDocument();
    expect(screen.getByText('Checkpoint 4 of 4')).toBeInTheDocument();
    expect(screen.getByText(/Right-sized: drafting is delegable/)).toBeInTheDocument();
    expect(screen.getByText(/length bound keeps the summary/)).toBeInTheDocument();
    expect(screen.getByText(/Verification against the source/)).toBeInTheDocument();
    // One marker per chosen option: 1 + 1 + 2 (multi-select) + 1.
    expect(screen.getAllByText('Your choice')).toHaveLength(5);

    // Read-only: no stepper controls remain and every option control is disabled.
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finish' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check answer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();
    screen.getAllByRole('button').forEach((b) => expect(b).toBeDisabled());
    screen.getAllByRole('checkbox').forEach((cb) => expect(cb).toBeDisabled());

    // ONE submission, exactly.
    expect(recordLabSubmission).toHaveBeenCalledTimes(1);
  });

  test('submission failure keeps the finished state + choices; Retry re-records the same payload', async () => {
    recordLabSubmission.mockRejectedValueOnce(new Error('db offline'));
    render(<DecisionScenario config={marina} labId="c1-w3" />);
    walkToFinish();

    // The inline error surfaces; the finished read-through and choices stay.
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('db offline'));
    expect(screen.getByText(/ships a summary she can/)).toBeInTheDocument();
    expect(screen.getAllByText('Your choice')).toHaveLength(5);
    expect(screen.queryByText(/Choices recorded/)).not.toBeInTheDocument();

    // Retry re-records — the same choices, a second call.
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(recordLabSubmission).toHaveBeenCalledTimes(2));
    expect(recordLabSubmission.mock.calls[1]).toEqual(recordLabSubmission.mock.calls[0]);
    await waitFor(() => expect(screen.getByText(/Choices recorded/)).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('the feedback reveal is announced through the polite live region', () => {
    render(<DecisionScenario config={marina} labId="c1-w3" />);
    start();
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region.textContent).toBe(''); // nothing announced before the reveal

    fireEvent.click(screen.getByRole('button', { name: /The first-draft summary/ }));
    expect(region).toHaveTextContent(/Right-sized: drafting is delegable/);
  });

  test('does not accept an onComplete prop (ungraded — never the completion gate)', () => {
    const onComplete = vi.fn();
    // @ts-expect-error onComplete is intentionally not part of DecisionScenario's props
    render(<DecisionScenario config={marina} labId="c1-w3" onComplete={onComplete} />);
    expect(onComplete).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import DecisionScenario from './DecisionScenario';
import type { DecisionScenarioConfig } from '../../types';

// The decision-scenario exercise (restructure U7): "Walk the Workflow" — a
// linear checkpoint scenario (DELEGATE → GROUND → SCOPE → VERIFY) with
// per-option authored feedback revealed before the story continues. UNGRADED —
// finishing records ONE lab_submissions row with every choice; it never gates
// completion. These tests mock the auth/progress layers.
//
// L&D content pass (Sarah Grayvin [19]–[28], plan W3.1–W3.4) changed four
// behaviors, and these tests moved with them ON PURPOSE:
//
// - W3.2: selecting is no longer submitting. BOTH selection modes now sit
//   behind one "Submit" control (multi-select's was labelled "Check answer"),
//   so a single-select pick is changeable until Submit. Every assertion that
//   read "choosing reveals feedback" now reads "Submit reveals feedback", and
//   the walk helper clicks Submit at each checkpoint.
// - W3.3: a multi-select reveal shows the ENTIRE answer key. The old negative
//   assertions ("no feedback for the option I did not check") are now positive
//   — that was exactly the confusion [23]/[28] reported.
// - W3.4: the "immutable once revealed" invariant is DELIBERATELY REVERSED per
//   human Decision 7. It is not gone, it is narrowed: a revealed answer still
//   cannot be edited silently (options stay disabled, clicking them is a
//   no-op), but an explicit "Try again" reopens the checkpoint and "Start over"
//   replays the whole scenario. The three tests that asserted permanent
//   immutability now assert the narrowed version plus the retake paths.
// - W3.1: a collapsible "Scenario recap" carries the premise onto every
//   checkpoint; new tests cover it.
//
// Completion timing is unchanged and is asserted below: Submit records nothing,
// and only Finish calls recordLabSubmission.

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

function clickSubmit() {
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
}

/**
 * Answers all four checkpoints and clicks Finish. Every checkpoint now goes
 * select → Submit (W3.2); `delegate` is parameterized so a second pass through
 * the scenario can answer differently.
 */
function walkToFinish(delegate: RegExp = /The first-draft summary/) {
  start();
  fireEvent.click(screen.getByRole('button', { name: delegate }));
  clickSubmit();
  clickContinue();
  fireEvent.click(screen.getByRole('button', { name: /Paste the intake notes/ }));
  clickSubmit();
  clickContinue();
  fireEvent.click(screen.getByRole('checkbox', { name: /A one-page limit/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /A plain-language audience/ }));
  clickSubmit();
  clickContinue();
  fireEvent.click(screen.getByRole('button', { name: /Check each claim against the notes/ }));
  clickSubmit();
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

  // --- W3.1 [19] [20] [27] — persistent, re-openable scenario recap ----------

  test('W3.1: the scenario recap is reachable on every checkpoint, collapsed by default', () => {
    render(<DecisionScenario config={marina} labId="c1-w3" />);
    // Not on the intro screen — the premise IS the intro screen there.
    expect(screen.queryByRole('button', { name: /Scenario recap/i })).not.toBeInTheDocument();

    start();
    const recap = screen.getByRole('button', { name: /Scenario recap/i });
    expect(recap).toHaveAttribute('aria-expanded', 'false');
    expect(recap).toHaveAttribute('aria-controls', 'decision-scenario-context');
    // Collapsed: the decision prompt keeps the fold.
    expect(screen.queryByText(/stack of intake notes/)).not.toBeInTheDocument();

    fireEvent.click(recap);
    expect(recap).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/stack of intake notes/)).toBeInTheDocument();
  });

  test('W3.1: the recap stays open across checkpoints (component-level, not per-checkpoint)', () => {
    render(<DecisionScenario config={marina} labId="c1-w3" />);
    start();
    fireEvent.click(screen.getByRole('button', { name: /Scenario recap/i }));

    fireEvent.click(screen.getByRole('button', { name: /The first-draft summary/ }));
    clickSubmit();
    clickContinue();

    expect(screen.getByText('Checkpoint 2 of 4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Scenario recap/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText(/stack of intake notes/)).toBeInTheDocument();
  });

  test('W3.1: no recap control in the post-finish read-through', async () => {
    render(<DecisionScenario config={marina} labId="c1-w3" />);
    walkToFinish();
    await waitFor(() => expect(screen.getByText(/Choices recorded/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Scenario recap/i })).not.toBeInTheDocument();
  });

  // --- W3.2 [22] [24] [25] [26] — Submit gates feedback ---------------------

  test('W3.2 single-select: Submit gates the feedback and the pick is changeable until then', () => {
    render(<DecisionScenario config={marina} labId="c1-w3" />);
    start();

    // Nothing selected: Submit is present but disabled.
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /The whole decision/ }));
    // Selecting reveals NOTHING now — that is the whole point of [22].
    expect(screen.queryByText(/gives away her judgment/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();

    // The pod can change its mind while it discusses.
    fireEvent.click(screen.getByRole('button', { name: /The first-draft summary/ }));
    expect(screen.getByRole('button', { name: /The first-draft summary/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /The whole decision/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    clickSubmit();
    expect(screen.getByText(/Right-sized: drafting is delegable/)).toBeInTheDocument();
    expect(screen.getByText('Your choice')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();

    // Revealed answers cannot be edited silently: options are disabled and
    // clicking one changes nothing. Reopening takes an explicit "Try again".
    const other = screen.getByRole('button', { name: /The whole decision/ });
    expect(other).toBeDisabled();
    fireEvent.click(other);
    expect(screen.queryByText(/gives away her judgment/)).not.toBeInTheDocument();
    expect(screen.getAllByText('Your choice')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
  });

  test('W3.2: Submit records nothing — only Finish writes a lab submission', () => {
    render(<DecisionScenario config={marina} labId="c1-w3" />);
    start();
    fireEvent.click(screen.getByRole('button', { name: /The first-draft summary/ }));
    clickSubmit();
    clickContinue();
    fireEvent.click(screen.getByRole('button', { name: /Paste the intake notes/ }));
    clickSubmit();
    expect(recordLabSubmission).not.toHaveBeenCalled();
  });

  test('W3.2 multi-select: the same Submit gate, now labelled "Submit"', () => {
    render(<DecisionScenario config={marina} labId="c1-w3" />);
    start();
    fireEvent.click(screen.getByRole('button', { name: /The first-draft summary/ }));
    clickSubmit();
    clickContinue();
    fireEvent.click(screen.getByRole('button', { name: /Paste the intake notes/ }));
    clickSubmit();
    clickContinue();

    // Nothing to submit yet — disabled with zero selections.
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: /A one-page limit/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Permission to invent missing details/ }));
    // Selections alone reveal nothing (and Continue stays locked).
    expect(screen.queryByText(/length bound keeps the summary/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();

    clickSubmit();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    // Locked: checkboxes disabled and Submit replaced by the retake.
    screen.getAllByRole('checkbox').forEach((cb) => expect(cb).toBeDisabled());
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /A plain-language audience/ }));
    expect(screen.getAllByText('You chose this')).toHaveLength(2);
  });

  // --- W3.3 [23] [28] — the entire answer key on multi-select ---------------

  test('W3.3 multi-select: submitting shows EVERY option\'s feedback, picks marked', () => {
    render(<DecisionScenario config={marina} labId="c1-w3" />);
    start();
    fireEvent.click(screen.getByRole('button', { name: /The first-draft summary/ }));
    clickSubmit();
    clickContinue();
    fireEvent.click(screen.getByRole('button', { name: /Paste the intake notes/ }));
    clickSubmit();
    clickContinue();

    fireEvent.click(screen.getByRole('checkbox', { name: /A one-page limit/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Permission to invent missing details/ }));
    clickSubmit();

    // Feedback for the two checked options…
    expect(screen.getByText(/length bound keeps the summary/)).toBeInTheDocument();
    expect(screen.getByText(/Never scope IN fabrication/)).toBeInTheDocument();
    // …AND for the one the learner did not check. This assertion used to be
    // negative; [23]/[28] reported the partial key as the actual confusion.
    expect(screen.getByText(/Audience framing shapes the tone/)).toBeInTheDocument();
    expect(screen.getByText(/The full answer key/)).toBeInTheDocument();

    // The learner's own picks stay distinguishable inside the key.
    expect(screen.getAllByText('You chose this')).toHaveLength(2);
  });

  test('W3.3 is scoped to multi-select: single-select still shows only the chosen option', () => {
    render(<DecisionScenario config={marina} labId="c1-w3" />);
    start();
    fireEvent.click(screen.getByRole('button', { name: /The first-draft summary/ }));
    clickSubmit();
    expect(screen.getByText(/Right-sized: drafting is delegable/)).toBeInTheDocument();
    expect(screen.queryByText(/gives away her judgment/)).not.toBeInTheDocument();
    expect(screen.queryByText(/The full answer key/)).not.toBeInTheDocument();
  });

  // --- W3.4 [21] [23]–[26] — retake, at both grains -------------------------

  test('W3.4 per-checkpoint: "Try again" reopens the checkpoint for a different answer', () => {
    render(<DecisionScenario config={marina} labId="c1-w3" />);
    start();
    fireEvent.click(screen.getByRole('button', { name: /The whole decision/ }));
    clickSubmit();
    expect(screen.getByText(/gives away her judgment/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    // The reveal and the selection are both cleared, so the learner re-decides
    // rather than nudging a locked answer; Continue re-locks until they submit.
    expect(screen.queryByText(/gives away her judgment/)).not.toBeInTheDocument();
    expect(screen.queryByText('Your choice')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /The whole decision/ })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /The first-draft summary/ }));
    clickSubmit();
    expect(screen.getByText(/Right-sized: drafting is delegable/)).toBeInTheDocument();
  });

  test('W3.4 per-checkpoint: the transcript records the FINAL answer after a retake', async () => {
    render(<DecisionScenario config={marina} labId="c1-w3" />);
    start();
    fireEvent.click(screen.getByRole('button', { name: /The whole decision/ }));
    clickSubmit();
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    fireEvent.click(screen.getByRole('button', { name: /The first-draft summary/ }));
    clickSubmit();
    clickContinue();
    fireEvent.click(screen.getByRole('button', { name: /Paste the intake notes/ }));
    clickSubmit();
    clickContinue();
    fireEvent.click(screen.getByRole('checkbox', { name: /A one-page limit/ }));
    clickSubmit();
    clickContinue();
    fireEvent.click(screen.getByRole('button', { name: /Ship it as-is/ }));
    clickSubmit();
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));

    await waitFor(() => expect(recordLabSubmission).toHaveBeenCalledTimes(1));
    expect(recordLabSubmission).toHaveBeenLastCalledWith('u1', {
      labId: 'c1-w3',
      status: 'submitted',
      transcript: {
        kind: 'decision-scenario',
        choices: [
          { checkpointId: 'cp-delegate', selected: [1] }, // the retaken answer, not [0]
          { checkpointId: 'cp-ground', selected: [0] },
          { checkpointId: 'cp-scope', selected: [0] },
          { checkpointId: 'cp-verify', selected: [0] },
        ],
      },
    });
  });

  test('W3.4 multi-select retake is offered, and says what it is for', () => {
    render(<DecisionScenario config={marina} labId="c1-w3" />);
    start();
    fireEvent.click(screen.getByRole('button', { name: /The first-draft summary/ }));
    clickSubmit();
    clickContinue();
    fireEvent.click(screen.getByRole('button', { name: /Paste the intake notes/ }));
    clickSubmit();
    clickContinue();
    fireEvent.click(screen.getByRole('checkbox', { name: /A one-page limit/ }));
    clickSubmit();

    // Sarah hedged that retake is "less relevant" where the full key is already
    // on screen. It is still offered (nothing here is scored, so there is no
    // score to protect) but the caption names it as a re-decision, not a fix.
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
    expect(screen.getByText(/retake to re-decide as a pod/)).toBeInTheDocument();
  });

  test('W3.4 whole-scenario: "Start over" replays the walk and a second finish records again', async () => {
    render(<DecisionScenario config={marina} labId="c1-w3" />);
    walkToFinish();
    await waitFor(() => expect(screen.getByText(/Choices recorded/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Start over/ }));
    // Back at the intro with nothing answered and the confirmation cleared.
    expect(screen.getByText(/stack of intake notes/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start the scenario/i })).toBeInTheDocument();
    expect(screen.queryByText(/Choices recorded/)).not.toBeInTheDocument();
    expect(screen.queryByText('Your choice')).not.toBeInTheDocument();
    expect(recordLabSubmission).toHaveBeenCalledTimes(1);

    // The second pass answers DELEGATE differently and records a SECOND row —
    // `saved` must be cleared or recordRun would silently no-op.
    walkToFinish(/The whole decision/);
    await waitFor(() => expect(recordLabSubmission).toHaveBeenCalledTimes(2));
    expect(recordLabSubmission).toHaveBeenLastCalledWith('u1', {
      labId: 'c1-w3',
      status: 'submitted',
      transcript: {
        kind: 'decision-scenario',
        choices: [
          { checkpointId: 'cp-delegate', selected: [0] },
          { checkpointId: 'cp-ground', selected: [0] },
          { checkpointId: 'cp-scope', selected: [0, 1] },
          { checkpointId: 'cp-verify', selected: [1] },
        ],
      },
    });
  });

  test('W3.4 whole-scenario: "Start over" is withheld while the submission is in flight', async () => {
    let release: (id: string) => void = () => {};
    recordLabSubmission.mockImplementationOnce(
      () => new Promise<string>((resolve) => { release = resolve; }),
    );
    render(<DecisionScenario config={marina} labId="c1-w3" />);
    walkToFinish();

    // Mid-save: no reset control, so it cannot race the insert (DATA-04).
    expect(screen.getByText(/Recording your choices/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Start over/ })).not.toBeInTheDocument();

    await act(async () => { release('sub-1'); });
    await waitFor(() => expect(screen.getByText(/Choices recorded/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Start over/ })).toBeInTheDocument();
  });

  // --- navigation, read-through, save handling ------------------------------

  test('Continue is disabled until the checkpoint\'s feedback is revealed', () => {
    render(<DecisionScenario config={marina} labId="c1-w3" />);
    start();
    const cont = screen.getByRole('button', { name: 'Continue' });
    expect(cont).toBeDisabled();
    fireEvent.click(cont);
    expect(screen.getByText(/Checkpoint 1 of 4/)).toBeInTheDocument(); // didn't advance

    // Selecting is not enough any more (W3.2) — Submit is.
    fireEvent.click(screen.getByRole('button', { name: /The whole decision/ }));
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    clickSubmit();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  test('Previous re-reads a completed checkpoint — choice + feedback intact, re-answerable only via Try again', () => {
    render(<DecisionScenario config={marina} labId="c1-w3" />);
    start();
    fireEvent.click(screen.getByRole('button', { name: /The first-draft summary/ }));
    clickSubmit();
    clickContinue();
    expect(screen.getByText(/Checkpoint 2 of 4/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    // Back on checkpoint 1: the submitted choice and its feedback are shown…
    expect(screen.getByText(/Checkpoint 1 of 4/)).toBeInTheDocument();
    expect(screen.getByText(/Right-sized: drafting is delegable/)).toBeInTheDocument();
    expect(screen.getByText('Your choice')).toBeInTheDocument();
    // …and it cannot be edited by clicking an option…
    expect(screen.getByRole('button', { name: /The whole decision/ })).toBeDisabled();
    // …but W3.4's explicit retake IS available on a revisited checkpoint.
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
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
    clickSubmit();
    clickContinue();
    expect(screen.getByText('Checkpoint 2 of 4')).toBeInTheDocument();
    expect(screen.getByText('GROUND')).toBeInTheDocument();
    expect(screen.queryByText('DELEGATE')).not.toBeInTheDocument();
  });

  test('post-finish: the read-through is read-only apart from "Start over"', async () => {
    render(<DecisionScenario config={marina} labId="c1-w3" />);
    walkToFinish();
    await waitFor(() => expect(screen.getByText(/Choices recorded/)).toBeInTheDocument());

    // Every checkpoint renders with its revealed feedback and submitted choice.
    expect(screen.getByText('Checkpoint 1 of 4')).toBeInTheDocument();
    expect(screen.getByText('Checkpoint 4 of 4')).toBeInTheDocument();
    expect(screen.getByText(/Right-sized: drafting is delegable/)).toBeInTheDocument();
    expect(screen.getByText(/length bound keeps the summary/)).toBeInTheDocument();
    expect(screen.getByText(/Verification against the source/)).toBeInTheDocument();
    // The multi-select answer key is complete here too (W3.3).
    expect(screen.getByText(/Never scope IN fabrication/)).toBeInTheDocument();
    // One marker per chosen option: 1 + 1 + 2 (multi-select) + 1.
    expect(screen.getAllByText('Your choice')).toHaveLength(5);

    // No stepper controls, no per-checkpoint Submit/Try again, every option
    // control disabled. "Start over" (W3.4) is the one deliberate exception.
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finish' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Try again/ })).not.toBeInTheDocument();
    const enabled = screen
      .getAllByRole('button')
      .filter((b) => !(b as HTMLButtonElement).disabled);
    expect(enabled).toHaveLength(1);
    expect(enabled[0]).toHaveAccessibleName(/Start over/);
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
    expect(region.textContent).toBe(''); // selecting alone announces nothing (W3.2)
    clickSubmit();
    expect(region).toHaveTextContent(/Right-sized: drafting is delegable/);
  });

  test('does not accept an onComplete prop (ungraded — never the completion gate)', () => {
    const onComplete = vi.fn();
    // @ts-expect-error onComplete is intentionally not part of DecisionScenario's props
    render(<DecisionScenario config={marina} labId="c1-w3" onComplete={onComplete} />);
    expect(onComplete).not.toHaveBeenCalled();
  });
});

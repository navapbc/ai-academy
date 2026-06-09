// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import IterationLab from './IterationLab';
import type { IterationConfig } from '../../types';

// The iteration lab (P4.5c): conduct a real MULTI-TURN refinement conversation with
// Claude toward a constrained goal (each turn sends the growing messages[] array via
// streamChat), then submit the whole conversation. The P4.2 LLM-judge scores the
// QUALITY OF THE LEARNER'S ITERATION (their steering turns), not the model's output.
// Like the other graded-practice exercises it records a lab_submissions row but is
// NOT the completion gate (the inline quiz is) — structurally enforced by the absence
// of an onComplete prop. These tests mock the data/grading/streaming layers and
// confirm: a turn appends a user + an assistant message, Submit is gated until
// minTurns is reached, submit grades the goal + the learner's turns + the transcript,
// the result card renders, and the quiet grading-failure path.
const { recordLabSubmission, saveGrade, requestLlmGrade, streamChat } = vi.hoisted(() => ({
  recordLabSubmission: vi.fn(async () => 'sub-1'),
  saveGrade: vi.fn(async () => {}),
  requestLlmGrade: vi.fn(async () => ({
    grader: 'llm' as const,
    perAnchor: [{ id: 'specific-targeted', label: 'Refinements are specific and targeted', score: 2, max: 2, rationale: 'Named the gaps.' }],
    overall: 2,
    maxOverall: 2,
  })),
  // Mirrors src/lib/llm.ts streamChat(messages, options, onChunk): emit a canned
  // assistant reply via the chunk callback, then resolve. One call per learner turn.
  streamChat: vi.fn(async (_messages: unknown, _options: unknown, onChunk: (t: string) => void) => {
    onChunk('ASSISTANT_DRAFT: a plain-language version of the notice.');
  }),
}));
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../../lib/progress', () => ({ recordLabSubmission, saveGrade }));
vi.mock('../../lib/grading', () => ({ requestLlmGrade }));
vi.mock('../../lib/llm', () => ({ streamChat }));

beforeEach(() => {
  recordLabSubmission.mockClear();
  saveGrade.mockClear();
  requestLlmGrade.mockClear();
  streamChat.mockClear();
});

const config: IterationConfig = {
  kind: 'iteration',
  title: 'Iterate on the overpayment notice',
  brief: {
    instruction: 'Turn the overpayment notice into a plain-language explanation.',
    constraints: ['Keep the $1,248.00 amount and the deadline.', 'Sixth-grade reading level.'],
  },
  starter: 'Try: "Rewrite this in plain language for the recipient."',
  minTurns: 3,
  rubric: {
    anchors: [{ id: 'specific-targeted', label: 'Refinements are specific and targeted', description: 'Names the gap.' }],
  },
};

async function sendTurn(text: string) {
  fireEvent.change(screen.getByLabelText(/Your message to Claude/i), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: /^Send$/i }));
  // The assistant reply lands once the stream completes.
  await waitFor(() => expect(screen.getAllByText(/ASSISTANT_DRAFT/).length).toBeGreaterThan(0));
}

describe('IterationLab', () => {
  test('renders the goal, the constraints, and the starter hint', () => {
    render(<IterationLab config={config} labId="2.4" />);
    expect(screen.getByText(/Turn the overpayment notice/)).toBeInTheDocument();
    expect(screen.getByText(/Keep the \$1,248.00 amount/)).toBeInTheDocument();
    expect(screen.getByText(/Rewrite this in plain language/)).toBeInTheDocument();
  });

  test('sending a turn appends a user message and a streamed assistant reply', async () => {
    render(<IterationLab config={config} labId="2.4" />);
    await sendTurn('Rewrite this in plain language for the recipient.');
    expect(streamChat).toHaveBeenCalledTimes(1);
    // Both the learner's message and Claude's reply are in the log.
    expect(screen.getByText('Rewrite this in plain language for the recipient.')).toBeInTheDocument();
    expect(screen.getByText(/ASSISTANT_DRAFT/)).toBeInTheDocument();
    // streamChat is sent the growing history (the user turn just added).
    const firstCall = streamChat.mock.calls[0] as unknown as [{ role: string; content: string }[]];
    expect(firstCall[0]).toEqual([
      { role: 'user', content: 'Rewrite this in plain language for the recipient.' },
    ]);
  });

  test('Submit is gated until the learner has taken minTurns turns', async () => {
    render(<IterationLab config={config} labId="2.4" />);
    const submit = () => screen.queryByRole('button', { name: /Submit iteration for grading/i });
    expect(submit()).not.toBeInTheDocument();
    await sendTurn('Turn 1: rewrite in plain language.');
    expect(submit()).not.toBeInTheDocument();
    await sendTurn('Turn 2: you dropped the deadline — add it as the first line.');
    expect(submit()).not.toBeInTheDocument();
    await sendTurn('Turn 3: bring it to a sixth-grade level and critique your own draft.');
    // Third turn reaches minTurns — Submit now appears and is enabled.
    await waitFor(() => expect(submit()).toBeEnabled());
  });

  test('on Submit: records an iteration submission and grades the goal + learner turns + transcript', async () => {
    render(<IterationLab config={config} labId="2.4" />);
    await sendTurn('Turn 1: rewrite in plain language.');
    await sendTurn('Turn 2: you dropped the deadline — add it as the first line.');
    await sendTurn('Turn 3: bring it to a sixth-grade level and critique your own draft.');
    fireEvent.click(await screen.findByRole('button', { name: /Submit iteration for grading/i }));

    await waitFor(() => expect(screen.getByText('Anchor-scored feedback')).toBeInTheDocument());

    expect(recordLabSubmission).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        labId: '2.4',
        status: 'submitted',
        transcript: expect.objectContaining({
          kind: 'iteration',
          turnCount: 3,
          messages: expect.any(Array),
        }),
      }),
    );
    expect(requestLlmGrade).toHaveBeenCalledWith(
      expect.objectContaining({
        rubric: config.rubric,
        submission: expect.objectContaining({
          brief: config.brief.instruction,
          sections: expect.arrayContaining([
            expect.objectContaining({ label: 'The goal' }),
            expect.objectContaining({ label: "The learner's turns, in order" }),
            expect.objectContaining({ label: 'Full transcript' }),
          ]),
        }),
      }),
    );
    const gradeCalls = requestLlmGrade.mock.calls as unknown as Array<
      [{ submission: { sections: { label: string; text: string }[] } }]
    >;
    const sections = gradeCalls[0][0].submission.sections;
    expect(sections).toHaveLength(3);
    // The "learner's turns" section is ONLY the user messages (no assistant text).
    const turns = sections.find((s) => s.label === "The learner's turns, in order")!;
    expect(turns.text).toContain('you dropped the deadline');
    expect(turns.text).not.toContain('ASSISTANT_DRAFT');
    // The full transcript carries both sides.
    const transcript = sections.find((s) => s.label === 'Full transcript')!;
    expect(transcript.text).toContain('ASSISTANT_DRAFT');
    expect(saveGrade).toHaveBeenCalledWith('sub-1', expect.anything(), 'reviewable');
  });

  test('shows a quiet, non-blocking note when grading fails (conversation still saved)', async () => {
    requestLlmGrade.mockRejectedValueOnce(new Error('grader down'));
    render(<IterationLab config={config} labId="2.4" />);
    await sendTurn('Turn 1.');
    await sendTurn('Turn 2.');
    await sendTurn('Turn 3.');
    fireEvent.click(await screen.findByRole('button', { name: /Submit iteration for grading/i }));

    await waitFor(() => expect(screen.getByText(/grading is unavailable/i)).toBeInTheDocument());
    expect(recordLabSubmission).toHaveBeenCalled();
    expect(screen.queryByText('Anchor-scored feedback')).not.toBeInTheDocument();
  });

  test('does not accept an onComplete prop (the quiz is the gate, not this exercise)', () => {
    const onComplete = vi.fn();
    // @ts-expect-error onComplete is intentionally not part of IterationLab's props
    render(<IterationLab config={config} labId="2.4" onComplete={onComplete} />);
    expect(onComplete).not.toHaveBeenCalled();
  });

  // D-15 regression (audit 2026-06-09): the learner's steering turns ARE the
  // graded artifact — a transient send failure must not discard the typed text.
  test('a failed send rolls back the turn but restores the typed message into the composer', async () => {
    streamChat.mockRejectedValueOnce(new Error('network down'));
    render(<IterationLab config={config} labId="2.4" />);
    const longTurn =
      'You dropped the $1,248.00 amount and the appeal deadline — restore both, and bring the reading level down to sixth grade.';
    fireEvent.change(screen.getByLabelText(/Your message to Claude/i), { target: { value: longTurn } });
    fireEvent.click(screen.getByRole('button', { name: /^Send$/i }));

    await waitFor(() => expect(screen.getByText(/Claude couldn’t reply/)).toBeInTheDocument());
    // The unanswered turn is rolled back from the log…
    expect(streamChat).toHaveBeenCalledTimes(1);
    // …but the text survives in the input, ready to resend.
    expect((screen.getByLabelText(/Your message to Claude/i) as HTMLTextAreaElement).value).toBe(longTurn);

    // Recovery: resending the restored text works.
    fireEvent.click(screen.getByRole('button', { name: /^Send$/i }));
    await waitFor(() => expect(screen.getAllByText(/ASSISTANT_DRAFT/).length).toBeGreaterThan(0));
    expect(screen.getByText(longTurn)).toBeInTheDocument();
  });
});

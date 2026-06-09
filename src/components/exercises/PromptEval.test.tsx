// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import PromptEval from './PromptEval';
import type { PromptEvalConfig } from '../../types';

// The reusable-prompt eval (P4.5b): read a recurring task + the constraints to
// encode + a small seeded test set (2 normal + 1 edge case), write ONE reusable,
// constraint-first prompt, RUN it live (streamChat, one call per case) against each
// input, then submit the prompt + its per-case outputs to the P4.2 LLM-judge for an
// anchor-scored verdict. Like the other graded-practice exercises it records a
// lab_submissions row but is NOT the completion gate (the inline quiz is) —
// structurally enforced by the absence of an onComplete prop. These tests mock the
// data/grading/streaming layers and confirm: the test set + edge marker render,
// "run" streams one output per case, Submit is gated until every case has run, save
// → multi-section grade → result card, and the quiet grading-failure path.
const { recordLabSubmission, saveGrade, requestLlmGrade, streamChat } = vi.hoisted(() => ({
  recordLabSubmission: vi.fn(async () => 'sub-1'),
  saveGrade: vi.fn(async () => {}),
  requestLlmGrade: vi.fn(async () => ({
    grader: 'llm' as const,
    perAnchor: [{ id: 'constraints-up-front', label: 'States its constraints up front', score: 2, max: 2, rationale: 'Rules first.' }],
    overall: 2,
    maxOverall: 2,
  })),
  // Mirrors src/lib/llm.ts streamChat(messages, options, onChunk): emit a canned
  // 3-line summary via the chunk callback, then resolve.
  streamChat: vi.fn(async (_messages: unknown, _options: unknown, onChunk: (t: string) => void) => {
    onChunk('Case SNAP-2231: verify the lease address against the utility bill.\nDeadline: 2026-07-15.');
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

const config: PromptEvalConfig = {
  kind: 'prompt-eval',
  title: 'Write one reusable prompt',
  brief: {
    instruction: 'Turn a raw benefits-intake record into a standard 3-line case summary for the queue.',
    constraints: ['Exactly 3 lines; ~60 words or fewer.', 'Must include case ID, action, deadline.'],
  },
  testCases: [
    { id: 'snap-2231', label: 'SNAP recertification — complete', input: 'Case ID: SNAP-2231\nReported income: $2,840\nDeadline: 2026-07-15' },
    { id: 'med-4417', label: 'Medicaid renewal — complete', input: 'Case ID: MED-4417\nReported income: $1,510\nDeadline: 2026-08-01' },
    { id: 'ccap-3902', label: 'Child care — missing income', input: 'Case ID: CCAP-3902\nReported income: [blank]\nDeadline: 2026-07-22', note: 'Income is blank — a good prompt flags it.', isEdge: true },
  ],
  rubric: {
    anchors: [{ id: 'constraints-up-front', label: 'States its constraints up front', description: 'Rules before the ask.' }],
  },
};

const goodPrompt =
  'Rules: write exactly 3 lines, about 60 words or fewer, in plain language. Every summary must include ' +
  'the case ID, the action needed, and the deadline. Never invent a missing value — if a field is blank, ' +
  'write "not provided — follow up". Now summarize the intake record below for the team queue.';

async function runAllCases() {
  fireEvent.change(screen.getByLabelText(/Your reusable prompt/i), { target: { value: goodPrompt } });
  fireEvent.click(screen.getByRole('button', { name: /Run against test cases/i }));
  // Once every case has a collected output, the Submit button appears.
  await waitFor(() => expect(screen.getByRole('button', { name: /Submit for grading/i })).toBeInTheDocument());
}

describe('PromptEval', () => {
  test('renders the brief, the constraints, and the test set with the edge case marked', () => {
    render(<PromptEval config={config} labId="2.10" />);
    expect(screen.getByText(/Turn a raw benefits-intake record/)).toBeInTheDocument();
    expect(screen.getByText(/Must include case ID, action, deadline/)).toBeInTheDocument();
    expect(screen.getByText('SNAP recertification — complete')).toBeInTheDocument();
    expect(screen.getByText('Child care — missing income')).toBeInTheDocument();
    // The edge case carries a visible badge and its hint.
    expect(screen.getByText(/Edge case/i)).toBeInTheDocument();
    expect(screen.getByText(/a good prompt flags it/i)).toBeInTheDocument();
  });

  test('Submit is hidden until the prompt has been run against every case', () => {
    render(<PromptEval config={config} labId="2.10" />);
    // Before running, there is no Submit button at all (gated on all cases run).
    expect(screen.queryByRole('button', { name: /Submit for grading/i })).not.toBeInTheDocument();
  });

  test('run streams one output per test case (one streamChat call each)', async () => {
    render(<PromptEval config={config} labId="2.10" />);
    await runAllCases();
    expect(streamChat).toHaveBeenCalledTimes(config.testCases.length);
    // The streamed output shows under the cases.
    expect(screen.getAllByText(/verify the lease address/i).length).toBeGreaterThan(0);
  });

  test('on Submit: records a prompt-eval submission, grades the prompt + per-case sections, shows the card', async () => {
    render(<PromptEval config={config} labId="2.10" />);
    await runAllCases();
    fireEvent.click(screen.getByRole('button', { name: /Submit for grading/i }));

    await waitFor(() => expect(screen.getByText('Anchor-scored feedback')).toBeInTheDocument());

    expect(recordLabSubmission).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        labId: '2.10',
        status: 'submitted',
        transcript: expect.objectContaining({
          kind: 'prompt-eval',
          prompt: expect.stringContaining('Never invent a missing value'),
          outputs: expect.objectContaining({
            'snap-2231': expect.stringContaining('verify the lease address'),
            'ccap-3902': expect.stringContaining('verify the lease address'),
          }),
        }),
      }),
    );
    expect(requestLlmGrade).toHaveBeenCalledWith(
      expect.objectContaining({
        rubric: config.rubric,
        submission: expect.objectContaining({
          brief: config.brief.instruction,
          sections: expect.arrayContaining([
            expect.objectContaining({ label: "The learner's reusable prompt" }),
            expect.objectContaining({ label: 'Case: SNAP recertification — complete' }),
            expect.objectContaining({ label: 'Case: Child care — missing income' }),
          ]),
        }),
      }),
    );
    // The judge reads one prompt section + one per case (no more, no fewer).
    const gradeCalls = requestLlmGrade.mock.calls as unknown as Array<
      [{ submission: { sections: { label: string; text: string }[] } }]
    >;
    expect(gradeCalls[0][0].submission.sections).toHaveLength(1 + config.testCases.length);
    // The per-case section carries both the INPUT and the collected OUTPUT.
    const edgeSection = gradeCalls[0][0].submission.sections.find((s) =>
      s.label.includes('Child care — missing income'),
    )!;
    expect(edgeSection.text).toContain('INPUT:');
    expect(edgeSection.text).toContain('OUTPUT:');
    expect(saveGrade).toHaveBeenCalledWith('sub-1', expect.anything(), 'reviewable');
  });

  test('shows a quiet, non-blocking note when grading fails (prompt still saved)', async () => {
    requestLlmGrade.mockRejectedValueOnce(new Error('grader down'));
    render(<PromptEval config={config} labId="2.10" />);
    await runAllCases();
    fireEvent.click(screen.getByRole('button', { name: /Submit for grading/i }));

    await waitFor(() => expect(screen.getByText(/grading is unavailable/i)).toBeInTheDocument());
    expect(recordLabSubmission).toHaveBeenCalled();
    expect(screen.queryByText('Anchor-scored feedback')).not.toBeInTheDocument();
  });

  // D-17: the failed grade is retryable in place — re-grade the saved prompt +
  // outputs (no re-run of the cases, no second submission).
  test('retrying after a grading failure re-grades the saved prompt and shows the card', async () => {
    requestLlmGrade.mockRejectedValueOnce(new Error('grader down'));
    render(<PromptEval config={config} labId="2.10" />);
    await runAllCases();
    fireEvent.click(screen.getByRole('button', { name: /Submit for grading/i }));
    await waitFor(() => expect(screen.getByText(/grading is unavailable/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Try grading again/i }));
    await waitFor(() => expect(screen.getByText('Anchor-scored feedback')).toBeInTheDocument());
    expect(screen.queryByText(/grading is unavailable/i)).not.toBeInTheDocument();
    expect(recordLabSubmission).toHaveBeenCalledTimes(1); // no second submission
    expect(saveGrade).toHaveBeenCalledTimes(1);
  });

  test('does not accept an onComplete prop (the quiz is the gate, not this exercise)', () => {
    const onComplete = vi.fn();
    // @ts-expect-error onComplete is intentionally not part of PromptEval's props
    render(<PromptEval config={config} labId="2.10" onComplete={onComplete} />);
    expect(onComplete).not.toHaveBeenCalled();
  });
});

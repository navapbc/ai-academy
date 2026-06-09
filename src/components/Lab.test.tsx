// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Lab from './Lab';
import type { LabConfig } from '../types';

// Error-path coverage for the 2.1 prompt-construction Lab (audit W2-4).
// D-04: a failed run (including a partial stream that errors mid-flight) must
// surface a role="alert" and must NOT become a saveable/gradeable response.
// D-13: a re-run must clear the previous run's grade card so stale anchor
// scores never render against new output. The happy path (run → save → grade)
// is pinned alongside so the gate semantics stay honest.
const { recordLabSubmission, saveGrade, requestLlmGrade, streamChat } = vi.hoisted(() => ({
  recordLabSubmission: vi.fn(async () => 'sub-1'),
  saveGrade: vi.fn(async () => {}),
  requestLlmGrade: vi.fn(async () => ({
    grader: 'llm' as const,
    perAnchor: [{ id: 'role-context', label: 'Role & context', score: 2, max: 2, rationale: 'Clear role.' }],
    overall: 2,
    maxOverall: 2,
  })),
  // Mirrors src/lib/llm.ts streamChat(messages, options, onChunk).
  streamChat: vi.fn(async (_m: unknown, _o: unknown, onChunk: (t: string) => void) => {
    onChunk('SUMMARY: benefits change July 1; send proof of income by June 20.');
  }),
}));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../lib/progress', () => ({ recordLabSubmission, saveGrade }));
vi.mock('../lib/grading', () => ({ requestLlmGrade }));
vi.mock('../lib/llm', () => ({ streamChat }));

beforeEach(() => {
  recordLabSubmission.mockClear();
  saveGrade.mockClear();
  requestLlmGrade.mockClear();
  streamChat.mockReset();
  streamChat.mockImplementation(async (_m: unknown, _o: unknown, onChunk: (t: string) => void) => {
    onChunk('SUMMARY: benefits change July 1; send proof of income by June 20.');
  });
});

const config: LabConfig = {
  kind: 'prompt-construction',
  brief: {
    task: 'Summarize the SNAP notice for the client.',
    constraints: ['Sixth-grade reading level.', 'Keep all dollar amounts and dates exact.'],
  },
  scaffoldHints: [{ label: 'Role', hint: 'Say who the assistant is.' }],
  rubric: {
    anchors: [{ id: 'role-context', label: 'Role & context', description: 'Establishes role and context.' }],
  },
};

async function runPrompt(text = 'You are a benefits caseworker assistant. Summarize the notice.') {
  fireEvent.change(screen.getByLabelText(/Your prompt/i), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: /Run prompt/i }));
}

describe('Lab — error paths (W2-4)', () => {
  // D-04: error text must never become the saveable response.
  test('a failed run shows an alert and does NOT enable Save', async () => {
    streamChat.mockRejectedValueOnce(new Error('Rate limit exceeded'));
    render(<Lab onComplete={() => {}} labId="2.1" config={config} />);
    await runPrompt();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Rate limit exceeded/));
    // No "Claude's Output" panel pretending the error is a response…
    expect(screen.queryByText(/^Error:/)).not.toBeInTheDocument();
    // …and no save affordance for a failed run.
    expect(screen.queryByRole('button', { name: /Save & complete/i })).not.toBeInTheDocument();
    expect(recordLabSubmission).not.toHaveBeenCalled();
  });

  // D-04 (partial-stream variant): chunks landed, then the stream died —
  // truncated output is real Claude text but must not be saveable as finished.
  test('a stream that errors after partial chunks is not saveable', async () => {
    streamChat.mockImplementationOnce(
      async (_m: unknown, _o: unknown, onChunk: (t: string) => void) => {
        onChunk('SUMMARY: benefits ch'); // truncated mid-word
        throw new Error('stream dropped');
      },
    );
    render(<Lab onComplete={() => {}} labId="2.1" config={config} />);
    await runPrompt();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/stream dropped/));
    expect(screen.queryByRole('button', { name: /Save & complete/i })).not.toBeInTheDocument();
  });

  test('a re-run after a failure recovers: output renders and Save appears', async () => {
    streamChat.mockRejectedValueOnce(new Error('blip'));
    render(<Lab onComplete={() => {}} labId="2.1" config={config} />);
    await runPrompt();
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Run prompt/i }));
    await waitFor(() => expect(screen.getByText(/benefits change July 1/)).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save & complete/i })).toBeInTheDocument();
  });

  // D-13: stale grade cards must not survive a re-run.
  test('re-running clears the previous run’s grade card', async () => {
    render(<Lab onComplete={() => {}} labId="2.1" config={config} />);
    await runPrompt();
    await waitFor(() => expect(screen.getByRole('button', { name: /Save & complete/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Save & complete/i }));
    // Graded in place: the anchor feedback renders.
    await waitFor(() => expect(screen.getByText(/Role & context/)).toBeInTheDocument());

    // New run → the old grade (and its Continue affordance) disappears until re-saved.
    fireEvent.click(screen.getByRole('button', { name: /Run prompt/i }));
    await waitFor(() => expect(screen.queryByText(/Role & context/)).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /^Continue$/i })).not.toBeInTheDocument();
  });

  // D-17: a grading failure is recoverable in place — re-grade the already-saved
  // submission instead of redoing the whole lab.
  test('a grading failure offers retry; retrying re-grades the saved submission and shows the card', async () => {
    requestLlmGrade.mockRejectedValueOnce(new Error('judge down'));
    render(<Lab onComplete={() => {}} labId="2.1" config={config} />);
    await runPrompt();
    await waitFor(() => expect(screen.getByRole('button', { name: /Save & complete/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Save & complete/i }));

    // The non-blocking note + a retry affordance appear; no card yet.
    await waitFor(() => expect(screen.getByText(/grading is unavailable/i)).toBeInTheDocument());
    expect(screen.queryByText(/Role & context/)).not.toBeInTheDocument();
    expect(recordLabSubmission).toHaveBeenCalledTimes(1);

    // Retry (judge now recovers) → anchor card renders, note clears, no second submission.
    fireEvent.click(screen.getByRole('button', { name: /Try grading again/i }));
    await waitFor(() => expect(screen.getByText(/Role & context/)).toBeInTheDocument());
    expect(screen.queryByText(/grading is unavailable/i)).not.toBeInTheDocument();
    expect(recordLabSubmission).toHaveBeenCalledTimes(1);
    expect(saveGrade).toHaveBeenCalledTimes(1);
  });

  // D-19 (a11y): the grading status must be announced, matching the four sibling
  // judge-graded labs (Lab predated the role="status" pattern).
  test('the in-flight grading status is announced (role=status)', async () => {
    let resolveGrade!: (v: Awaited<ReturnType<typeof requestLlmGrade>>) => void;
    requestLlmGrade.mockImplementationOnce(() => new Promise((res) => { resolveGrade = res; }));
    render(<Lab onComplete={() => {}} labId="2.1" config={config} />);
    await runPrompt();
    await waitFor(() => expect(screen.getByRole('button', { name: /Save & complete/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Save & complete/i }));

    // While the judge runs, the spinner sits inside a polite live region
    // (role="status"), matching the sibling labs.
    const spinner = await screen.findByText(/Grading your work/i);
    expect(spinner.closest('[role="status"]')).not.toBeNull();

    // Let it finish so no pending promise leaks into the next test.
    resolveGrade({
      grader: 'llm',
      perAnchor: [{ id: 'role-context', label: 'Role & context', score: 2, max: 2, rationale: 'ok' }],
      overall: 2,
      maxOverall: 2,
    });
    await waitFor(() => expect(screen.getByText(/Role & context/)).toBeInTheDocument());
  });

  test('happy path still saves, grades, and offers Continue (gate semantics unchanged)', async () => {
    const onComplete = vi.fn();
    render(<Lab onComplete={onComplete} labId="2.1" config={config} />);
    await runPrompt();
    await waitFor(() => expect(screen.getByRole('button', { name: /Save & complete/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Save & complete/i }));

    await waitFor(() => expect(screen.getByText(/Role & context/)).toBeInTheDocument());
    expect(recordLabSubmission).toHaveBeenCalledTimes(1);
    expect(saveGrade).toHaveBeenCalledWith('sub-1', expect.anything(), 'reviewable');
    // With a rubric, completion happens via the explicit Continue button, never automatically.
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

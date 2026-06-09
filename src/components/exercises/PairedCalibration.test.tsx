// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import PairedCalibration from './PairedCalibration';
import type { PairedCalibrationConfig } from '../../types';

// Component coverage for the paired AI-on/AI-off calibration lab (audit W2-6;
// this file also closes the D-26 "math-only coverage" gap). Pins the three
// W2-6 fixes — D-14: stopping the timer or starting over ABORTS the in-flight
// stream (post-stop tokens must not enter the saved transcript; an orphan
// stream must not haunt the next attempt); D-18: a failed save is retryable
// without wiping the unrepeatable timed runs; D-09: errors are role="alert",
// the streamed response is a live region, phase changes are announced.
const { recordLabSubmission, streamChat } = vi.hoisted(() => ({
  recordLabSubmission: vi.fn<(userId: string, input: unknown) => Promise<string>>(
    async () => 'sub-1',
  ),
  // Mirrors src/lib/llm.ts streamChat(messages, options, onChunk). The default
  // implementation emits one chunk and resolves; tests override per-case.
  streamChat: vi.fn(
    async (_m: unknown, _o: { signal?: AbortSignal }, onChunk: (t: string) => void) => {
      onChunk('CLAUDE_OUTPUT');
    },
  ),
}));
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../../lib/progress', () => ({ recordLabSubmission }));
vi.mock('../../lib/llm', () => ({ streamChat }));

beforeEach(() => {
  recordLabSubmission.mockClear();
  recordLabSubmission.mockImplementation(async () => 'sub-1');
  streamChat.mockClear();
  streamChat.mockImplementation(
    async (_m: unknown, _o: { signal?: AbortSignal }, onChunk: (t: string) => void) => {
      onChunk('CLAUDE_OUTPUT');
    },
  );
});

const config: PairedCalibrationConfig = {
  kind: 'paired-calibration',
  intro: 'Two comparable summarization tasks.',
  offTask: { label: 'Summarize notice A', brief: 'Plain-language summary, no AI.' },
  onTask: { label: 'Summarize notice B', brief: 'Same shape of task, with Claude.' },
};

/** Drives the flow to the AI-on phase (timer running, prompt box visible). */
async function reachOnPhase() {
  fireEvent.click(screen.getByRole('button', { name: /Start without AI/i }));
  fireEvent.click(screen.getByRole('button', { name: /Done — stop timer/i }));
  fireEvent.click(screen.getByRole('button', { name: /Start with Claude/i }));
  fireEvent.change(screen.getByPlaceholderText(/Prompt Claude/i), {
    target: { value: 'Summarize it.' },
  });
}

/** From the on phase: stop the timer, fill the report, reveal. */
async function reportAndReveal() {
  fireEvent.click(screen.getByRole('button', { name: /Done — stop timer/i }));
  const numbers = screen.getAllByRole('spinbutton');
  fireEvent.change(numbers[0], { target: { value: '50' } }); // estimate %
  fireEvent.change(numbers[1], { target: { value: '2' } }); // off defects
  fireEvent.change(numbers[2], { target: { value: '1' } }); // on defects
  fireEvent.click(screen.getByRole('button', { name: /Reveal my calibration number/i }));
  await waitFor(() => expect(screen.getByText(/Calibration gap:/)).toBeInTheDocument());
}

describe('PairedCalibration (W2-6)', () => {
  // D-14: "Done — stop timer" must abort the in-flight stream.
  test('stopping the AI-on timer aborts an in-flight stream', async () => {
    let capturedSignal: AbortSignal | undefined;
    streamChat.mockImplementationOnce(
      (_m: unknown, o: { signal?: AbortSignal }, onChunk: (t: string) => void) =>
        new Promise<void>((resolve) => {
          capturedSignal = o.signal;
          onChunk('partial ');
          o.signal?.addEventListener('abort', () => resolve()); // resolves cleanly on abort (W2-4 contract)
        }),
    );
    render(<PairedCalibration config={config} labId="2.15" />);
    await reachOnPhase();
    fireEvent.click(screen.getByRole('button', { name: /Run prompt/i }));
    await waitFor(() => expect(capturedSignal).toBeTruthy());
    expect(capturedSignal!.aborted).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /Done — stop timer/i }));
    expect(capturedSignal!.aborted).toBe(true);
  });

  // D-14: "Start over" must abort too, and the next attempt must be usable.
  test('start over aborts an orphan stream and the next attempt can run immediately', async () => {
    let capturedSignal: AbortSignal | undefined;
    streamChat.mockImplementationOnce(
      (_m: unknown, o: { signal?: AbortSignal }, onChunk: (t: string) => void) =>
        new Promise<void>((resolve) => {
          capturedSignal = o.signal;
          onChunk('ghost ');
          o.signal?.addEventListener('abort', () => resolve());
        }),
    );
    render(<PairedCalibration config={config} labId="2.15" />);
    await reachOnPhase();
    fireEvent.click(screen.getByRole('button', { name: /Run prompt/i }));
    await waitFor(() => expect(capturedSignal).toBeTruthy());
    await reportAndReveal();

    fireEvent.click(screen.getByRole('button', { name: /Start over/i }));
    expect(capturedSignal!.aborted).toBe(true);

    // The fresh attempt's Run is immediately usable (isStreaming released).
    await reachOnPhase();
    const run = screen.getByRole('button', { name: /Run prompt/i });
    await waitFor(() => expect(run).toBeEnabled());
    fireEvent.click(run);
    await waitFor(() => expect(screen.getByText(/CLAUDE_OUTPUT/)).toBeInTheDocument());
  });

  // D-18: failed save → alert + Retry save that preserves the timed runs.
  test('a failed save shows an alert and Retry save re-submits the same timed runs', async () => {
    recordLabSubmission.mockRejectedValueOnce(new Error('network down'));
    render(<PairedCalibration config={config} labId="2.15" />);
    await reachOnPhase();
    fireEvent.click(screen.getByRole('button', { name: /Run prompt/i }));
    await waitFor(() => expect(screen.getByText(/CLAUDE_OUTPUT/)).toBeInTheDocument());
    await reportAndReveal();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/network down/));
    const firstPayload = recordLabSubmission.mock.calls[0][1] as {
      transcript: { offMs: number; onMs: number; estimatePct: number };
    };

    fireEvent.click(screen.getByRole('button', { name: /Retry save/i }));
    await waitFor(() => expect(recordLabSubmission).toHaveBeenCalledTimes(2));
    // The retry carries the SAME runs — nothing was wiped or re-timed.
    const retryPayload = recordLabSubmission.mock.calls[1][1] as {
      transcript: { offMs: number; onMs: number; estimatePct: number };
    };
    expect(retryPayload.transcript.offMs).toBe(firstPayload.transcript.offMs);
    expect(retryPayload.transcript.onMs).toBe(firstPayload.transcript.onMs);
    expect(retryPayload.transcript.estimatePct).toBe(50);
    // The result stays on screen throughout; the alert clears on success.
    expect(screen.getByText(/Calibration gap:/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  // D-09: run errors are announced.
  test('a failed Claude run renders a role="alert"', async () => {
    streamChat.mockRejectedValueOnce(new Error('rate limited'));
    render(<PairedCalibration config={config} labId="2.15" />);
    await reachOnPhase();
    fireEvent.click(screen.getByRole('button', { name: /Run prompt/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/rate limited/));
  });

  // D-09: the streamed response is a live region; phases are announced.
  test('the streamed response is a polite live region and phase changes are announced', async () => {
    render(<PairedCalibration config={config} labId="2.15" />);
    // The persistent announcer reflects the current phase from the start…
    expect(screen.getByText(/read both tasks/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Start without AI/i }));
    expect(screen.getByText(/Timer started — do the task without AI/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Done — stop timer/i }));
    fireEvent.click(screen.getByRole('button', { name: /Start with Claude/i }));
    fireEvent.change(screen.getByPlaceholderText(/Prompt Claude/i), { target: { value: 'Go.' } });
    fireEvent.click(screen.getByRole('button', { name: /Run prompt/i }));
    await waitFor(() => expect(screen.getByText(/CLAUDE_OUTPUT/)).toBeInTheDocument());
    // The response container carries the A11Y-04 live-region pattern.
    const region = screen.getByText(/CLAUDE_OUTPUT/).closest('[role="status"]');
    expect(region).not.toBeNull();
    expect(region).toHaveAttribute('aria-live', 'polite');
  });

  test('does not accept an onComplete prop (the quiz is the gate, not this exercise)', () => {
    const onComplete = vi.fn();
    // @ts-expect-error onComplete is intentionally not part of PairedCalibration's props
    render(<PairedCalibration config={config} labId="2.15" onComplete={onComplete} />);
    expect(onComplete).not.toHaveBeenCalled();
  });
});

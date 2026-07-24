// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within, act } from '@testing-library/react';
import PredictionSort from './PredictionSort';
import type { PredictionSortConfig } from '../../types';

const { recordLabSubmission, useAuth, streamChat } = vi.hoisted(() => ({
  recordLabSubmission: vi.fn(async () => 'sub-1'),
  useAuth: vi.fn((): { user: { id: string } | null } => ({ user: { id: 'u1' } })),
  streamChat: vi.fn(),
}));
vi.mock('../../lib/auth', () => ({ useAuth }));
vi.mock('../../lib/progress', () => ({ recordLabSubmission }));
vi.mock('../../lib/llm', () => ({ streamChat }));
// The component reads DEFAULT_MODEL_ID from here; assert against it below.
import { DEFAULT_MODEL_ID } from '../../lib/models';

beforeEach(() => {
  recordLabSubmission.mockClear();
  streamChat.mockReset();
  useAuth.mockReturnValue({ user: { id: 'u1' } });
});

const config: PredictionSortConfig = {
  kind: 'prediction-sort',
  introMd: 'Sort each task by what it feels like.',
  bucketLabels: { lookup: 'Feels like looking it up', predict: 'Feels like making it up' },
  items: [
    { id: 'a', prompt: "What's the capital of France?", reveal: 'Predicted Paris.' },
    { id: 'b', prompt: 'Give me three offsite ideas.', reveal: 'Plainly generated.' },
  ],
  takeaway: { title: 'The twist', body: 'It was all prediction.' },
};

// Places every item into its lookup bucket by clicking the lookup-labelled button
// inside each item's radiogroup.
function placeAll() {
  for (const item of config.items) {
    const group = screen.getByRole('radiogroup', { name: item.prompt });
    fireEvent.click(within(group).getByRole('radio', { name: config.bucketLabels.lookup }));
  }
}

describe('PredictionSort', () => {
  test('renders each item prompt and both bucket labels', () => {
    render(<PredictionSort config={config} labId="c1-w1-lookup-vs-predict" />);
    expect(screen.getByText("What's the capital of France?")).toBeTruthy();
    expect(screen.getByText('Give me three offsite ideas.')).toBeTruthy();
    // Bucket labels appear as radio options inside each item.
    expect(screen.getAllByRole('radio', { name: 'Feels like looking it up' }).length).toBe(2);
  });

  test('submit is disabled until every item is placed', () => {
    render(<PredictionSort config={config} labId="c1-w1-lookup-vs-predict" />);
    const submit = screen.getByRole('button', { name: /submit/i });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    placeAll();
    expect((submit as HTMLButtonElement).disabled).toBe(false);
  });

  test('on submit: reveals notes + takeaway and records one submission', async () => {
    render(<PredictionSort config={config} labId="c1-w1-lookup-vs-predict" />);
    placeAll();
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => expect(recordLabSubmission).toHaveBeenCalledTimes(1));
    expect(recordLabSubmission).toHaveBeenCalledWith('u1', expect.objectContaining({
      labId: 'c1-w1-lookup-vs-predict',
      status: 'submitted',
    }));
    expect(screen.getByText(/it never looked anything up/i)).toBeTruthy();
    expect(screen.getByText('Predicted Paris.')).toBeTruthy();
    expect(screen.getByText('The twist')).toBeTruthy();
  });

  test('while the save is in flight: shows "Submitting…" and withholds "Try again"', async () => {
    let resolveSave!: (v: string) => void;
    recordLabSubmission.mockImplementationOnce(
      () => new Promise<string>((resolve) => { resolveSave = resolve; }),
    );
    render(<PredictionSort config={config} labId="c1-w1-lookup-vs-predict" />);
    placeAll();
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    // Reveal is instant, but the footer reflects the in-flight save: the "Submitting…"
    // spinner shows and "Try again" (and "Submit") are absent, so a reset can't race it.
    expect(await screen.findByText(/submitting/i)).toBeTruthy();
    expect(screen.getByText('The twist')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^submit$/i })).toBeNull();

    // Once the save settles, "Try again" appears and the spinner is gone.
    await act(async () => { resolveSave('sub-1'); });
    expect(await screen.findByRole('button', { name: /try again/i })).toBeTruthy();
    expect(screen.queryByText(/submitting/i)).toBeNull();
  });

  test('try again resets placements and hides the reveal', async () => {
    render(<PredictionSort config={config} labId="c1-w1-lookup-vs-predict" />);
    placeAll();
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => expect(screen.getByText('The twist')).toBeTruthy());
    // Wait for the save to settle so "Try again" has replaced the in-flight spinner.
    fireEvent.click(await screen.findByRole('button', { name: /try again/i }));
    expect(screen.queryByText('The twist')).toBeNull();
    expect((screen.getByRole('button', { name: /submit/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  test('signed-out: shows the sign-in prompt and does not record', async () => {
    useAuth.mockReturnValue({ user: null });
    render(<PredictionSort config={config} labId="c1-w1-lookup-vs-predict" />);
    placeAll();
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(recordLabSubmission).not.toHaveBeenCalled();
  });

  test('run prompt: streams Claude\'s answer into the card with the item prompt + Haiku', async () => {
    streamChat.mockImplementation(async (_messages, _opts, onChunk) => {
      onChunk('Paris.');
    });
    render(<PredictionSort config={config} labId="c1-w1-lookup-vs-predict" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: "Run prompt: What's the capital of France?" }));
    });
    expect(await screen.findByText('Paris.')).toBeTruthy();
    expect(streamChat).toHaveBeenCalledWith(
      [{ role: 'user', content: "What's the capital of France?" }],
      // maxTokens keeps the answer slim; signal is the abort handle — both load-bearing.
      expect.objectContaining({ model: DEFAULT_MODEL_ID, maxTokens: 300 }),
      expect.any(Function),
    );
    const opts = streamChat.mock.calls[0][1] as { signal?: unknown };
    expect(opts.signal).toBeInstanceOf(AbortSignal);
    // Button relabels to "Run again" once a run has happened.
    expect(screen.getByRole('button', { name: "Run prompt: What's the capital of France?" }).textContent).toContain('Run again');
  });

  test('run prompt: shows a streaming indicator and disables the button while in flight', async () => {
    let resolveRun!: () => void;
    streamChat.mockImplementation(
      () => new Promise<void>((resolve) => { resolveRun = resolve; }),
    );
    render(<PredictionSort config={config} labId="c1-w1-lookup-vs-predict" />);
    const runBtn = screen.getByRole('button', { name: "Run prompt: What's the capital of France?" });
    fireEvent.click(runBtn);
    await waitFor(() => expect((runBtn as HTMLButtonElement).disabled).toBe(true));
    expect(runBtn.getAttribute('aria-busy')).toBe('true');
    expect(runBtn.textContent).toContain('Running…');
    await act(async () => { resolveRun(); });
    await waitFor(() => expect((runBtn as HTMLButtonElement).disabled).toBe(false));
  });

  test('run prompt: surfaces an error alert when the request fails', async () => {
    streamChat.mockRejectedValue(new Error('network boom'));
    render(<PredictionSort config={config} labId="c1-w1-lookup-vs-predict" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: "Run prompt: What's the capital of France?" }));
    });
    expect(await screen.findByText('network boom')).toBeTruthy();
  });

  test('run prompt: works while signed out (does not require auth)', async () => {
    useAuth.mockReturnValue({ user: null });
    streamChat.mockImplementation(async (_messages, _opts, onChunk) => {
      onChunk('Paris.');
    });
    render(<PredictionSort config={config} labId="c1-w1-lookup-vs-predict" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: "Run prompt: What's the capital of France?" }));
    });
    expect(streamChat).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Paris.')).toBeTruthy();
  });

  test('run prompt: unmounting aborts an in-flight stream', async () => {
    let capturedSignal: AbortSignal | undefined;
    streamChat.mockImplementation(
      (_messages, opts: { signal?: AbortSignal }) => {
        capturedSignal = opts.signal;
        return new Promise<void>(() => {}); // never resolves — stays in flight
      },
    );
    const { unmount } = render(<PredictionSort config={config} labId="c1-w1-lookup-vs-predict" />);
    fireEvent.click(screen.getByRole('button', { name: "Run prompt: What's the capital of France?" }));
    await waitFor(() => expect(capturedSignal).toBeInstanceOf(AbortSignal));
    expect(capturedSignal!.aborted).toBe(false);
    unmount();
    expect(capturedSignal!.aborted).toBe(true);
  });

  test('try again aborts an in-flight run so no orphan stream writes into the reset card', async () => {
    let capturedSignal: AbortSignal | undefined;
    streamChat.mockImplementation(
      (_messages, opts: { signal?: AbortSignal }) => {
        capturedSignal = opts.signal;
        return new Promise<void>(() => {}); // never resolves — stays in flight
      },
    );
    render(<PredictionSort config={config} labId="c1-w1-lookup-vs-predict" />);
    fireEvent.click(screen.getByRole('button', { name: "Run prompt: What's the capital of France?" }));
    await waitFor(() => expect(capturedSignal).toBeInstanceOf(AbortSignal));
    // Placing + submitting is independent of the streaming run.
    placeAll();
    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /try again/i }));
    expect(capturedSignal!.aborted).toBe(true);
  });

  test('run prompt: is independent of grading and persists through the reveal', async () => {
    streamChat.mockImplementation(async (_messages, _opts, onChunk) => {
      onChunk('Paris.');
    });
    render(<PredictionSort config={config} labId="c1-w1-lookup-vs-predict" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: "Run prompt: What's the capital of France?" }));
    });
    expect(await screen.findByText('Paris.')).toBeTruthy();
    placeAll();
    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));
    await waitFor(() => expect(screen.getByText('The twist')).toBeTruthy());
    // The run output survives grading; only item 'a' ran, so item 'b' has no window.
    expect(screen.getByText('Paris.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Run prompt: Give me three offsite ideas.' }).textContent).toContain('Run prompt');
  });
});

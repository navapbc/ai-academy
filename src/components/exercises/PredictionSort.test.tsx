// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import PredictionSort from './PredictionSort';
import type { PredictionSortConfig } from '../../types';

const { recordLabSubmission, useAuth } = vi.hoisted(() => ({
  recordLabSubmission: vi.fn(async () => 'sub-1'),
  useAuth: vi.fn((): { user: { id: string } | null } => ({ user: { id: 'u1' } })),
}));
vi.mock('../../lib/auth', () => ({ useAuth }));
vi.mock('../../lib/progress', () => ({ recordLabSubmission }));

beforeEach(() => {
  recordLabSubmission.mockClear();
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

  test('try again resets placements and hides the reveal', async () => {
    render(<PredictionSort config={config} labId="c1-w1-lookup-vs-predict" />);
    placeAll();
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => expect(screen.getByText('The twist')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
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
});

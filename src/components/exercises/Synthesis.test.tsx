// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Synthesis from './Synthesis';
import type { SynthesisConfig } from '../../types';

// The synthesis exercise (P4.4a): read sourced interview notes, write a synthesis
// that keeps the minority voice, graded in place by the LLM-judge. Built on the
// same shared SourcedFreeTextLab as Critique. Like the other graded-practice
// exercises it records a lab_submissions row but is NOT the completion gate (the
// inline quiz is) — structurally enforced by the absence of an onComplete prop.
// These tests mock the data + grading layer and confirm render → min-words gate →
// save → grade → result card.
const { recordLabSubmission, saveGrade, requestLlmGrade } = vi.hoisted(() => ({
  recordLabSubmission: vi.fn(async () => 'sub-1'),
  saveGrade: vi.fn(async () => {}),
  requestLlmGrade: vi.fn(async () => ({
    grader: 'llm' as const,
    perAnchor: [{ id: 'a', label: 'Surface the dissenting voice', score: 2, max: 2, rationale: 'Kept it.' }],
    overall: 2,
    maxOverall: 2,
  })),
}));
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../../lib/progress', () => ({ recordLabSubmission, saveGrade }));
vi.mock('../../lib/grading', () => ({ requestLlmGrade }));

beforeEach(() => {
  recordLabSubmission.mockClear();
  saveGrade.mockClear();
  requestLlmGrade.mockClear();
});

const config: SynthesisConfig = {
  kind: 'synthesis',
  title: 'Synthesize the research',
  brief: { instruction: 'Synthesize these interview notes into themes for the readout.' },
  sources: {
    label: 'Interview notes (10 sessions)',
    bodyMd: 'P1 — filed in fifteen minutes.\n\nP7 — could not finish on library wi-fi before the session timed out.',
  },
  rubric: {
    anchors: [{ id: 'a', label: 'Surface the dissenting voice', description: 'Keeps the minority view.' }],
  },
};

const longSynthesis =
  'Most of the ten participants completed the online claim quickly and found it clearer than the ' +
  'old phone line, but the synthesis cannot stop there. One claimant on the public library wi-fi ' +
  'could not finish before the session timed out, and a gig worker had no way to enter ' +
  'self-employment income, so I would flag both as material findings and note the small sample ' +
  'skews toward people who already had reliable devices and connectivity.';

describe('Synthesis', () => {
  test('renders the sources and instruction', () => {
    render(<Synthesis config={config} labId="2.7" />);
    expect(screen.getByText(/could not finish on library wi-fi/)).toBeInTheDocument();
    expect(screen.getByText(/Synthesize these interview notes/)).toBeInTheDocument();
    expect(screen.getByText('Interview notes (10 sessions)')).toBeInTheDocument();
  });

  test('Save is disabled below the word floor and enabled above it', () => {
    render(<Synthesis config={config} labId="2.7" />);
    const textarea = screen.getByLabelText(/Your synthesis/i);
    const save = () => screen.getByRole('button', { name: /Save/i });

    fireEvent.change(textarea, { target: { value: 'too short' } });
    expect(save()).toBeDisabled();

    fireEvent.change(textarea, { target: { value: longSynthesis } });
    expect(save()).toBeEnabled();
  });

  test('on Save: records a synthesis submission, grades it, and shows the result card', async () => {
    render(<Synthesis config={config} labId="2.7" />);
    fireEvent.change(screen.getByLabelText(/Your synthesis/i), { target: { value: longSynthesis } });
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => expect(screen.getByText('Anchor-scored feedback')).toBeInTheDocument());

    expect(recordLabSubmission).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        labId: '2.7',
        status: 'submitted',
        transcript: expect.objectContaining({ kind: 'synthesis' }),
      }),
    );
    expect(requestLlmGrade).toHaveBeenCalledWith(
      expect.objectContaining({
        rubric: config.rubric,
        submission: expect.objectContaining({
          brief: config.brief.instruction,
          sections: expect.arrayContaining([
            expect.objectContaining({ label: 'Source excerpts' }),
            expect.objectContaining({ label: "The learner's synthesis" }),
          ]),
        }),
      }),
    );
    expect(saveGrade).toHaveBeenCalledWith('sub-1', expect.anything(), 'reviewable');
  });

  test('shows a quiet, non-blocking note when grading fails (work still saved)', async () => {
    requestLlmGrade.mockRejectedValueOnce(new Error('grader down'));
    render(<Synthesis config={config} labId="2.7" />);
    fireEvent.change(screen.getByLabelText(/Your synthesis/i), { target: { value: longSynthesis } });
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => expect(screen.getByText(/grading is unavailable/i)).toBeInTheDocument());
    expect(recordLabSubmission).toHaveBeenCalled();
    expect(screen.queryByText('Anchor-scored feedback')).not.toBeInTheDocument();
  });

  // D-17: the failed grade is retryable in place — re-grade the saved synthesis
  // (no rewrite, no second submission).
  test('retrying after a grading failure re-grades the saved synthesis and shows the card', async () => {
    requestLlmGrade.mockRejectedValueOnce(new Error('grader down'));
    render(<Synthesis config={config} labId="2.7" />);
    fireEvent.change(screen.getByLabelText(/Your synthesis/i), { target: { value: longSynthesis } });
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    await waitFor(() => expect(screen.getByText(/grading is unavailable/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Try grading again/i }));
    await waitFor(() => expect(screen.getByText('Anchor-scored feedback')).toBeInTheDocument());
    expect(screen.queryByText(/grading is unavailable/i)).not.toBeInTheDocument();
    expect(recordLabSubmission).toHaveBeenCalledTimes(1); // no second submission
    expect(saveGrade).toHaveBeenCalledTimes(1);
  });
});

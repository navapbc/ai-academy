// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Critique from './Critique';
import type { CritiqueConfig } from '../../types';

// The critique exercise (P4.3b): read a polished AI artifact, write a critique,
// graded in place by the LLM-judge. Like the other graded-practice exercises it
// records a lab_submissions row but is NOT the completion gate (the inline quiz
// is) — structurally enforced by the absence of an onComplete prop. These tests
// mock the data + grading layer and confirm render → min-words gate → save →
// grade → result card.
const { recordLabSubmission, saveGrade, requestLlmGrade } = vi.hoisted(() => ({
  recordLabSubmission: vi.fn(async () => 'sub-1'),
  saveGrade: vi.fn(async () => {}),
  requestLlmGrade: vi.fn(async () => ({
    grader: 'llm' as const,
    perAnchor: [{ id: 'a', label: 'Verify the citation', score: 2, max: 2, rationale: 'Caught it.' }],
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

const config: CritiqueConfig = {
  kind: 'critique',
  title: 'Critique the summary',
  brief: { instruction: 'Write a short critique of this eligibility summary.' },
  artifact: {
    label: 'AI-generated eligibility summary',
    bodyMd: 'This household is **income-eligible** under 7 CFR 273.10.',
  },
  rubric: {
    anchors: [{ id: 'a', label: 'Verify the citation', description: 'Flags the cite to verify.' }],
  },
};

const longCritique =
  'The citation to 7 CFR 273.10 should be checked against the primary source, and the ' +
  'specific effective date and enrollment statistic cannot be verified from this document ' +
  'alone, so I would open eCFR and request the underlying data before relying on any of it.';

describe('Critique', () => {
  test('renders the artifact and instruction', () => {
    render(<Critique config={config} labId="2.2" />);
    expect(screen.getByText(/income-eligible/)).toBeInTheDocument();
    expect(screen.getByText(/Write a short critique/)).toBeInTheDocument();
    expect(screen.getByText('AI-generated eligibility summary')).toBeInTheDocument();
  });

  test('Save is disabled below the word floor and enabled above it', () => {
    render(<Critique config={config} labId="2.2" />);
    const textarea = screen.getByLabelText(/Your critique/i);
    const save = () => screen.getByRole('button', { name: /Save/i });

    fireEvent.change(textarea, { target: { value: 'too short' } });
    expect(save()).toBeDisabled();

    fireEvent.change(textarea, { target: { value: longCritique } });
    expect(save()).toBeEnabled();
  });

  test('on Save: records a critique submission, grades it, and shows the result card', async () => {
    render(<Critique config={config} labId="2.2" />);
    fireEvent.change(screen.getByLabelText(/Your critique/i), { target: { value: longCritique } });
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => expect(screen.getByText('Anchor-scored feedback')).toBeInTheDocument());

    expect(recordLabSubmission).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        labId: '2.2',
        status: 'submitted',
        transcript: expect.objectContaining({ kind: 'critique' }),
      }),
    );
    expect(requestLlmGrade).toHaveBeenCalledWith(
      expect.objectContaining({
        rubric: config.rubric,
        submission: expect.objectContaining({
          brief: config.brief.instruction,
          sections: expect.arrayContaining([
            expect.objectContaining({ label: 'Artifact under review' }),
            expect.objectContaining({ label: "The learner's critique" }),
          ]),
        }),
      }),
    );
    expect(saveGrade).toHaveBeenCalledWith('sub-1', expect.anything(), 'reviewable');
  });

  test('shows a quiet, non-blocking note when grading fails (work still saved)', async () => {
    requestLlmGrade.mockRejectedValueOnce(new Error('grader down'));
    render(<Critique config={config} labId="2.2" />);
    fireEvent.change(screen.getByLabelText(/Your critique/i), { target: { value: longCritique } });
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => expect(screen.getByText(/grading is unavailable/i)).toBeInTheDocument());
    expect(recordLabSubmission).toHaveBeenCalled();
    expect(screen.queryByText('Anchor-scored feedback')).not.toBeInTheDocument();
  });

  // D-17: the failed grade is retryable in place — re-grade the saved critique
  // (no rewrite, no second submission).
  test('retrying after a grading failure re-grades the saved critique and shows the card', async () => {
    requestLlmGrade.mockRejectedValueOnce(new Error('grader down'));
    render(<Critique config={config} labId="2.2" />);
    fireEvent.change(screen.getByLabelText(/Your critique/i), { target: { value: longCritique } });
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    await waitFor(() => expect(screen.getByText(/grading is unavailable/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Try grading again/i }));
    await waitFor(() => expect(screen.getByText('Anchor-scored feedback')).toBeInTheDocument());
    expect(screen.queryByText(/grading is unavailable/i)).not.toBeInTheDocument();
    expect(recordLabSubmission).toHaveBeenCalledTimes(1); // no second submission
    expect(saveGrade).toHaveBeenCalledTimes(1);
  });
});

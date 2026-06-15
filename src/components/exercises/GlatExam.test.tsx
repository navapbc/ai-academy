// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GlatExam from './GlatExam';
import type { GlatConfig } from '../../types';

const { recordQuizAttempt, useAuthMock } = vi.hoisted(() => ({
  recordQuizAttempt: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock('../../lib/progress', () => ({ recordQuizAttempt }));
vi.mock('../../lib/auth', () => ({ useAuth: useAuthMock }));

const CONFIG: GlatConfig = {
  kind: 'glat',
  passThreshold: 0.8,
  sectionA: [{ id: 'A1', prompt: 'How confident are you?', scaleLabels: ['Not at all', 'Very'] }],
  sectionBC: [
    { id: 'B1', question: 'Q1?', options: ['B1-right', 'B1-wrong'], correctIndex: 0, rationale: 'because one' },
    { id: 'B2', question: 'Q2?', options: ['B2-wrong', 'B2-right'], correctIndex: 1, rationale: 'because two' },
    { id: 'B3', question: 'Q3?', options: ['B3-right', 'B3-wrong'], correctIndex: 0, rationale: 'because three' },
    { id: 'B4', question: 'Q4?', options: ['B4-right', 'B4-wrong'], correctIndex: 0, rationale: 'because four' },
    { id: 'B5', question: 'Q5?', options: ['B5-right', 'B5-wrong'], correctIndex: 0, rationale: 'because five' },
  ],
};

beforeEach(() => {
  recordQuizAttempt.mockReset();
  recordQuizAttempt.mockResolvedValue(undefined);
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue({ user: { id: 'u-1' } });
});

// Maps B-item id to the question text prefix used in aria-labelledby.
const QUESTION_TEXT: Record<string, RegExp> = {
  B1: /Q1\?/,
  B2: /Q2\?/,
  B3: /Q3\?/,
  B4: /Q4\?/,
  B5: /Q5\?/,
};

// Pick the correct option for B1..Bn (helper keeps the test readable).
async function answer(ids: { id: string; optionText: string }[]) {
  for (const { id, optionText } of ids) {
    const group = screen.getByRole('radiogroup', { name: QUESTION_TEXT[id] });
    await userEvent.click(within(group).getByRole('radio', { name: optionText }));
  }
}

describe('GlatExam', () => {
  test('passing run records a passing attempt and completes the cell', async () => {
    const onComplete = vi.fn();
    render(<GlatExam config={CONFIG} labId="2.14" onComplete={onComplete} />);

    await answer([
      { id: 'B1', optionText: 'B1-right' },
      { id: 'B2', optionText: 'B2-right' },
      { id: 'B3', optionText: 'B3-right' },
      { id: 'B4', optionText: 'B4-right' },
      { id: 'B5', optionText: 'B5-wrong' }, // 4/5 = 0.8 → passes
    ]);
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));

    // The pass/fail banner shows first; the attempt is recorded on submit, but
    // completion only fires when the learner clicks "Finish" (so the result is
    // seen, not auto-advanced past).
    expect(await screen.findByText(/passed/i)).toBeInTheDocument();
    expect(recordQuizAttempt).toHaveBeenCalledTimes(1);
    const [, payload] = recordQuizAttempt.mock.calls[0];
    expect(payload).toMatchObject({ moduleId: '2.14', score: 4, maxScore: 5, passed: true });
    expect(onComplete).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /finish/i }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('failing run records a failed attempt, shows retake, does NOT complete', async () => {
    const onComplete = vi.fn();
    render(<GlatExam config={CONFIG} labId="2.14" onComplete={onComplete} />);

    await answer([
      { id: 'B1', optionText: 'B1-right' },
      { id: 'B2', optionText: 'B2-right' },
      { id: 'B3', optionText: 'B3-wrong' },
      { id: 'B4', optionText: 'B4-wrong' },
      { id: 'B5', optionText: 'B5-wrong' }, // 2/5 = 0.4 → fails
    ]);
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));

    expect(await screen.findByText(/not yet/i)).toBeInTheDocument();
    const [, payload] = recordQuizAttempt.mock.calls[0];
    expect(payload).toMatchObject({ passed: false, score: 2, maxScore: 5 });
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /retake/i })).toBeInTheDocument();
  });

  test('Section A response rides in answers but does not change pass/fail', async () => {
    render(<GlatExam config={CONFIG} labId="2.14" onComplete={vi.fn()} />);
    // answer Section A scale (pick 2 of 5)
    const aGroup = screen.getByRole('radiogroup', { name: /How confident are you\?/ });
    await userEvent.click(within(aGroup).getByRole('radio', { name: '2' }));
    await answer([
      { id: 'B1', optionText: 'B1-right' },
      { id: 'B2', optionText: 'B2-right' },
      { id: 'B3', optionText: 'B3-right' },
      { id: 'B4', optionText: 'B4-right' },
      { id: 'B5', optionText: 'B5-right' },
    ]);
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));

    const [, payload] = recordQuizAttempt.mock.calls[0];
    expect(payload.answers.A1).toBe(2);
    expect(payload.passed).toBe(true);
    expect(payload.score).toBe(5);
  });

  test('submit is disabled until all scored items are answered', async () => {
    render(<GlatExam config={CONFIG} labId="2.14" onComplete={vi.fn()} />);
    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
  });
});

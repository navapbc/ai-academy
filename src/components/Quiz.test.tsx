// @vitest-environment jsdom
import { StrictMode } from 'react';
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Quiz from './Quiz';
import type { QuizQuestion } from '../types';

// Component tests for the quiz — UNGATED PRACTICE under U9 (R15/R16): finishing
// a run at ANY score records the attempt (which auto-completes the module via
// the data layer's participation seam — covered in progress.unit.test.ts /
// useProgress.test.tsx, not here). We mock auth (a signed-in user) and the
// progress data layer so nothing hits the network, and assert: options render,
// the score is computed, recordQuizAttempt fires exactly once per finished run,
// and NO gate copy or advance button appears at any score.
const { recordQuizAttempt, fetchQuizSummary } = vi.hoisted(() => ({
  recordQuizAttempt: vi.fn(async () => {}),
  fetchQuizSummary: vi.fn(async () => ({ best: null, latest: null })),
}));

vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../lib/progress', () => ({ recordQuizAttempt, fetchQuizSummary }));

const questions: QuizQuestion[] = [
  { question: 'What is PII?', options: ['Public info', 'Personal info'], correctIndex: 1, explanation: 'PII is personal.' },
  { question: '2 + 2?', options: ['3', '4'], correctIndex: 1, explanation: 'Four.' },
];

beforeEach(() => {
  recordQuizAttempt.mockClear();
  fetchQuizSummary.mockClear();
});

async function answer(option: string, then: 'Next Question' | 'See Results') {
  const user = userEvent.setup();
  // Options are a radiogroup (A11Y-01), so they expose role="radio".
  await user.click(screen.getByRole('radio', { name: option }));
  await user.click(screen.getByRole('button', { name: 'Submit Answer' }));
  await user.click(screen.getByRole('button', { name: then }));
}

describe('Quiz', () => {
  test('renders the first question and its options', () => {
    render(<Quiz moduleId="1.4" questions={questions} />);
    expect(screen.getByText('What is PII?')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'What is PII?' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Public info' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Personal info' })).toBeInTheDocument();
    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
    // A11Y-08: the question progress bar is a semantic progressbar.
    expect(screen.getByRole('progressbar', { name: /Quiz progress/i })).toBeInTheDocument();
  });

  test('exposes selection via aria-checked and announces feedback (A11Y-01/03)', async () => {
    const user = userEvent.setup();
    render(<Quiz moduleId="1.4" questions={questions} />);
    const option = screen.getByRole('radio', { name: 'Personal info' });
    expect(option).toHaveAttribute('aria-checked', 'false');
    await user.click(option);
    expect(option).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('button', { name: 'Submit Answer' }));
    // Feedback is announced via a polite live region.
    expect(screen.getByRole('status')).toHaveTextContent(/Correct!/i);
  });

  test('returns null for an empty question set', () => {
    const { container } = render(<Quiz moduleId="1.4" questions={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('a perfect run records a passing attempt and shows practice copy — no advance button', async () => {
    render(<Quiz moduleId="1.4" questions={questions} />);

    await answer('Personal info', 'Next Question');
    await answer('4', 'See Results');

    expect(screen.getByText('Checkpoint Result')).toBeInTheDocument();
    expect(screen.getByText('You scored 2 out of 2')).toBeInTheDocument();

    await waitFor(() => expect(recordQuizAttempt).toHaveBeenCalled());
    expect(recordQuizAttempt).toHaveBeenCalledWith('u1', expect.objectContaining({
      moduleId: '1.4',
      score: 2,
      maxScore: 2,
      passed: true,
    }));

    // U9: quizzes never gate — no "Continue" advance button at any score.
    expect(screen.queryByRole('button', { name: 'Continue to Next Sprint' })).not.toBeInTheDocument();
  });

  // U9 (R15/R16): a sub-100% finish is a FULL participation event — the attempt
  // is recorded with its real score, the copy is retake-friendly practice copy
  // (no "100% required" gate copy), and a restart is offered.
  test('a sub-100% run records passed:false, shows retake-friendly practice copy, and offers a restart', async () => {
    render(<Quiz moduleId="1.4" questions={questions} />);

    await answer('Public info', 'Next Question'); // wrong
    await answer('4', 'See Results'); // right → 1/2

    expect(screen.getByText('You scored 1 out of 2')).toBeInTheDocument();
    // The old gate copy is gone…
    expect(screen.queryByText(/require a 100% score/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue to Next Sprint' })).not.toBeInTheDocument();
    // …replaced by practice copy + a retake.
    expect(screen.getByText(/counts at any score/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restart Quiz' })).toBeInTheDocument();

    await waitFor(() => expect(recordQuizAttempt).toHaveBeenCalled());
    expect(recordQuizAttempt).toHaveBeenCalledWith('u1', expect.objectContaining({
      score: 1,
      maxScore: 2,
      passed: false,
    }));
  });

  // Retakes are always available (retake never un-completes — completion is
  // monotonic and owned by useProgress, not this component).
  test('a passing run also offers a restart (retake-friendly)', async () => {
    render(<Quiz moduleId="1.4" questions={questions} />);
    await answer('Personal info', 'Next Question');
    await answer('4', 'See Results');
    expect(screen.getByRole('button', { name: 'Restart Quiz' })).toBeInTheDocument();
  });

  // DATA-03 / FE-04 — the attempt is recorded exactly once per completed
  // run (a useRef guard makes it idempotent across StrictMode's double-invoked
  // effect and results re-renders).
  test('records exactly one attempt per run, even under StrictMode (DATA-03 / FE-04)', async () => {
    render(
      <StrictMode>
        <Quiz moduleId="1.4" questions={questions} />
      </StrictMode>,
    );
    await answer('Personal info', 'Next Question');
    await answer('4', 'See Results');
    await waitFor(() => expect(recordQuizAttempt).toHaveBeenCalled());
    expect(recordQuizAttempt).toHaveBeenCalledOnce();
  });
});

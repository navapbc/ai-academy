// @vitest-environment jsdom
import { StrictMode } from 'react';
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Quiz from './Quiz';
import type { QuizQuestion } from '../types';

// Component tests for the quiz — the module COMPLETION GATE. We mock auth (a
// signed-in user) and the progress data layer so nothing hits the network, and
// assert: options render, the score is computed, the 100%-to-pass gate holds,
// recordQuizAttempt is called, and onComplete fires ONLY on a passing run.
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
    render(<Quiz moduleId="1.4" questions={questions} onComplete={() => {}} />);
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
    render(<Quiz moduleId="1.4" questions={questions} onComplete={() => {}} />);
    const option = screen.getByRole('radio', { name: 'Personal info' });
    expect(option).toHaveAttribute('aria-checked', 'false');
    await user.click(option);
    expect(option).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('button', { name: 'Submit Answer' }));
    // Feedback is announced via a polite live region.
    expect(screen.getByRole('status')).toHaveTextContent(/Correct!/i);
  });

  test('returns null for an empty question set', () => {
    const { container } = render(<Quiz moduleId="1.4" questions={[]} onComplete={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('a perfect run passes, records a passing attempt, and fires onComplete', async () => {
    const onComplete = vi.fn();
    render(<Quiz moduleId="1.4" questions={questions} onComplete={onComplete} />);

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

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Continue to Next Sprint' }));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  // W2-3 / D8 / audit D-02: as an ungated concept check (gates=false, e.g. cell
  // 2.1 where the hands-on lab gates), a passing run is still recorded but shows
  // practice copy, offers NO advance button, and never fires onComplete.
  test('gates=false: a passing run records the attempt but is practice — no advance, no onComplete', async () => {
    const onComplete = vi.fn();
    render(<Quiz moduleId="2.1" questions={questions} onComplete={onComplete} gates={false} />);

    await answer('Personal info', 'Next Question');
    await answer('4', 'See Results');

    expect(screen.getByText('You scored 2 out of 2')).toBeInTheDocument();
    await waitFor(() => expect(recordQuizAttempt).toHaveBeenCalledWith('u1', expect.objectContaining({
      moduleId: '2.1', score: 2, maxScore: 2, passed: true,
    })));
    expect(screen.getByText(/Complete the hands-on lab above to finish/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue to Next Sprint' })).not.toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('a sub-100% run does NOT pass: no onComplete, records passed:false, offers a restart', async () => {
    const onComplete = vi.fn();
    render(<Quiz moduleId="1.4" questions={questions} onComplete={onComplete} />);

    await answer('Public info', 'Next Question'); // wrong
    await answer('4', 'See Results'); // right → 1/2, not a pass

    expect(screen.getByText('You scored 1 out of 2')).toBeInTheDocument();
    expect(screen.getByText(/require a 100% score/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue to Next Sprint' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restart Quiz' })).toBeInTheDocument();

    await waitFor(() => expect(recordQuizAttempt).toHaveBeenCalled());
    expect(recordQuizAttempt).toHaveBeenCalledWith('u1', expect.objectContaining({
      score: 1,
      maxScore: 2,
      passed: false,
    }));
    expect(onComplete).not.toHaveBeenCalled();
  });

  // DATA-03 / FE-04 — the attempt is now recorded exactly once per completed
  // run (a useRef guard makes it idempotent across StrictMode's double-invoked
  // effect and results re-renders).
  test('records exactly one attempt per run, even under StrictMode (DATA-03 / FE-04)', async () => {
    const onComplete = vi.fn();
    render(
      <StrictMode>
        <Quiz moduleId="1.4" questions={questions} onComplete={onComplete} />
      </StrictMode>,
    );
    await answer('Personal info', 'Next Question');
    await answer('4', 'See Results');
    await waitFor(() => expect(recordQuizAttempt).toHaveBeenCalled());
    expect(recordQuizAttempt).toHaveBeenCalledOnce();
  });
});

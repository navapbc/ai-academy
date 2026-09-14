// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import FailureShapeId from './FailureShapeId';
import type { FailureShapeIdConfig } from '../../types';

// failure-shape-id (Course 1, Weeks 6–7). The behaviour worth pinning is the one
// that justified a new kind: the revealed feedback is the one authored for the
// option the learner ACTUALLY picked, not the correct answer's rationale. The
// rest mirrors decision-scenario's contract — Submit-to-reveal, explicit retake,
// one recorded submission on finish, and no onComplete (never a completion gate).
const { recordLabSubmission } = vi.hoisted(() => ({ recordLabSubmission: vi.fn(async () => {}) }));
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../../lib/progress', () => ({ recordLabSubmission }));

beforeEach(() => recordLabSubmission.mockClear());

const SHAPES = [
  { id: 'eligibility', label: 'Wrong eligibility guidance', desc: 'States a benefit call as fact.' },
  { id: 'audit', label: 'Audit-failing artifacts', desc: 'Reads complete, has no decision trail.' },
];

const config: FailureShapeIdConfig = {
  kind: 'failure-shape-id',
  title: 'Find-the-Failure: delivery scenarios',
  introMd: 'Read each exchange and name the shape.',
  shapes: SHAPES,
  scenarios: [
    {
      id: 's1',
      exchangeMd: '**User:** Are they eligible?\n\n**AI:** Yes, they qualify.',
      prompt: 'Which failure shape is most likely present?',
      correct: 'eligibility',
      options: [
        { shapeId: 'eligibility', feedbackMd: 'Correct — an eligibility call stated as fact.' },
        { shapeId: 'audit', feedbackMd: 'Not quite — no record here needs to survive an audit.' },
      ],
    },
    {
      id: 's2',
      exchangeMd: '**User:** Write the decision record.\n\n**AI:** Option B aligns with best practices.',
      prompt: 'Which failure shape is most likely present?',
      correct: 'audit',
      options: [
        { shapeId: 'eligibility', feedbackMd: 'Not quite — no eligibility call is being made.' },
        { shapeId: 'audit', feedbackMd: 'Correct — no criteria, no data, nobody signed off.' },
      ],
    },
  ],
};

/** Reveal one scenario by picking `shapeLabel` in the card that owns `prompt`. */
async function answer(user: ReturnType<typeof userEvent.setup>, index: number, shapeLabel: string) {
  const card = screen.getByText(`Scenario ${index} of 2`).closest('div') as HTMLElement;
  await user.click(within(card).getByRole('radio', { name: shapeLabel }));
  await user.click(within(card).getByRole('button', { name: 'Check answer' }));
}

describe('FailureShapeId', () => {
  test('reveals the feedback authored for the option the learner picked, not the correct one', async () => {
    const user = userEvent.setup();
    render(<FailureShapeId config={config} labId="c1-w67-find-the-failure-delivery" />);

    // The exchange renders as markdown — the thing harm-rubric's plain-text
    // `text` could not do for a User:/AI: transcript.
    expect(screen.getAllByText('User:').every((el) => el.tagName === 'STRONG')).toBe(true);
    expect(screen.getByText('Read each exchange and name the shape.')).toBeInTheDocument();

    // Answer scenario 1 WRONG: the wrong option's own feedback shows, and the
    // correct answer's rationale does not leak in.
    await answer(user, 1, 'Audit-failing artifacts');
    expect(
      screen.getByText('Not quite — no record here needs to survive an audit.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Correct — an eligibility call stated as fact.'),
    ).not.toBeInTheDocument();
    // Correctness is not colour-only (D-20).
    expect(screen.getByText('Incorrect.')).toBeInTheDocument();
  });

  test('Check answer locks the pick until an explicit Try again reopens it', async () => {
    const user = userEvent.setup();
    render(<FailureShapeId config={config} labId="lab" />);

    await answer(user, 1, 'Audit-failing artifacts');
    const card = screen.getByText('Scenario 1 of 2').closest('div') as HTMLElement;

    // Revealed: options are disabled, so a stray click cannot mutate the answer.
    expect(within(card).getByRole('radio', { name: 'Wrong eligibility guidance' })).toBeDisabled();

    await user.click(within(card).getByRole('button', { name: /Try again/ }));
    expect(within(card).getByRole('button', { name: 'Check answer' })).toBeDisabled(); // pick cleared
    expect(
      screen.queryByText('Not quite — no record here needs to survive an audit.'),
    ).not.toBeInTheDocument();
  });

  test('finishing records ONE submission carrying the per-scenario answers and score', async () => {
    const user = userEvent.setup();
    render(<FailureShapeId config={config} labId="c1-w67-find-the-failure-delivery" />);

    // Finish stays disabled until every scenario has been checked.
    expect(screen.getByRole('button', { name: 'Finish activity' })).toBeDisabled();

    await answer(user, 1, 'Wrong eligibility guidance'); // correct
    expect(screen.getByRole('button', { name: 'Finish activity' })).toBeDisabled();
    await answer(user, 2, 'Wrong eligibility guidance'); // wrong

    await user.click(screen.getByRole('button', { name: 'Finish activity' }));

    await waitFor(() => expect(recordLabSubmission).toHaveBeenCalledTimes(1));
    expect(recordLabSubmission).toHaveBeenCalledWith('u1', {
      labId: 'c1-w67-find-the-failure-delivery',
      transcript: {
        kind: 'failure-shape-id',
        answers: [
          { id: 's1', picked: 'eligibility', correct: 'eligibility', correctness: true },
          { id: 's2', picked: 'eligibility', correct: 'audit', correctness: false },
        ],
        score: 1,
        maxScore: 2,
      },
      status: 'submitted',
    });
    expect(screen.getByText(/You named 1 of 2 failure shapes/)).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import FailureShapeId from './FailureShapeId';
import type { FailureShapeIdConfig } from '../../types';

// failure-shape-id (Course 1, Weeks 6–7). Two things are worth pinning:
//   1. the behaviour that justified a new kind — the revealed feedback is the
//      one authored for the option the learner ACTUALLY picked, not the correct
//      answer's rationale (harm-rubric's single `why` could not do this);
//   2. the decision-scenario-shaped flow it now shares with Weeks 3–4 — intro →
//      one scenario at a time → Submit-to-reveal → Continue → finished screen,
//      with ONE submission recorded on finish and no onComplete (never a gate).
const { recordLabSubmission } = vi.hoisted(() => ({ recordLabSubmission: vi.fn(async () => {}) }));
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../../lib/progress', () => ({ recordLabSubmission }));

beforeEach(() => recordLabSubmission.mockClear());

const config: FailureShapeIdConfig = {
  kind: 'failure-shape-id',
  title: 'Find-the-Failure: delivery scenarios',
  introMd: 'Read each exchange and name the shape.',
  shapes: [
    { id: 'eligibility', label: 'Wrong eligibility guidance', desc: 'States a benefit call as fact.' },
    { id: 'audit', label: 'Audit-failing artifacts', desc: 'Reads complete, has no decision trail.' },
  ],
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

const start = (u: ReturnType<typeof userEvent.setup>) =>
  u.click(screen.getByRole('button', { name: /Start the activity/ }));

/** Pick `label` on the scenario currently on screen and reveal its feedback. */
const answerWith = async (u: ReturnType<typeof userEvent.setup>, label: RegExp) => {
  await u.click(screen.getByRole('radio', { name: label }));
  await u.click(screen.getByRole('button', { name: 'Submit' }));
};

describe('FailureShapeId', () => {
  test('reveals the feedback authored for the option the learner picked, not the correct one', async () => {
    const u = userEvent.setup();
    render(<FailureShapeId config={config} labId="c1-w67-find-the-failure-delivery" />);
    await start(u);

    // Answer scenario 1 WRONG: the wrong option's own feedback shows, and the
    // correct answer's rationale does not leak in.
    await answerWith(u, /Audit-failing artifacts/);
    expect(
      screen.getByText('Not quite — no record here needs to survive an audit.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Correct — an eligibility call stated as fact.'),
    ).not.toBeInTheDocument();
    // Correctness is not colour-only (D-20).
    expect(screen.getByText('Incorrect.')).toBeInTheDocument();
  });

  test('walks one scenario at a time: intro gates the first, reveal gates Continue', async () => {
    const u = userEvent.setup();
    render(<FailureShapeId config={config} labId="lab" />);

    // Intro screen first — no scenario mounted yet.
    expect(screen.queryByText('Scenario 1 of 2')).not.toBeInTheDocument();
    await start(u);

    expect(screen.getByText('Scenario 1 of 2')).toBeInTheDocument();
    expect(screen.queryByText('Scenario 2 of 2')).not.toBeInTheDocument();

    // Continue is gated on revealing, not merely picking.
    expect(screen.getByRole('button', { name: /Continue/ })).toBeDisabled();
    await u.click(screen.getByRole('radio', { name: /Wrong eligibility guidance/ }));
    expect(screen.getByRole('button', { name: /Continue/ })).toBeDisabled();

    await u.click(screen.getByRole('button', { name: 'Submit' }));
    expect(screen.getByRole('button', { name: /Continue/ })).toBeEnabled();
    await u.click(screen.getByRole('button', { name: /Continue/ }));
    expect(screen.getByText('Scenario 2 of 2')).toBeInTheDocument();
  });

  test('Submit locks the pick until an explicit Try again reopens it', async () => {
    const u = userEvent.setup();
    render(<FailureShapeId config={config} labId="lab" />);
    await start(u);
    await answerWith(u, /Audit-failing artifacts/);

    // Revealed: options are disabled, so a stray click cannot mutate the answer.
    expect(screen.getByRole('radio', { name: /Wrong eligibility guidance/ })).toBeDisabled();

    await u.click(screen.getByRole('button', { name: /Try again/ }));
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled(); // pick cleared
    expect(
      screen.queryByText('Not quite — no record here needs to survive an audit.'),
    ).not.toBeInTheDocument();
  });

  test('finishing records ONE submission and shows the read-only read-through', async () => {
    const u = userEvent.setup();
    render(<FailureShapeId config={config} labId="c1-w67-find-the-failure-delivery" />);
    await start(u);

    await answerWith(u, /Wrong eligibility guidance/); // s1 correct
    await u.click(screen.getByRole('button', { name: /Continue/ }));
    await answerWith(u, /Wrong eligibility guidance/); // s2 wrong
    await u.click(screen.getByRole('button', { name: /Finish/ }));

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

    // The read-through lists BOTH scenarios and is read-only: no per-scenario
    // Try again survives into the finished screen, so a retake cannot reopen a
    // recorded run and append a second submission. "Start over" is the reset.
    expect(screen.getByText('Scenario 1 of 2')).toBeInTheDocument();
    expect(screen.getByText('Scenario 2 of 2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Try again/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start over/ })).toBeInTheDocument();
  });

  test('Start over clears the run and returns to the first scenario', async () => {
    const u = userEvent.setup();
    render(<FailureShapeId config={config} labId="lab" />);
    await start(u);
    await answerWith(u, /Wrong eligibility guidance/);
    await u.click(screen.getByRole('button', { name: /Continue/ }));
    await answerWith(u, /Audit-failing artifacts/);
    await u.click(screen.getByRole('button', { name: /Finish/ }));
    await waitFor(() => expect(recordLabSubmission).toHaveBeenCalledTimes(1));

    await u.click(screen.getByRole('button', { name: /Start over/ }));
    expect(screen.getByText('Scenario 1 of 2')).toBeInTheDocument();
    expect(screen.queryByText(/You named/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled(); // picks cleared
    expect(recordLabSubmission).toHaveBeenCalledTimes(1); // the reset records nothing
  });
});

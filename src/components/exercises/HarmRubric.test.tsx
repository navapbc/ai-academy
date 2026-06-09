// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import HarmRubric from './HarmRubric';
import type { HarmRubricConfig } from '../../types';

// The 1.12 harm-rubric exercise: name the civic-tech harm pattern for each
// scenario, graded in place. It records a lab_submissions row but is NOT the
// completion gate (the inline quiz is). These tests cover the a11y fix D-20:
// per-scenario correctness must not be conveyed by colour + icon alone — each
// graded item carries sr-only "Correct."/"Incorrect." text and the decorative
// check/cross icon is hidden from assistive tech.
const { recordLabSubmission } = vi.hoisted(() => ({
  recordLabSubmission: vi.fn(async () => 'sub-1'),
}));
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../../lib/progress', () => ({ recordLabSubmission }));

beforeEach(() => {
  recordLabSubmission.mockClear();
});

const config: HarmRubricConfig = {
  kind: 'harm-rubric',
  patterns: [
    { id: 'opacity', label: 'Opacity', desc: 'No way to see how a decision was made.' },
    { id: 'exclusion', label: 'Exclusion', desc: 'A group is shut out of the service.' },
  ],
  scenarios: [
    { id: 's1', text: 'The portal denies claims with no stated reason.', correct: 'opacity', why: 'Applicants cannot see why.' },
    { id: 's2', text: 'The form only works in English.', correct: 'exclusion', why: 'Non-English speakers are shut out.' },
  ],
};

function answer(scenarioText: RegExp, patternLabel: string) {
  const card = screen.getByText(scenarioText).closest('div')!;
  fireEvent.click(within(card).getByRole('button', { name: patternLabel }));
}

describe('HarmRubric — a11y (D-20)', () => {
  test('graded feedback conveys correctness as text (sr-only), not colour/icon alone', async () => {
    render(<HarmRubric config={config} labId="1.12" />);

    // Answer one correctly and one incorrectly.
    answer(/portal denies claims/, 'Opacity'); // correct
    answer(/only works in English/, 'Opacity'); // wrong (should be Exclusion)
    fireEvent.click(screen.getByRole('button', { name: /Submit answers/i }));

    // The score summary (already a live region) announces the total.
    await waitFor(() => expect(screen.getByText(/You scored 1 \/ 2/)).toBeInTheDocument());

    // Each item's correctness is now available as text, not just green/red + icon.
    expect(screen.getByText('Correct.')).toBeInTheDocument();
    expect(screen.getByText('Incorrect.')).toBeInTheDocument();
  });

  test('the decorative check/cross icon is hidden from assistive tech', async () => {
    const { container } = render(<HarmRubric config={config} labId="1.12" />);
    answer(/portal denies claims/, 'Opacity');
    answer(/only works in English/, 'Exclusion');
    fireEvent.click(screen.getByRole('button', { name: /Submit answers/i }));
    await waitFor(() => expect(screen.getByText(/You scored 2 \/ 2/)).toBeInTheDocument());

    // The icon wrappers are aria-hidden so SR users hear the sr-only text, not a
    // meaningless graphic. Both graded items contribute one hidden icon each.
    const hidden = container.querySelectorAll('[aria-hidden="true"]');
    expect(hidden.length).toBeGreaterThanOrEqual(2);
  });
});

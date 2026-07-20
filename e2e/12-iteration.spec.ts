import { test, expect } from '@playwright/test';
import { signInAsDemo, openModule, stubClaude, stubGrade } from './helpers';

// Cell 2.4 ("Iteration as the literate behavior") renders the iteration lab (P4.5c)
// after the lesson: conduct a real MULTI-TURN refinement conversation with Claude
// toward a constrained goal (a plain-language benefits overpayment notice), each turn
// sending the growing messages[] array via streamChat, then submit the whole
// conversation for an anchor-scored verdict in place. We STUB BOTH the chat Edge
// Function (the per-turn replies) AND the grade Edge Function (the judge) — no real
// key. The stubClaude route returns the same canned body for EVERY chat call, so it
// transparently serves the multiple sequential turns. Nothing is gated (restructure
// U2), so 2.4 opens directly. The judge scores the QUALITY OF THE LEARNER'S ITERATION, not
// the model output. The iteration lab is graded PRACTICE — it must NOT gate
// completion, so we also confirm the inline quiz is still present as the gate. Reuses
// streamChat + the #48 judge stub + GradeResultCard.
const REPLY = 'DRAFT: You were overpaid $1,248.00 for January–April 2026. You have 30 days from 2026-09-12 to respond. You can repay, set up a payment plan, or request a waiver or appeal.';

test('the 2.4 iteration lab runs a multi-turn conversation, grades the learner iteration in place, and does not gate completion', async ({ page }) => {
  await stubClaude(page, REPLY);
  await stubGrade(page, {
    perAnchor: [
      { id: 'specific-targeted', label: 'Refinements are specific and targeted', score: 2, max: 2, rationale: 'Named the dropped deadline.' },
      { id: 'builds-across-turns', label: 'Builds across turns', score: 2, max: 2, rationale: 'Carried the draft forward.' },
      { id: 'stress-tests', label: 'At least one turn stress-tests or catches a weakness', score: 1, max: 2, rationale: 'Asked for a self-critique.' },
      { id: 'reaches-goal', label: 'Reaches the goal and recognizes "done"', score: 2, max: 2, rationale: 'Kept the figure and deadline.' },
    ],
    overall: 7,
    maxOverall: 8,
  });

  await signInAsDemo(page);

  await openModule(page, '2.4');
  const lab = page.locator('#iteration-lab');
  await expect(lab).toBeVisible();
  // The goal + the starter hint are shown.
  await expect(lab.getByText(/Notice of Overpayment/)).toBeVisible();

  // Take three focused steering turns. Each waits until that turn's reply has landed
  // (the canned reply count == the turn number), so we never send mid-stream.
  const input = lab.getByLabel('Your message to Claude');
  const replies = lab.getByText(/^DRAFT:/);
  const turns = [
    'Rewrite this overpayment notice in plain language for the person who received it.',
    'You dropped the 30-day deadline — add the response deadline (within 30 days of 2026-09-12) as the first line, and keep the $1,248.00 figure exactly.',
    'Good. Now bring it to a sixth-grade reading level under 150 words, then critique your own draft for anything a stressed reader might misread.',
  ];
  for (let i = 0; i < turns.length; i++) {
    await input.fill(turns[i]);
    await lab.getByRole('button', { name: /^Send$/ }).click();
    await expect(replies).toHaveCount(i + 1, { timeout: 15_000 });
  }

  // Three turns reached minTurns — submit the iteration for grading.
  const submit = lab.getByRole('button', { name: /Submit iteration for grading/i });
  await expect(submit).toBeEnabled();
  await submit.click();

  // The anchor-scored result renders in place (grade is stubbed).
  await expect(lab.locator('#grade-result')).toBeVisible({ timeout: 15_000 });
  await expect(lab.getByText('Anchor-scored feedback')).toBeVisible();
  await expect(lab.getByText('7 / 8')).toBeVisible();

  // The iteration lab did NOT complete the module — the inline quiz is still the gate.
  await expect(page.locator('#module-quiz')).toBeVisible();
});

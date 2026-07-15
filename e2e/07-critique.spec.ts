import { test, expect } from '@playwright/test';
import { signInAsDemo, openModule, stubGrade } from './helpers';

// Cell 2.2 renders the critique exercise (P4.3b) after the lesson: read a
// polished AI artifact, write a critique, get an anchor-scored grade in place.
// We STUB the `grade` Edge Function (no real key). Nothing is gated (restructure
// U2), so 2.2 opens directly. The critique is graded PRACTICE — it must NOT gate
// completion, so we also confirm the inline quiz is still present as the gate.
test('the 2.2 critique exercise grades in place and does not gate completion', async ({ page }) => {
  await stubGrade(page, {
    perAnchor: [
      { id: 'flag-citation-verify', label: 'Verify the citation', score: 2, max: 2, rationale: 'Flagged the cite to confirm.' },
      { id: 'flag-unverifiable-numbers', label: 'Catch unverifiable claims', score: 2, max: 2, rationale: 'Caught the date and stat.' },
      { id: 'distinguish-verifiable', label: "Don't blanket-reject", score: 1, max: 2, rationale: 'Mostly distinguished.' },
      { id: 'name-verification-step', label: 'Name a concrete check', score: 2, max: 2, rationale: 'Named eCFR lookup.' },
    ],
    overall: 7,
    maxOverall: 8,
  });

  await signInAsDemo(page);

  await openModule(page, '2.2');
  const critique = page.locator('#critique');
  await expect(critique).toBeVisible();
  // The polished artifact is rendered for review.
  await expect(critique.getByText('AI-generated eligibility summary')).toBeVisible();

  // Write a critique past the soft word floor (>= 40 words).
  await critique.getByLabel('Your critique').fill(
    'The citation to 7 CFR 273.10 should be confirmed against the primary source rather than ' +
      'trusted on sight, and the March 2025 effective date, the $224 deduction figure, and the ' +
      '88% enrollment statistic cannot be verified from this document alone. The income-versus ' +
      'poverty-line math is checkable against the case file, so I would keep that and open eCFR ' +
      'and request the data source before forwarding anything.',
  );
  await critique.getByRole('button', { name: /Save critique/i }).click();

  // The anchor-scored result renders in place.
  await expect(critique.locator('#grade-result')).toBeVisible({ timeout: 15_000 });
  await expect(critique.getByText('Anchor-scored feedback')).toBeVisible();
  await expect(critique.getByText('7 / 8')).toBeVisible();

  // The critique did NOT complete the module — the inline quiz is still the gate.
  await expect(page.locator('#module-quiz')).toBeVisible();
});

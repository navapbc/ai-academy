import { test, expect } from '@playwright/test';
import { signInAsDemo, openModule, stubGrade } from './helpers';

// Cell 2.7 renders the synthesis exercise (P4.4a) after the lesson: read sourced
// interview notes, write a synthesis that keeps the minority voice, get an
// anchor-scored grade in place. We STUB the `grade` Edge Function (no real key).
// Nothing is gated (restructure U2), so 2.7 opens directly. The synthesis is graded
// PRACTICE — it must NOT gate completion, so we also confirm the inline quiz is
// still present as the gate. Reuses the #48 judge stub + GradeResultCard.
test('the 2.7 synthesis exercise grades in place and does not gate completion', async ({ page }) => {
  await stubGrade(page, {
    perAnchor: [
      { id: 'surface-minority-voice', label: 'Surface the dissenting voice', score: 2, max: 2, rationale: 'Kept P7 and P9.' },
      { id: 'honest-weighting', label: 'Weight the views honestly', score: 2, max: 2, rationale: 'Weighted ~8 of 10.' },
      { id: 'source-fidelity', label: 'Stay faithful to the source', score: 1, max: 2, rationale: 'No invented quotes.' },
      { id: 'flag-follow-up', label: 'Flag the gaps', score: 2, max: 2, rationale: 'Flagged the thin sample.' },
    ],
    overall: 7,
    maxOverall: 8,
  });

  await signInAsDemo(page);

  await openModule(page, '2.7');
  const synthesis = page.locator('#synthesis');
  await expect(synthesis).toBeVisible();
  // The source notes are rendered for synthesis.
  await expect(
    synthesis.getByText('User-research notes — online unemployment-claim flow (10 interviews)'),
  ).toBeVisible();

  // Write a synthesis past the soft word floor (>= 50 words) that keeps both
  // minority voices rather than flattening them into a tidy consensus.
  await synthesis.getByLabel('Your synthesis').fill(
    'Most of the ten participants completed the online claim quickly and found it clearer than ' +
      'the old phone line, but two reactions have to survive into the readout. One claimant on the ' +
      'public library wi-fi lost her entries when the session timed out and left without filing, ' +
      'and a gig 1099 worker had no way to enter self-employment income and is unsure his claim is ' +
      'accurate. I would flag both and note the small sample skews toward people who already had ' +
      'reliable devices and connectivity.',
  );
  await synthesis.getByRole('button', { name: /Save synthesis/i }).click();

  // The anchor-scored result renders in place.
  await expect(synthesis.locator('#grade-result')).toBeVisible({ timeout: 15_000 });
  await expect(synthesis.getByText('Anchor-scored feedback')).toBeVisible();
  await expect(synthesis.getByText('7 / 8')).toBeVisible();

  // The synthesis did NOT complete the module — the inline quiz is still the gate.
  await expect(page.locator('#module-quiz')).toBeVisible();
});

import { test, expect } from '@playwright/test';
import { signInAsDemo, openModule } from './helpers';

// Cell 1.4 renders the data-classifier exercise after the lesson. We answer the
// first item, submit, and confirm the graded result appears (a lab_submission
// is recorded for the signed-in user).
test('run the 1.4 data-classifier exercise end to end (submit + see result)', async ({ page }) => {
  await signInAsDemo(page);
  await openModule(page, '1.4');

  const exercise = page.locator('#data-classifier');
  await expect(exercise).toBeVisible();

  // Within each item card, choose the first data-class chip (rounded-full) and
  // the first tool option (rounded-xl) so submit becomes enabled.
  const items = exercise.locator('div.rounded-2xl.border-2');
  const count = await items.count();
  for (let i = 0; i < count; i++) {
    const item = items.nth(i);
    // Data-class chips (rounded-full) then tool buttons (rounded-xl).
    await item.locator('button.rounded-full').first().click();
    await item.locator('button.rounded-xl').first().click();
  }

  await exercise.getByRole('button', { name: 'Submit answers' }).click();
  await expect(exercise.getByText(/You scored \d+ \/ \d+/i)).toBeVisible();
  await expect(exercise.getByRole('button', { name: 'Try again' })).toBeVisible();
});

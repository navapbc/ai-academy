import { test, expect } from '@playwright/test';
import { signInAsDemo, openModule, passQuiz } from './helpers';

// Cell 1.6 is a Stage-1a content module with an inline quiz and no exercise —
// the cleanest quiz target. A passing run records a quiz_attempt; the best
// score badge then survives a reload (read back from Supabase).
const CELL = '1.6';

test('take a quiz, pass at 100%, and see the score persist across reload', async ({ page }) => {
  await signInAsDemo(page);
  await openModule(page, CELL);

  await passQuiz(page, CELL);
  // 100% → the pass path with the continue button.
  await expect(page.getByRole('button', { name: 'Continue to Next Sprint' })).toBeVisible();

  // Reload: the best-score read-back should resurface a passed badge for 1.6.
  await page.reload();
  await expect(page.locator('#sidebar')).toBeVisible();
  await openModule(page, CELL);
  await expect(page.getByText(/Best score \d+\/\d+ · Passed/i)).toBeVisible({ timeout: 15_000 });
});

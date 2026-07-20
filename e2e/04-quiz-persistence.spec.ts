import { test, expect } from '@playwright/test';
import { signInAsDemo, openModule, finishQuiz } from './helpers';

// Cell 1.6 is a content module with an inline quiz and no exercise — the
// cleanest quiz target. U9 (R15/R16): quizzes never gate. FINISHING a run at
// ANY score records the attempt, and that recorded attempt auto-completes the
// module through the data layer's participation seam (via='quiz') — without
// yanking the learner off the module. The best score badge and the completion
// survive a reload (read back from Supabase).
const QUIZ_CELL = '1.6';
// A module untouched by other specs, for the mark-explored path (via='explored').
const EXPLORE_CELL = '1.1';

test('finishing a quiz at ANY score completes the module; score + completion persist across reload', async ({
  page,
}) => {
  await signInAsDemo(page);
  await openModule(page, QUIZ_CELL);

  // U9 explored-affordance rule: while incomplete, EVERY module (including one
  // with an inline quiz) offers the footer "Mark as explored" button.
  await expect(page.locator('#mark-explored-button')).toBeVisible();

  // A deliberately sub-100% run: finishing is what counts, not the score.
  await finishQuiz(page, QUIZ_CELL, { missFirst: true });

  // No gate: the old "Continue to Next Sprint" button and 100%-required copy
  // are gone; the results screen is retake-friendly practice copy.
  await expect(page.getByRole('button', { name: 'Continue to Next Sprint' })).toHaveCount(0);
  await expect(page.getByText(/require a 100% score/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Restart Quiz' })).toBeVisible();

  // The recorded attempt auto-completed the module: the footer flips to the
  // static Completed state, and the learner stays on the module (no advance).
  await expect(page.locator('#module-completed')).toBeVisible();
  await expect(page.locator('#mark-explored-button')).toHaveCount(0);

  // Reload: the best-score read-back resurfaces the badge and the completion
  // persisted server-side.
  await page.reload();
  await expect(page.locator('#sidebar')).toBeVisible();
  await openModule(page, QUIZ_CELL);
  await expect(page.getByText(/Best score \d+\/\d+/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#module-completed')).toBeVisible();
});

test('a module completes via the one-way footer "Mark as explored" button', async ({ page }) => {
  await signInAsDemo(page);
  await openModule(page, EXPLORE_CELL);

  await expect(page.locator('#mark-explored-button')).toBeVisible();
  await page.locator('#mark-explored-button').click();

  // An explicit completion advances the cursor, so re-open the module and
  // assert its footer now shows the static Completed state (one-way — the
  // button never comes back).
  await openModule(page, EXPLORE_CELL);
  await expect(page.locator('#module-completed')).toBeVisible();
  await expect(page.locator('#mark-explored-button')).toHaveCount(0);
});

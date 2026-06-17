import { test, expect } from '@playwright/test';
import { signInAsDemo } from './helpers';

// P5.3a — the learner self-view dashboard. Reuses owner RLS (a learner reads
// their own progress/quiz/lab rows); no Claude calls in this view.

test('a learner opens "My progress" and sees their own dashboard', async ({ page }) => {
  await signInAsDemo(page);

  await page.getByRole('button', { name: 'My progress' }).click();

  // Header + the read-only progress panels render from the learner's own data.
  await expect(page.getByRole('heading', { name: 'Your progress' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Module progress' })).toBeVisible();
  // The module table header is always present once the detail loads.
  await expect(page.getByRole('columnheader', { name: 'Best quiz' })).toBeVisible();
  // Summary cards.
  await expect(page.getByText('Completion', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your lab submissions' })).toBeVisible();
});

import { test, expect } from '@playwright/test';
import { signInAsDemo, openModule } from './helpers';

// Cell 1.8 renders the ungraded reflection capture (Stage 1b, never locked).
// Writing past the 50-word floor and submitting records a lab_submission and
// shows the saved confirmation.
test('the 1.8 reflection saves once past the word floor', async ({ page }) => {
  await signInAsDemo(page);
  await openModule(page, '1.8');

  const reflection = page.locator('#reflection-capture');
  await expect(reflection).toBeVisible();

  const submit = reflection.getByRole('button', { name: /Submit reflection/i });
  await expect(submit).toBeDisabled();

  // 60 words — clears the 50-word submit floor.
  const text = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
  await reflection.getByPlaceholder(/Write your reflection here/i).fill(text);

  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(reflection.getByText('Reflection saved')).toBeVisible({ timeout: 15_000 });
});

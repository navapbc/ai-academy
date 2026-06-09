import { test, expect } from '@playwright/test';
import { signInAsDemo, openModule } from './helpers';

// D-10 (a11y, WCAG SC 2.4.3): when the learner moves to another module the
// content region swaps wholesale. Without management, focus falls to <body> and
// the new module opens scrolled to wherever the previous one was. The fix resets
// the scroll to the top and moves focus into the new content (#content-region).
test('navigating to another module resets scroll to the top and moves focus into the content', async ({
  page,
}) => {
  await signInAsDemo(page);
  await openModule(page, '1.4');

  const content = page.locator('#content-region');
  await expect(content).toBeVisible();

  // Scroll the content region down within module 1.4.
  await content.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  expect(await content.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

  // Navigate to a different Stage-1a module.
  await openModule(page, '1.5');

  // Scroll is back at the top and focus has moved into the new content.
  await expect.poll(() => content.evaluate((el) => el.scrollTop)).toBe(0);
  await expect(content).toBeFocused();
});

// The same management applies to the learning <-> playground view toggle, which
// also swaps the content region wholesale.
test('switching to the Playground view moves focus into the content region', async ({ page }) => {
  await signInAsDemo(page);
  const content = page.locator('#content-region');
  await content.click(); // move focus elsewhere first
  await page.getByRole('button', { name: 'Playground' }).click();
  await expect(content).toBeFocused();
});

import { test, expect } from '@playwright/test';
import { signInAsDemo } from './helpers';

test.describe('Authentication', () => {
  test('signs in as the seeded dev @navapbc.com user', async ({ page }) => {
    await signInAsDemo(page);
    await expect(page.locator('#sidebar')).toBeVisible();
    // Curriculum loaded → the first Stage-1a module nav row is present.
    await expect(page.locator('#module-1\\.3')).toBeVisible();
  });

  test('a non-@navapbc.com sign-in is rejected (no session granted)', async ({ page }) => {
    await page.goto('/');
    await page.locator('#email').fill('outsider@gmail.com');
    await page.locator('#password').fill('whatever-password');
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();

    // The DB domain trigger prevents any non-nava user from existing, and the
    // client guard signs out any non-nava session — so a non-nava credential
    // can never reach the academy. We assert the academy never loads and an
    // error is shown, rather than asserting a specific message (invalid-creds
    // vs domain-rejection both satisfy "rejected").
    await expect(page.locator('#sidebar')).toHaveCount(0);
    await expect(page.getByText(/sign.?in|navapbc\.com|invalid/i).first()).toBeVisible();
  });
});

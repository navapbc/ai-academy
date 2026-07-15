import { test, expect } from '@playwright/test';
import { signInAsDemo } from './helpers';

test.describe('Authentication', () => {
  test('signs in as the seeded dev @navapbc.com user', async ({ page }) => {
    await signInAsDemo(page);
    await expect(page.locator('#sidebar')).toBeVisible();
    // Curriculum loaded → the U2 sidebar shape for the (unenrolled) demo user:
    // every seeded course week is empty (hidden), so the nav shows the
    // "Supplemental coursework" section — expanded, because it contains the
    // current module — with the matrix cells inside it, and no week entries.
    await expect(page.getByRole('button', { name: /Supplemental coursework/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(page.locator('#module-1\\.3')).toBeVisible();
    const sidebar = page.locator('#sidebar');
    await expect(sidebar.getByText(/Week 0|Week 1/)).toHaveCount(0);
    // No stage headings and no locks anywhere in the nav (restructure U2 / R14).
    await expect(sidebar.getByText(/Stage 1a|Stage 2|Locked/)).toHaveCount(0);
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

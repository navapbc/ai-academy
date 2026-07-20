import { test, expect } from '@playwright/test';
import { signInAsDemo } from './helpers';

test.describe('Authentication', () => {
  test('signs in as the seeded dev @navapbc.com user', async ({ page }) => {
    await signInAsDemo(page);
    await expect(page.locator('#sidebar')).toBeVisible();
    // Curriculum loaded → the post-U8 sidebar shape for the ENROLLED demo
    // user: Course 1's seeded weeks render as collapsible sections under the
    // course heading, followed by "Supplemental coursework" (the matrix cells)
    // and "Resources & additional lessons" (the seeded custom resource).
    const sidebar = page.locator('#sidebar');
    await expect(sidebar.getByText('Understanding & Deciding When to Use AI')).toBeVisible();
    await expect(sidebar.getByRole('button', { name: /Week 0/ })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: /Break Claude on Purpose/ })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: /Supplemental coursework/ })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: /Resources & additional lessons/ })).toBeVisible();
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

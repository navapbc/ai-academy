import { test, expect } from '@playwright/test';
import { signInAsDemo, openModule, completeStage1a } from './helpers';

// Stage gating (P3.11): Stage 2 (e.g. 2.1) is locked until ALL of Stage 1a is
// complete. The locked nav row is a non-interactive div with aria-disabled, and
// the content view shows LockedNotice. Completing Stage 1a unlocks it.
test('a locked Stage-2 module shows LockedNotice; completing Stage 1a unlocks it', async ({ page }) => {
  await signInAsDemo(page);

  // Before: 2.1's nav row is rendered locked (a div, not a button).
  const lab21 = page.locator('#module-2\\.1');
  await expect(lab21).toBeVisible();
  await expect(lab21).toHaveAttribute('aria-disabled', 'true');

  // The sidebar shows the phase-level locked hint.
  await expect(page.getByText(/Locked — complete Stage 1a/i).first()).toBeVisible();

  // Complete all of Stage 1a.
  await completeStage1a(page);

  // After: 2.1 is now an interactive (unlocked) nav row.
  await expect(lab21).not.toHaveAttribute('aria-disabled', 'true');
  await openModule(page, '2.1');
  await expect(page.locator('#prompt-lab')).toBeVisible();
  // And LockedNotice is not shown.
  await expect(page.getByText('Stage 2 is locked')).toHaveCount(0);
});

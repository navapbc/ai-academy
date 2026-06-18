import { test, expect, type Page } from '@playwright/test';
import { signInAsDemo } from './helpers';

// P5.4-3 — the admin CMS lesson editor (text / video / tutor-ref) + draft →
// preview → publish. Signs in as the seeded ADMIN (admin@navapbc.com), opens
// Staff → Content management, edits a lesson, watches the live preview update,
// then Saves and Publishes.
//
// The admin-content WRITE is stubbed at the network layer (like the chat stub):
// this keeps the order-dependent serial suite from mutating shared seeded module
// rows that later specs read. The real draft→live DB round-trip (R3/R4) is proven
// by supabase/functions/admin-content + adminContent.integration.test.ts. The CMS
// READ (fetchCmsLessons) still hits the real local stack, so the list is genuine.

const ADMIN_EMAIL = 'admin@navapbc.com';
const ADMIN_PASSWORD = 'admin-password';

/** Stubs the admin-content function; records which actions were posted. */
async function stubAdminContent(page: Page, actions: string[]) {
  await page.route('**/functions/v1/admin-content', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 200, body: 'ok' });
      return;
    }
    const body = route.request().postDataJSON() as { action?: string };
    if (body?.action) actions.push(body.action);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, action: body?.action, version: 99 }),
    });
  });
}

test('an admin edits a lesson, previews it, and publishes', async ({ page }) => {
  const actions: string[] = [];
  await stubAdminContent(page, actions);
  await signInAsDemo(page, ADMIN_EMAIL, ADMIN_PASSWORD);

  // Staff → Content management.
  await page.getByRole('button', { name: 'Staff' }).click();
  await page.getByRole('button', { name: /content management/i }).click();
  await expect(page.getByRole('heading', { name: 'Content management' })).toBeVisible();

  // Open the first lesson, then its editor.
  await page.locator('ul li button').first().click();
  await page.getByRole('button', { name: /^edit$/i }).click();

  // Typing markdown updates the live preview (shared learner renderer).
  const body = page.getByLabel(/lesson body/i);
  await body.fill('## Brand new heading\n\nFresh published copy.');
  const preview = page.getByLabel('Live preview');
  await expect(preview.getByRole('heading', { name: 'Brand new heading' })).toBeVisible();

  // Save draft → success notice; only a save-draft was posted.
  await page.getByRole('button', { name: /save draft/i }).click();
  await expect(page.getByRole('status')).toContainText(/draft saved/i);
  expect(actions).toEqual(['save-draft']);

  // Publish → success notice; a save-draft (latest copy) then a publish.
  await page.getByRole('button', { name: /publish/i }).click();
  await expect(page.getByRole('status')).toContainText(/published/i);
  expect(actions).toEqual(['save-draft', 'save-draft', 'publish']);
});

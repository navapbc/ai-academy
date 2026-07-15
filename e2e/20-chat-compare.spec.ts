import { test, expect } from '@playwright/test';
import { signInAsDemo, openModule, stubClaude } from './helpers';

// The chat-compare exercise (cohort-restructure U6): 1–4 side-by-side live
// Claude panes answering ONE shared learner prompt. Chat is stubbed at the
// network layer with stubClaude's PER-CALL sequential replies (U6 extension):
// panes start staggered in index order, so call 1 → pane 1's body, call 2 →
// pane 2's, etc. An `{ status, body }` entry fails exactly one call, driving
// the pane-local error + Retry path. Ungraded — no grade stub needed.
//
// TODO('enable in U8 when c1-w1 modules are seeded'): there is no seeded
// chat-compare module yet (Course 1 content lands in U8) and the e2e helpers
// have no service-role seeding pattern to create one per-spec. When U8 lands,
// point CELL_ID at the seeded 3-pane Week-1 module and flip each `test.skip`
// to `test` — the bodies below are complete and ready.
const CELL_ID = 'c1-w1-break-claude';

test.skip('the chat-compare lab streams all panes from one shared prompt and each pane keeps its own reply', async ({ page }) => {
  await stubClaude(page, [
    'Pane one says the policy allows 10 days.',
    'Pane two says the policy allows 30 days, guaranteed.',
    'Pane three says it depends on tenure.',
  ]);

  await signInAsDemo(page);
  await openModule(page, CELL_ID);

  const lab = page.locator('#chat-compare');
  await expect(lab).toBeVisible();

  // Pre-submit: labeled empty pane placeholders (no responses yet).
  await expect(lab.getByText('Send a prompt to see this response.').first()).toBeVisible();

  await lab.getByLabel('Your prompt for every pane').fill('How many PTO days do we get?');
  await lab.getByRole('button', { name: /Send prompt/i }).click();

  // Each pane renders ITS OWN sequential stub body (call order == pane order).
  await expect(lab.getByText(/Pane one says the policy allows 10 days/i)).toBeVisible({ timeout: 15_000 });
  await expect(lab.getByText(/Pane two says the policy allows 30 days/i)).toBeVisible({ timeout: 15_000 });
  await expect(lab.getByText(/Pane three says it depends on tenure/i)).toBeVisible({ timeout: 15_000 });

  // Ungraded: no grade result, and the run never completes the module for you.
  await expect(lab.getByRole('button', { name: /Ask again/i })).toBeVisible();
});

test.skip('a failed pane shows a local Retry that re-runs only that pane while siblings keep their output', async ({ page }) => {
  await stubClaude(page, [
    'Pane one answer.',
    { status: 500, body: JSON.stringify({ error: 'chat function unavailable' }) },
    'Pane three answer.',
    // Call 4 = the pane-2 Retry.
    'Pane two retry answer.',
  ]);

  await signInAsDemo(page);
  await openModule(page, CELL_ID);

  const lab = page.locator('#chat-compare');
  await expect(lab).toBeVisible();
  await lab.getByLabel('Your prompt for every pane').fill('How many PTO days do we get?');
  await lab.getByRole('button', { name: /Send prompt/i }).click();

  // Panes 1 and 3 complete; pane 2 shows its pane-local error + Retry.
  await expect(lab.getByText('Pane one answer.')).toBeVisible({ timeout: 15_000 });
  await expect(lab.getByText('Pane three answer.')).toBeVisible({ timeout: 15_000 });
  await expect(lab.getByText(/chat function unavailable/i)).toBeVisible({ timeout: 15_000 });

  // Retry re-runs ONLY the failed pane; the siblings' output stays put.
  await lab.getByRole('button', { name: /^Retry/ }).click();
  await expect(lab.getByText('Pane two retry answer.')).toBeVisible({ timeout: 15_000 });
  await expect(lab.getByText('Pane one answer.')).toBeVisible();
  await expect(lab.getByText('Pane three answer.')).toBeVisible();
  await expect(lab.getByText(/chat function unavailable/i)).not.toBeVisible();
});

test.skip('a suggested-prompt chip fills the input without submitting', async ({ page }) => {
  await stubClaude(page, 'Should never be requested by a chip click.');

  await signInAsDemo(page);
  await openModule(page, CELL_ID);

  const lab = page.locator('#chat-compare');
  await expect(lab).toBeVisible();

  // Watch for any chat call — a chip must never fire one.
  let chatCalled = false;
  page.on('request', (req) => {
    if (req.url().includes('/functions/v1/chat') && req.method() === 'POST') chatCalled = true;
  });

  // Click the first suggested-prompt chip (authored in the seeded config).
  const input = lab.getByLabel('Your prompt for every pane');
  await expect(input).toHaveValue('');
  const chip = lab.locator('button.rounded-full').first();
  const chipText = (await chip.textContent())?.trim() ?? '';
  expect(chipText.length).toBeGreaterThan(0);
  await chip.click();

  // The chip FILLED the textarea — and nothing was submitted.
  await expect(input).toHaveValue(chipText);
  await expect(lab.getByText('Send a prompt to see this response.').first()).toBeVisible();
  expect(chatCalled).toBe(false);
});

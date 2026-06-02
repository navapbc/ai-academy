import { test, expect } from '@playwright/test';
import { signInAsDemo, openModule, completeStage1a, stubClaude } from './helpers';

// The 2.1 prompt-construction lab calls Claude through the chat Edge Function.
// We STUB that call (no real key) and assert the lab renders the canned
// completion. 2.1 is Stage 2, so we first complete Stage 1a to unlock it.
test('the 2.1 prompt lab returns the stubbed Claude completion', async ({ page }) => {
  await stubClaude(page, 'STUBBED CLAUDE OUTPUT: a constraint-first prompt result.');
  await signInAsDemo(page);
  await completeStage1a(page);

  await openModule(page, '2.1');
  const lab = page.locator('#prompt-lab');
  await expect(lab).toBeVisible();

  await lab.getByPlaceholder(/Write your prompt here/i).fill(
    'You are a benefits caseworker assistant. Summarize SNAP eligibility in plain language, max 5 bullets.',
  );
  await lab.getByRole('button', { name: /Run prompt/i }).click();

  await expect(lab.getByText(/STUBBED CLAUDE OUTPUT/)).toBeVisible({ timeout: 15_000 });
  // After a run, the Save & complete affordance appears.
  await expect(lab.getByRole('button', { name: /Save & complete/i })).toBeVisible();
});

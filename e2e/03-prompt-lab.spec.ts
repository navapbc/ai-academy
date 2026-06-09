import { test, expect } from '@playwright/test';
import { signInAsDemo, openModule, completeStage1a, stubClaude, stubGrade } from './helpers';

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

// W2-3 / D8 / audit D-02: cell 2.1 is single-gated by the HANDS-ON LAB, not the
// inline quiz. This proves the lab completes the module end to end: run → save →
// LLM-judge (stubbed) → Continue marks 2.1 complete in the sidebar.
test('completing the 2.1 lab (run → save → grade → Continue) marks the module complete', async ({ page }) => {
  await stubClaude(page, 'STUBBED CLAUDE OUTPUT: a constraint-first prompt result.');
  await stubGrade(page, {
    perAnchor: [{ id: 'role-context', label: 'Role & context', score: 2, max: 2, rationale: 'Clear role + constraints.' }],
    overall: 2,
    maxOverall: 2,
  });
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

  await lab.getByRole('button', { name: /Save & complete/i }).click();
  // The judge runs (stubbed) and the anchor-scored card renders.
  await expect(lab.getByText('Anchor-scored feedback')).toBeVisible({ timeout: 15_000 });
  // The lab's own Continue button is the completion gate.
  await lab.getByRole('button', { name: /^Continue$/i }).click();

  // 2.1 now shows completed in the sidebar (the green check on its nav row).
  await expect(page.locator('[id="module-2.1"] .bg-nava-green')).toBeVisible();
});

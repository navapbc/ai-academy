import { test, expect } from '@playwright/test';
import { signInAsDemo, openModule } from './helpers';

// Cell 2.11 ("Personal AI use-case library + Diligence Statement") renders the
// portfolio instrument (P4.8) after the lesson: log where AI helps / doesn't,
// then write one high-stakes Diligence Statement across the 4D AI Fluency
// dimensions. It is captured (not LLM-graded) and is NOT the completion gate —
// the inline quiz still owns completion. Nothing is gated (restructure U2), so 2.11
// opens directly. No Claude/grade stub is needed (no model call).
test('the 2.11 use-case portfolio captures the library + 4D statement and does not gate completion', async ({ page }) => {
  await signInAsDemo(page);

  await openModule(page, '2.11');
  const portfolio = page.locator('#use-case-portfolio');
  await expect(portfolio).toBeVisible();

  // Save is gated until the portfolio is complete; the readiness line shows why.
  const save = page.getByRole('button', { name: /Save portfolio/i });
  await expect(save).toBeDisabled();
  await expect(portfolio.getByText(/Before you submit/i)).toBeVisible();

  // Entry 1 — a "Helps" use case (the default verdict).
  await portfolio.getByLabel('Use case 1: the task').fill('Summarize a benefits notice for a claimant');
  await portfolio.getByLabel('Use case 1: the prompt or approach').fill('Summarize at a 6th-grade level; keep every date and dollar amount.');
  await portfolio.getByLabel('Use case 1: the failure mode to watch').fill('It dropped an appeal deadline once — I now check dates against the source.');

  // Entry 2 — add it and mark it "Doesn't help".
  await portfolio.getByRole('button', { name: /Add a use case/i }).click();
  await portfolio.getByRole('button', { name: /Doesn’t help/i }).nth(1).click();
  await portfolio.getByLabel('Use case 2: the task').fill('Draft a final eligibility determination end to end');
  await portfolio.getByLabel('Use case 2: the prompt or approach').fill('Asked for a full determination from the case notes.');
  await portfolio.getByLabel('Use case 2: the failure mode to watch').fill('Invented a policy citation — too high-stakes to delegate the decision.');

  // Entry 3 — the seed requires at least 3 complete entries.
  await portfolio.getByRole('button', { name: /Add a use case/i }).click();
  await portfolio.getByLabel('Use case 3: the task').fill('Plain-language pass on an outreach email');
  await portfolio.getByLabel('Use case 3: the prompt or approach').fill('Rewrite at a 6th-grade level, keep one clear next step.');
  await portfolio.getByLabel('Use case 3: the failure mode to watch').fill('It softened a hard deadline — I restore exact dates.');

  // The 4D Diligence Statement — fill each dimension past the combined word floor.
  const para =
    'I delegated only the first draft to the model and kept the final eligibility decision and ' +
    'every factual check for myself, validating each figure and date against the source case record ' +
    'before anything was sent to the claimant or my lead.';
  for (const label of ['Delegation', 'Description', 'Discernment', 'Diligence']) {
    await portfolio.getByLabel(label).fill(para);
  }

  await expect(save).toBeEnabled();
  await save.click();

  // The portfolio is recorded…
  await expect(portfolio.getByText('Portfolio saved')).toBeVisible();
  // …and the inline quiz is still present as the real completion gate.
  await expect(page.locator('#module-quiz')).toBeVisible();
});

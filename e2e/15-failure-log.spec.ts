import { test, expect } from '@playwright/test';
import { signInAsDemo, openModule, completeStage1a } from './helpers';

// Cell 2.9 ("Recognizing AI failure modes specific to your work") renders the
// failure-log portfolio (P4.9) after the lesson: dated entries of how AI broke on
// the learner's work — the task, what went wrong, how they caught it, and the tell
// to watch next time. Captured (not LLM-graded) and NOT the completion gate — the
// inline quiz still owns completion. 2.9 is Stage 2, so we complete Stage 1a to
// unlock it. No Claude/grade stub is needed (no model call).
test('the 2.9 failure log captures dated entries and does not gate completion', async ({ page }) => {
  await signInAsDemo(page);
  await completeStage1a(page);

  await openModule(page, '2.9');
  const log = page.locator('#failure-log');
  await expect(log).toBeVisible();
  // 2.9 is seeded status='in_review', so the "draft — under review" badge shows
  // (W3-2/D10: modules.status is now real, end to end from the DB).
  await expect(page.getByText(/Draft — under review/i)).toBeVisible();

  // Save is gated until the floor of complete entries is met.
  const save = page.getByRole('button', { name: /Save failure log/i });
  await expect(save).toBeDisabled();
  await expect(log.getByText(/Before you submit/i)).toBeVisible();

  // The seed floor is 3 complete entries — fill three.
  const entries = [
    { d: '2026-03-14', task: 'Draft a renewal eligibility summary', err: 'Cited a regulation section that does not exist', caught: 'Looked the rule up before sending', tell: 'Oddly specific subsection number' },
    { d: '2026-03-18', task: 'Summarize a denial notice', err: 'Smoothed two contradictory facts into one sentence', caught: 'Compared against the source record', tell: 'Reads too clean for a messy case' },
    { d: '2026-03-22', task: 'Plain-language pass on an outreach email', err: 'Softened a hard appeal deadline', caught: 'Checked the date against the notice', tell: 'Vague timing words instead of a date' },
  ];
  for (let i = 0; i < entries.length; i++) {
    if (i > 0) await log.getByRole('button', { name: /Add an entry/i }).click();
    const e = entries[i];
    await page.locator(`#failure-${i}-date`).fill(e.d);
    await page.locator(`#failure-${i}-task`).fill(e.task);
    await page.locator(`#failure-${i}-error`).fill(e.err);
    await page.locator(`#failure-${i}-caught`).fill(e.caught);
    await page.locator(`#failure-${i}-tell`).fill(e.tell);
  }

  await expect(save).toBeEnabled();
  await save.click();

  await expect(log.getByText('Failure log saved')).toBeVisible();
  // The inline quiz is still present as the real completion gate.
  await expect(page.locator('#module-quiz')).toBeVisible();
});

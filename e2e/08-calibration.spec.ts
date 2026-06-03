import { test, expect } from '@playwright/test';
import { signInAsDemo, openModule, completeStage1a, SUPABASE_URL, ANON_KEY } from './helpers';

// Cell 2.8 renders the auto-graded calibration exercise after the lesson. The
// learner picks a verification posture for each output from the same tool; on
// submit it auto-grades against the answer key and shows an over-/under-reliance
// summary. No LLM call (deterministic), so no grade stub. 2.8 is Stage 2, so we
// complete Stage 1a first to unlock it. The exercise records a lab_submission
// but is NOT the completion gate — the inline quiz still owns completion.
test('run the 2.8 calibration end to end (set a posture per item, submit, see summary); quiz still gates', async ({ page }) => {
  await signInAsDemo(page);
  await completeStage1a(page);
  await openModule(page, '2.8');

  const exercise = page.locator('#calibration');
  await expect(exercise).toBeVisible();

  // Pull the seeded answer key so we can set the calibrated posture on each item
  // (asserting a full-calibration summary) — robust to content edits.
  const token = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
        return JSON.parse(localStorage.getItem(key)!).access_token as string;
      }
    }
    return '';
  });
  const rows = await page.evaluate(
    async ({ url, key, bearer }) => {
      const res = await fetch(`${url}/rest/v1/modules?select=lab_config_json&cell_id=eq.2.8`, {
        headers: { apikey: key, Authorization: `Bearer ${bearer}` },
      });
      return res.json();
    },
    { url: SUPABASE_URL, key: ANON_KEY, bearer: token },
  );
  const cfg = rows?.[0]?.lab_config_json as {
    scale: { id: string; label: string }[];
    items: { id: string; target: string }[];
  };
  expect(cfg?.items?.length).toBeGreaterThan(0);
  const labelOf = (id: string) => cfg.scale.find((s) => s.id === id)!.label;

  // One radiogroup per item, in item order; click the target posture's label.
  const groups = exercise.locator('[role="radiogroup"]');
  for (let i = 0; i < cfg.items.length; i++) {
    const targetLabel = labelOf(cfg.items[i].target);
    await groups.nth(i).getByRole('radio', { name: new RegExp(targetLabel) }).click();
  }

  await exercise.getByRole('button', { name: 'Submit answers' }).click();

  // Calibration summary appears with a full match and zero over/under.
  await expect(exercise.getByText(`Your calibration: ${cfg.items.length} of ${cfg.items.length} matched`)).toBeVisible();
  await expect(exercise.getByText(/Over-reliance · 0/)).toBeVisible();
  await expect(exercise.getByText(/Under-reliance · 0/)).toBeVisible();
  await expect(exercise.getByRole('button', { name: 'Try again' })).toBeVisible();

  // The inline quiz remains the completion gate: still present, and the audit
  // did not advance the learner past the cell.
  await expect(page.locator('#module-quiz')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to Next Sprint' })).toHaveCount(0);
});

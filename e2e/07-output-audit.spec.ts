import { test, expect } from '@playwright/test';
import { signInAsDemo, openModule, SUPABASE_URL, ANON_KEY } from './helpers';

// Cell 1.2 (Stage 1b, never locked) renders the auto-graded output-audit
// exercise after the lesson. The learner marks each claim Supported vs
// Fabricated/unverifiable; on submit it auto-grades against the answer key and
// reveals per-claim feedback. No LLM call (deterministic), so no grade stub.
// The exercise records a lab_submission but is NOT the completion gate — the
// inline quiz still owns completion.
test('run the 1.2 output-audit end to end (answer correctly, submit, see feedback); quiz still gates', async ({ page }) => {
  await signInAsDemo(page);
  await openModule(page, '1.2');

  const exercise = page.locator('#output-audit');
  await expect(exercise).toBeVisible();

  // Pull the seeded answer key so we can audit correctly by clicking the
  // verdict that matches each claim's status — robust to content edits.
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
      const res = await fetch(`${url}/rest/v1/modules?select=lab_config_json&cell_id=eq.1.2`, {
        headers: { apikey: key, Authorization: `Bearer ${bearer}` },
      });
      return res.json();
    },
    { url: SUPABASE_URL, key: ANON_KEY, bearer: token },
  );
  const claims: { id: string; status: 'supported' | 'fabricated' }[] =
    rows?.[0]?.lab_config_json?.claims ?? [];
  expect(claims.length).toBeGreaterThan(0);

  // Each claim card is a rounded-2xl border-2 block (the artifact uses a single
  // `border`, so it isn't matched); audit each in order.
  const cards = exercise.locator('div.rounded-2xl.border-2');
  for (let i = 0; i < claims.length; i++) {
    const label = claims[i].status === 'supported' ? /^Supported/ : /^Fabricated/;
    await cards.nth(i).getByRole('radio', { name: label }).click();
  }

  await exercise.getByRole('button', { name: 'Submit answers' }).click();

  // Full marks + per-claim feedback revealed.
  await expect(exercise.getByText(`You scored ${claims.length} / ${claims.length}`)).toBeVisible();
  await expect(exercise.getByRole('button', { name: 'Try again' })).toBeVisible();

  // The inline quiz remains the completion gate: it's still present and the
  // audit did not advance the learner past the cell.
  await expect(page.locator('#module-quiz')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to Next Sprint' })).toHaveCount(0);
});

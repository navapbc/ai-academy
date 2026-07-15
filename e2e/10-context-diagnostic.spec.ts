import { test, expect } from '@playwright/test';
import { signInAsDemo, openModule, SUPABASE_URL, ANON_KEY } from './helpers';

// Cell 2.5 ("Working with the context window") renders the auto-graded
// context-window diagnostic after the lesson. The learner picks the best
// diagnosis/remedy for each AI-session scenario; on submit it auto-grades
// against the seeded correctIndex and compiles a "quick reference" takeaway. No
// LLM call (deterministic single-select), so no grade stub. Nothing is gated
// (restructure U2), so 2.5 opens directly. It reuses the same ScenarioExercise
// component as 1.9/1.10 and records a lab_submission, but is NOT the completion
// gate — the inline quiz still owns completion.
test('run the 2.5 context-diagnostic end to end (pick the best fix per scenario, submit, see the quick reference); quiz still gates', async ({ page }) => {
  await signInAsDemo(page);
  await openModule(page, '2.5');

  const exercise = page.locator('#scenario-exercise');
  await expect(exercise).toBeVisible();

  // Pull the seeded config so we can click each item's correct option TEXT
  // (asserting a full-correct score) — robust to content edits and reordering.
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
      const res = await fetch(`${url}/rest/v1/modules?select=lab_config_json&cell_id=eq.2.5`, {
        headers: { apikey: key, Authorization: `Bearer ${bearer}` },
      });
      return res.json();
    },
    { url: SUPABASE_URL, key: ANON_KEY, bearer: token },
  );
  const cfg = rows?.[0]?.lab_config_json as {
    items: { options: string[]; correctIndex: number }[];
    takeaway: { title: string };
  };
  expect(cfg?.items?.length).toBeGreaterThan(0);

  // One radiogroup per item, in item order; click the correct option's text.
  const groups = exercise.locator('[role="radiogroup"]');
  for (let i = 0; i < cfg.items.length; i++) {
    const correctText = cfg.items[i].options[cfg.items[i].correctIndex];
    await groups.nth(i).getByRole('radio', { name: correctText, exact: true }).click();
  }

  await exercise.getByRole('button', { name: 'Submit answers' }).click();

  // Full-correct score, the keepable quick reference, and the retry affordance.
  await expect(exercise.getByText(`You scored ${cfg.items.length} / ${cfg.items.length}`)).toBeVisible();
  await expect(exercise.getByText(cfg.takeaway.title)).toBeVisible();
  await expect(exercise.getByRole('button', { name: 'Try again' })).toBeVisible();

  // U9: the recorded submission auto-completes the cell (via='lab') but never
  // moves the cursor — the inline practice quiz is still present and the
  // learner was not advanced past the cell.
  await expect(page.locator('#module-quiz')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to Next Sprint' })).toHaveCount(0);
});

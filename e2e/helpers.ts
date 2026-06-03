import { expect, type Page } from '@playwright/test';

// Shared E2E helpers. These run against a LOCAL Supabase stack (`supabase
// start`) + the Vite dev server (started by playwright.config.ts). The
// Claude/Anthropic call is stubbed at the network layer so no real key is used.

export const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';
export const ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

// The seeded local dev user (see supabase/seed.sql). @navapbc.com so it passes
// the domain trigger.
export const DEMO_EMAIL = 'demo@navapbc.com';
export const DEMO_PASSWORD = 'demo-password';

/** Signs in via the dev email/password form and waits for the academy to load. */
export async function signInAsDemo(page: Page, email = DEMO_EMAIL, password = DEMO_PASSWORD) {
  await page.goto('/');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  // The sidebar only renders once auth + curriculum have loaded.
  await expect(page.locator('#sidebar')).toBeVisible({ timeout: 15_000 });
}

/**
 * Intercepts the chat Edge Function and returns a canned PLAIN-TEXT body — the
 * same shape src/lib/llm.ts reads (the real function strips Anthropic's SSE and
 * streams text deltas). No ANTHROPIC_API_KEY needed.
 */
export async function stubClaude(page: Page, reply: string) {
  await page.route('**/functions/v1/chat', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 200, body: 'ok' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'text/plain; charset=utf-8',
      body: reply,
    });
  });
}

/**
 * Intercepts the `grade` Edge Function (LLM-as-judge) and returns a canned JSON
 * verdict — the shape src/lib/grading.ts reads ({ perAnchor, overall, maxOverall };
 * the client stamps grader:'llm'). No ANTHROPIC_API_KEY needed. Mirrors stubClaude.
 */
export async function stubGrade(
  page: Page,
  verdict: {
    perAnchor: { id: string; label: string; score: number; max: number; rationale: string }[];
    overall: number;
    maxOverall: number;
  },
) {
  await page.route('**/functions/v1/grade', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 200, body: 'ok' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(verdict),
    });
  });
}

/** Reads the supabase access token the app stored in localStorage after sign-in. */
async function accessToken(page: Page): Promise<string> {
  return page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const parsed = JSON.parse(localStorage.getItem(key)!);
        return parsed.access_token as string;
      }
    }
    return '';
  });
}

interface QuizQ {
  options: string[];
  correctIndex: number;
}

/**
 * Fetches a module's quiz (options + correctIndex) from the DB using the
 * signed-in session, so a spec can answer to 100% by clicking the correct
 * option TEXT — robust to content edits and question reordering.
 */
export async function fetchQuiz(page: Page, cellId: string): Promise<QuizQ[]> {
  const token = await accessToken(page);
  const rows = await page.evaluate(
    async ({ url, key, bearer, cell }) => {
      const res = await fetch(`${url}/rest/v1/modules?select=quiz_json&cell_id=eq.${cell}`, {
        headers: { apikey: key, Authorization: `Bearer ${bearer}` },
      });
      return res.json();
    },
    { url: SUPABASE_URL, key: ANON_KEY, bearer: token, cell: cellId },
  );
  return (rows?.[0]?.quiz_json ?? []) as QuizQ[];
}

/** Opens a module from the sidebar by cell id. */
export async function openModule(page: Page, cellId: string) {
  // Cell ids contain dots (e.g. "1.4"), so use an attribute selector rather
  // than a CSS #id selector (where the dot would be read as a class).
  await page.locator(`[id="module-${cellId}"]`).click();
}

/**
 * Drives the inline quiz of the currently-open module to a 100% pass by
 * clicking the correct option text for each question. Stops at the results
 * screen (does NOT click "Continue") so callers can assert on it.
 */
export async function passQuiz(page: Page, cellId: string) {
  const questions = await fetchQuiz(page, cellId);
  expect(questions.length).toBeGreaterThan(0);
  const quiz = page.locator('#module-quiz');
  await expect(quiz).toBeVisible();

  for (let i = 0; i < questions.length; i++) {
    const correctText = questions[i].options[questions[i].correctIndex];
    // Options are a radiogroup (A11Y-01) → role="radio". Only the current
    // question is in the DOM, so the option text is unique.
    await quiz.getByRole('radio', { name: correctText, exact: true }).click();
    await quiz.getByRole('button', { name: 'Submit Answer' }).click();
    const next = i + 1 < questions.length ? 'Next Question' : 'See Results';
    await quiz.getByRole('button', { name: next }).click();
  }
  await expect(page.getByText(/You scored \d+ out of \d+/i)).toBeVisible();
}

/** Opens a quiz-gated content module, passes its quiz, and clicks Continue. */
export async function completeQuizModule(page: Page, cellId: string) {
  await openModule(page, cellId);
  await passQuiz(page, cellId);
  await page.getByRole('button', { name: 'Continue to Next Sprint' }).click();
}

interface SorterScenario {
  id: string;
  correct: string;
}

const SORTER_LABEL: Record<string, string> = {
  delegate: 'Delegate',
  assist: 'Assist',
  'human-only': 'Human-only',
  refuse: 'Refuse',
};

/** Completes the 1.3 scenario sorter by assigning every scenario correctly. */
export async function completeSorter(page: Page, cellId: string) {
  await openModule(page, cellId);
  const token = await accessToken(page);
  const rows = await page.evaluate(
    async ({ url, key, bearer, cell }) => {
      const res = await fetch(
        `${url}/rest/v1/modules?select=sorter_config_json&cell_id=eq.${cell}`,
        { headers: { apikey: key, Authorization: `Bearer ${bearer}` } },
      );
      return res.json();
    },
    { url: SUPABASE_URL, key: ANON_KEY, bearer: token, cell: cellId },
  );
  const scenarios: SorterScenario[] = rows?.[0]?.sorter_config_json?.scenarios ?? [];
  expect(scenarios.length).toBeGreaterThan(0);

  const sorter = page.locator('#scenario-sorter');
  const cards = sorter.locator('div.rounded-2xl.border-2');
  for (let i = 0; i < scenarios.length; i++) {
    const label = SORTER_LABEL[scenarios[i].correct];
    await cards.nth(i).getByRole('button', { name: label, exact: true }).click();
  }
  await sorter.getByRole('button', { name: /Check answers/i }).click();
  await sorter.getByRole('button', { name: 'Continue' }).click();
}

/** Completes ALL of Stage 1a (the 7 cells) so Stage 2 unlocks. */
export async function completeStage1a(page: Page) {
  for (const cell of ['1.4', '1.5', '1.6', '1.9', '1.10', '1.13']) {
    await completeQuizModule(page, cell);
  }
  await completeSorter(page, '1.3');
}

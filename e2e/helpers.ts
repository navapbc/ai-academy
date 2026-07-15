import { expect, type Page } from '@playwright/test';

// Shared E2E helpers. These run against a LOCAL Supabase stack (`supabase
// start`) + the Vite dev server (started by playwright.config.ts). The
// Claude/Anthropic call is stubbed at the network layer so no real key is used.

export const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';
export const ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

// The seeded local dev user (see supabase/seed.sql). @navapbc.com so it passes
// the domain trigger. Enrolled in the seeded Demo Cohort, so it has program
// access (sees visibility='program' modules — cohort-restructure U4).
export const DEMO_EMAIL = 'demo@navapbc.com';
export const DEMO_PASSWORD = 'demo-password';

// Second seeded user (supabase/seed.sql) with a profiles row and deliberately
// NO enrollments (cohort-restructure U4). The enrollment-visibility spec
// (lands with U8, once program content exists) signs in as this user to prove
// program-visibility modules never reach an unenrolled browser, while the
// enrolled DEMO_EMAIL user sees them. Sign in via
// `signInAsDemo(page, UNENROLLED_EMAIL, UNENROLLED_PASSWORD)`.
export const UNENROLLED_EMAIL = 'demo-unenrolled@navapbc.com';
export const UNENROLLED_PASSWORD = 'demo-password';

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
 * One canned chat response: a plain-text success body (a string), or an
 * explicit status + JSON body (to simulate a per-call failure — the client
 * reads `{ error }` from non-2xx responses).
 */
export type StubChatReply = string | { status: number; body: string };

/**
 * Intercepts the chat Edge Function and returns a canned PLAIN-TEXT body — the
 * same shape src/lib/llm.ts reads (the real function strips Anthropic's SSE and
 * streams text deltas). No ANTHROPIC_API_KEY needed.
 *
 * Pass a single string to answer EVERY call with the same body (the original
 * behavior — existing single-call specs are unaffected). Pass an ARRAY for
 * per-call sequential responses (restructure U6's chat-compare fans out one
 * call per pane): call 1 gets replies[0], call 2 replies[1], …; calls beyond
 * the array repeat the last entry. An `{ status, body }` entry fulfills that
 * one call with a non-2xx JSON error (pane-local failure).
 */
export async function stubClaude(page: Page, reply: StubChatReply | StubChatReply[]) {
  const replies: StubChatReply[] = Array.isArray(reply) ? reply : [reply];
  let call = 0;
  await page.route('**/functions/v1/chat', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 200, body: 'ok' });
      return;
    }
    const r = replies[Math.min(call, replies.length - 1)];
    call += 1;
    if (typeof r === 'string') {
      await route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        body: r,
      });
    } else {
      await route.fulfill({
        status: r.status,
        contentType: 'application/json',
        body: r.body,
      });
    }
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
  const row = page.locator(`[id="module-${cellId}"]`);
  // Sidebar sections start collapsed unless they contain the current module
  // (U2 UX), and post-U8 the cursor can start inside a course week — so the
  // target row may not be in the DOM yet. Expand collapsed sections (week /
  // supplemental / resources headers are the only aria-expanded buttons in
  // the sidebar) until the row exists; expansion never collapses others.
  const collapsed = page.locator('#sidebar [aria-expanded="false"]');
  while ((await row.count()) === 0 && (await collapsed.count()) > 0) {
    await collapsed.first().click();
  }
  await row.click();
}

/**
 * Drives the inline quiz of the currently-open module to the results screen by
 * answering every question (U9: FINISHING at any score is what counts — the
 * recorded attempt auto-completes the module via the participation seam).
 * `missFirst` answers the first question wrong (a deliberate sub-100% run);
 * otherwise every answer is correct. Stops at the results screen so callers
 * can assert on it.
 */
export async function finishQuiz(
  page: Page,
  cellId: string,
  opts: { missFirst?: boolean } = {},
) {
  const questions = await fetchQuiz(page, cellId);
  expect(questions.length).toBeGreaterThan(0);
  const quiz = page.locator('#module-quiz');
  await expect(quiz).toBeVisible();

  for (let i = 0; i < questions.length; i++) {
    const { options, correctIndex } = questions[i];
    const pickIndex =
      opts.missFirst && i === 0 ? (correctIndex + 1) % options.length : correctIndex;
    // Options are a radiogroup (A11Y-01) → role="radio". Only the current
    // question is in the DOM, so the option text is unique.
    await quiz.getByRole('radio', { name: options[pickIndex], exact: true }).click();
    await quiz.getByRole('button', { name: 'Submit Answer' }).click();
    const next = i + 1 < questions.length ? 'Next Question' : 'See Results';
    await quiz.getByRole('button', { name: next }).click();
  }
  await expect(page.getByText(/You scored \d+ out of \d+/i)).toBeVisible();
}

/** Finishes the inline quiz at a 100% score. */
export async function passQuiz(page: Page, cellId: string) {
  await finishQuiz(page, cellId);
}

/**
 * Opens a content module with an inline quiz and finishes the quiz. Under U9
 * the recorded attempt itself completes the module (quizzes never gate) —
 * there is no Continue button to click.
 */
export async function completeQuizModule(page: Page, cellId: string) {
  await openModule(page, cellId);
  await passQuiz(page, cellId);
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

// NOTE (restructure U2): the former `completeStage1a` unlock helper is gone —
// stage gating is behaviorally off, so every module (including the old Stage-2
// cells) is directly openable. Specs open their target module without any
// unlock preamble. `completeQuizModule` / `completeSorter` above remain as
// generic completion drivers.

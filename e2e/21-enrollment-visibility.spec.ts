import { test, expect } from '@playwright/test';
import { signInAsDemo, openModule, UNENROLLED_EMAIL, UNENROLLED_PASSWORD } from './helpers';

// Enrollment-based visibility, end to end in a real browser (cohort-restructure
// U8, proving the U4 RLS flip against the LITERAL seeded Course 1 content):
//
//   - demo-unenrolled@navapbc.com (seeded with NO enrollments) sees Week 0
//     inside Course 1 — the R8 "getting started" exemption — plus Supplemental
//     coursework and Resources & additional lessons, and NO Week 1 / Week 2 /
//     Weeks 3–4 content: those rows never reach the wire, so their sections
//     never render.
//   - demo@navapbc.com (enrolled in the seeded Demo Cohort) sees every seeded
//     week with its modules.
//
// Read-only spec: it opens modules but completes nothing, so it is safe at any
// position in the serial suite (runs last by filename order).

test('an unenrolled user sees only Week 0 inside Course 1, plus Supplemental and Resources', async ({ page }) => {
  await signInAsDemo(page, UNENROLLED_EMAIL, UNENROLLED_PASSWORD);
  const sidebar = page.locator('#sidebar');

  // Course 1 renders (it contains a public member) with exactly its Week 0.
  await expect(sidebar.getByText('Understanding & Deciding When to Use AI')).toBeVisible();
  await expect(sidebar.getByRole('button', { name: /Week 0/ })).toBeVisible();

  // The program weeks are absent entirely — no headers, no module rows.
  await expect(sidebar.getByRole('button', { name: /Break Claude on Purpose/ })).toHaveCount(0);
  await expect(sidebar.getByRole('button', { name: /Ground & Scope for Improvement/ })).toHaveCount(0);
  await expect(sidebar.getByRole('button', { name: /Pod Activities/ })).toHaveCount(0);
  for (const cell of [
    'c1-w1-same-prompt-3x',
    'c1-w1-confidently-wrong',
    'c1-w2-ground-and-scope',
    'c1-w34-pod-kickoff',
    'c1-w34-walk-the-workflow-delivery',
    'c1-w34-walk-the-workflow-general',
    'c1-w34-scavenger-hunt',
  ]) {
    await expect(page.locator(`[id="module-${cell}"]`)).toHaveCount(0);
  }

  // Supplemental (matrix cells) + Resources (the seeded custom lesson) stay
  // open to everyone.
  await expect(sidebar.getByRole('button', { name: /Supplemental coursework/ })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: /Resources & additional lessons/ })).toBeVisible();

  // And the Week 0 module actually opens and renders for this user.
  await openModule(page, 'c1-w0-claude-setup');
  await expect(page.getByRole('heading', { name: 'Claude Set-up' })).toBeVisible();
  await expect(page.getByText('no separate password to manage')).toBeVisible();

  // The custom resource lesson opens too (Resources group, R13). The content
  // pane doesn't render module titles as headings, so assert on the lesson's
  // own body headings/text.
  await openModule(page, 'custom-ai-support-at-nava');
  await expect(page.getByRole('heading', { name: 'AI Slack channels' })).toBeVisible();
  await expect(page.getByText('live troubleshooting beats guessing')).toBeVisible();
});

test('the enrolled demo user sees every seeded week and its modules', async ({ page }) => {
  await signInAsDemo(page);
  const sidebar = page.locator('#sidebar');

  // All four content-bearing weeks render (Weeks 5+ are empty shells and stay
  // hidden from learners until they hold a published member). `.first()`
  // tolerates a module row sharing its week's title when a section happens to
  // start expanded.
  await expect(sidebar.getByRole('button', { name: /Week 0/ }).first()).toBeVisible();
  await expect(sidebar.getByRole('button', { name: /Break Claude on Purpose/ }).first()).toBeVisible();
  await expect(sidebar.getByRole('button', { name: /Ground & Scope for Improvement/ }).first()).toBeVisible();
  await expect(sidebar.getByRole('button', { name: /Pod Activities/ }).first()).toBeVisible();

  // Weeks 3–4 hold all four pod activities (expand via the header — only if
  // it isn't already open; clicking an expanded header would collapse it).
  const podHeader = sidebar.getByRole('button', { name: /Pod Activities/ }).first();
  if ((await podHeader.getAttribute('aria-expanded')) === 'false') {
    await podHeader.click();
  }
  for (const cell of [
    'c1-w34-pod-kickoff',
    'c1-w34-walk-the-workflow-delivery',
    'c1-w34-walk-the-workflow-general',
    'c1-w34-scavenger-hunt',
  ]) {
    await expect(page.locator(`[id="module-${cell}"]`)).toBeVisible();
  }

  // The Week 2 chat-compare module renders its two seeded panes live.
  await openModule(page, 'c1-w2-ground-and-scope');
  const lab = page.locator('#chat-compare');
  await expect(lab).toBeVisible();
  await expect(lab.getByText('Without source material')).toBeVisible();
  await expect(lab.getByText('With source material')).toBeVisible();

  // The Marina decision scenario renders from its seeded config: intro first,
  // then "Start the scenario" gates the first checkpoint.
  await openModule(page, 'c1-w34-walk-the-workflow-delivery');
  const scenario = page.locator('#decision-scenario');
  await expect(scenario).toBeVisible();
  await expect(scenario.getByText(/Marina is a content strategist/)).toBeVisible();
  await scenario.getByRole('button', { name: /Start the scenario/i }).click();
  await expect(scenario.getByText(/Checkpoint 1 of 4/i)).toBeVisible();
  await expect(scenario.getByText('DELEGATE', { exact: true })).toBeVisible();
});

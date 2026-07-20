import { test, expect } from '@playwright/test';
import { signInAsDemo, openModule, SUPABASE_URL } from './helpers';

// R17 end-to-end (restructure U13): an admin publish-with-reset durably clears
// learner progress — the learner sees the module incomplete again plus the
// reset notice, and can re-complete under the new epoch.
//
// APPROACH (justified fallback per plan U13): the e2e stack does not serve
// Edge Functions (chat/grade are network-stubbed, and spec 17 stubs
// admin-content for the same reason), so the CMS "Publish → Reset learner
// progress" UI cannot perform the real mutation here. The ADMIN side is
// therefore replayed as admin-content's EXACT service-role sequence
// (supabase/functions/admin-content/index.ts, U10 — strictly ordered):
//   1. set modules.progress_reset_at = epoch  ← the commit point; from this
//      instant the enforce_progress_reset_epoch trigger rejects stale echoes;
//   2. delete the module's module_progress rows.
// The LEARNER side — the substance of R17 — runs through the real UI against
// the real DB: complete → reload → dropped completion + reset notice →
// re-complete sticks. The function-side publish path itself is proven by
// adminContent.integration.test.ts and progressReset.integration.test.ts.
//
// Runs LAST in the serial suite (filename order) and mutates only this one
// module's progress, so no other spec observes the reset.

// Service-role key for the admin-side reset sequence. NEVER hardcoded (GitHub
// push protection flags the local-dev default's secret-key format): export it
// before the run — `eval $(npx supabase status -o env | grep SERVICE_ROLE_KEY)`
// then SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" npm run test:e2e — or let
// this spec skip. All learner-side specs are unaffected.
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

// A seeded Week 0 course lesson (U8) with no quiz/exercise — its universal
// footer offers "Mark as explored" (U9). Spec 21 only opens it (in_progress),
// so it is still incomplete when this spec starts.
const CELL = 'c1-w0-claude-setup';

async function serviceFetch(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  expect(res.ok, `service call ${path} -> ${res.status}`).toBeTruthy();
  return res.json();
}

// Skip (don't fail) when the service key isn't exported — every other spec
// stays runnable without it.
test.skip(SERVICE_KEY === '', 'SUPABASE_SERVICE_ROLE_KEY not set — see header comment');

test('publish-with-reset clears a completion; the learner sees the notice and can re-complete', async ({
  page,
}) => {
  // --- Learner: complete the module (mark-explored) --------------------------
  await signInAsDemo(page);
  await openModule(page, CELL);
  await page.locator('#mark-explored-button').click();

  // The optimistic UI advances the cursor; wait for the WRITE to land on the
  // server before resetting, or the reset would race the completion.
  const profiles = (await serviceFetch(
    'profiles?select=id&email=eq.demo%40navapbc.com',
  )) as { id: string }[];
  const uid = profiles[0].id;
  await expect
    .poll(
      async () => {
        const rows = (await serviceFetch(
          `module_progress?select=status&user_id=eq.${uid}&module_id=eq.${CELL}`,
        )) as { status: string }[];
        return rows[0]?.status;
      },
      { timeout: 10_000 },
    )
    .toBe('completed');

  // Re-opening the module shows the completed footer.
  await openModule(page, CELL);
  await expect(page.locator('#module-completed')).toBeVisible();

  // --- Admin: publish-with-reset (admin-content's exact ordered sequence) ----
  const epoch = new Date().toISOString();
  await serviceFetch(`modules?cell_id=eq.${CELL}`, {
    method: 'PATCH',
    body: JSON.stringify({ progress_reset_at: epoch }),
  });
  await serviceFetch(`module_progress?module_id=eq.${CELL}`, { method: 'DELETE' });

  // --- Learner: reload → completion dropped + reset notice -------------------
  // Reconcile (U10) finds the cached completion missing on the server, with the
  // module's progress_reset_at NEWER than the captured epoch → the completion
  // is DROPPED (not re-derived/resurrected) and the notice surfaces.
  await page.reload();
  await expect(page.locator('#sidebar')).toBeVisible({ timeout: 15_000 });
  await openModule(page, CELL);

  await expect(page.getByText(/progress was reset/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#module-completed')).toHaveCount(0);
  const markExplored = page.locator('#mark-explored-button');
  await expect(markExplored).toBeVisible();

  // --- Learner: re-completing under the NEW epoch sticks and clears the notice.
  await markExplored.click();
  await expect(page.getByText(/progress was reset/i)).toHaveCount(0);
  await expect
    .poll(
      async () => {
        const rows = (await serviceFetch(
          `module_progress?select=status&user_id=eq.${uid}&module_id=eq.${CELL}`,
        )) as { status: string }[];
        return rows[0]?.status;
      },
      { timeout: 10_000 },
    )
    .toBe('completed');
});

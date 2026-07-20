import { defineConfig, devices } from '@playwright/test';

// E2E config. Specs live in `e2e/` and run against the Vite dev server
// (started for us by the `webServer` block) plus a LOCAL Supabase stack
// (`supabase start`) that the specs talk to. The Claude/Anthropic call is
// STUBBED at the network layer in each spec (intercept POST **/functions/v1/chat
// and return a canned text stream) so no real ANTHROPIC_API_KEY is needed.
//
// NOTE: E2E is intentionally NOT wired into CI yet — it needs the Supabase
// stack and a seeded user. Run locally with `npm run test:e2e` after
// `npx supabase start` + a populated `.env`. See docs/DEBT-REPORT.md.
const PORT = 5173;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  // The specs share ONE seeded demo user and the user tables have no DELETE
  // policy (append-only, owner-only) — so there is no per-test cleanup. Run
  // serially in filename order against a FRESHLY RESET DB (`supabase db reset`):
  // completion/attempt state accumulates across specs by design, and
  // 22-progress-reset (which mutates one module's progress via service role)
  // runs last. (The no-cleanup constraint is a recorded finding; see
  // DEBT-REPORT.md.)
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Pin the dev server to the baseURL port (the default `npm run dev` uses
    // :3000); `--host` keeps it reachable. Reuse an already-running server
    // locally so an open `npm run dev` isn't restarted under you.
    command: `npm run dev -- --port=${PORT} --host`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

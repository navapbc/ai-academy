import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// Vitest runs through Vite, so `.env` is loaded and `VITE_`-prefixed vars are
// exposed on `import.meta.env` — the same values the app and the Supabase
// client read. Integration tests in `progress.test.ts` use them to talk to the
// local Supabase stack, so they need `npx supabase start` running.
//
// The default environment is `node` (fast, what the pure-logic and integration
// suites want). Component tests opt into jsdom per file with a docblock:
//   // @vitest-environment jsdom
// so React Testing Library has a DOM, while the node suites stay lightweight.
//
// `e2e/` is intentionally excluded — those are Playwright specs, not vitest.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    // Also pick up the Edge Function's pure-logic tests (chat-core), which are
    // Deno-agnostic and run fine under node. e2e/ stays Playwright-only.
    include: ['src/**/*.test.{ts,tsx}', 'supabase/functions/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'e2e'],
    setupFiles: ['src/test/setup.ts'],
  },
});

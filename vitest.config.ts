import { defineConfig } from 'vitest/config';

// Vitest runs through Vite, so `.env` is loaded and `VITE_`-prefixed vars are
// exposed on `import.meta.env` — the same values the app and the Supabase
// client read. Integration tests in `progress.test.ts` use them to talk to the
// local Supabase stack, so they need `npx supabase start` running.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
});

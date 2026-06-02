// Test-only setup, run before every test file (both the node-env logic/
// integration suites and the jsdom-env component suites).
//
// 1. The Supabase client constructs a realtime client that requires a global
//    WebSocket; Node 20 has none. We never use realtime in tests, but the
//    constructor needs one to exist, so polyfill it with `ws`.
// 2. jest-dom adds DOM matchers (toBeInTheDocument, toHaveTextContent, …) to
//    vitest's `expect`. Importing is harmless under the node env; the matchers
//    are only exercised by the jsdom component tests.
// 3. React Testing Library leaves mounted trees in the document between tests;
//    we unmount them after each test. Guarded on `document` so the node-env
//    suites (which have no DOM) skip it cleanly.
import { WebSocket } from 'ws';
import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as { WebSocket?: unknown }).WebSocket = WebSocket;
}

afterEach(async () => {
  if (typeof document === 'undefined') return;
  const { cleanup } = await import('@testing-library/react');
  cleanup();
});

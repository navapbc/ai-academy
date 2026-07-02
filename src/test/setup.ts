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
// 4. vitest-axe's `toHaveNoViolations()` matcher (P6.4) is registered suite-wide
//    here so the axe surface tests can assert it; the `extend-expect` import
//    augments vitest's `Assertion` type so it's typed with no `any`.
import { WebSocket } from 'ws';
import { afterEach, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import * as axeMatchers from 'vitest-axe/matchers';
import 'vitest-axe/extend-expect';

expect.extend(axeMatchers);

if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as { WebSocket?: unknown }).WebSocket = WebSocket;
}

afterEach(async () => {
  if (typeof document === 'undefined') return;
  const { cleanup } = await import('@testing-library/react');
  cleanup();
});

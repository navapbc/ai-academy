// Test-only setup. The Supabase client constructs a realtime client that
// requires a global WebSocket; Node 20 has none. We never use realtime in
// tests, but the constructor needs one to exist, so polyfill it with `ws`.
import { WebSocket } from 'ws';

if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as { WebSocket?: unknown }).WebSocket = WebSocket;
}

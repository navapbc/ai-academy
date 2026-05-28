import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Read local-Supabase connection values from the Vite env. These are safe to
// expose to the browser: the anon key is public by design and RLS protects the
// data. The server-side ANTHROPIC_API_KEY is intentionally NOT read here and
// must never be VITE-prefixed or imported into client code (see P1.2).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Whether the Supabase env vars are present. Lets callers degrade gracefully
 * instead of crashing when running without a local stack configured.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let client: SupabaseClient | null = null;

/**
 * Returns the singleton Supabase client, creating it on first use.
 *
 * The client is created lazily so that a production build never throws at
 * import time when env vars are absent — it only throws if code actually tries
 * to use Supabase without configuration. Data reads/writes are not wired to
 * Supabase yet (that lands in P1.4); for now this just establishes the
 * connection.
 */
export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and ' +
        'VITE_SUPABASE_ANON_KEY in your .env (copy from .env.example and use ' +
        'the values printed by `npx supabase start`).',
    );
  }

  client = createClient(supabaseUrl, supabaseAnonKey);
  return client;
}

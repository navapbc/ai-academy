import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

// Staff-dashboard realtime wiring (P5.2d): the "live upgrade" over the P5.2b/c
// polling+manual-reload path. The dashboard renders the P5.2a aggregation views,
// but Postgres `postgres_changes` only fires on base-table rows — so we subscribe
// to the four base tables feeding the views and use any change purely as a
// *trigger* to refetch the RLS-scoped views (payloads are never read, so there's
// no incremental-aggregate drift and no leak surface). RLS still scopes delivery:
// a subscriber only receives events for rows it can read (P5.1c/P5.2a).

/** The base tables behind the P5.2a views — a change in any one moves the dashboard. */
const DASHBOARD_TABLES = [
  'module_progress',
  'quiz_attempts',
  'lab_submissions',
  'enrollments',
] as const;

const REFRESH_DEBOUNCE_MS = 500;

export interface DebouncedFn {
  (): void;
  cancel: () => void;
}

/**
 * Coalesce a burst of calls into a single trailing call after `ms` of quiet.
 * `.cancel()` drops any pending call (used by the subscription disposer so a
 * queued refresh can't fire after unmount).
 */
export function debounce(fn: () => void, ms: number): DebouncedFn {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = (() => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  }) as DebouncedFn;
  debounced.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return debounced;
}

/**
 * Subscribe to live changes on the dashboard's base tables and invoke `onChange`
 * (debounced) whenever any of them change. Returns a disposer that cancels the
 * pending refresh and tears down the channel.
 *
 * No-op (returns an inert disposer, never touching the client) when Supabase is
 * not configured — keeps an offline/unconfigured build from throwing.
 */
export function subscribeToDashboardChanges(onChange: () => void): () => void {
  if (!isSupabaseConfigured) return () => {};

  const refresh = debounce(onChange, REFRESH_DEBOUNCE_MS);
  const sb = getSupabaseClient();
  let channel = sb.channel('dashboard-changes');
  for (const table of DASHBOARD_TABLES) {
    channel = channel.on(
      // supabase-js types `postgres_changes` via an overload the generic string
      // doesn't satisfy; the runtime contract is the documented one.
      'postgres_changes' as never,
      { event: '*', schema: 'public', table },
      () => refresh(),
    );
  }
  channel.subscribe();

  return () => {
    refresh.cancel();
    sb.removeChannel(channel);
  };
}

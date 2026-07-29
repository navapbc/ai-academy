import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchUsageByUser, type UsageByUser } from './usageMonitoring';

// Admin usage-monitoring state (P6.2 Unit 3). Fetches per-user token/call totals
// over the selected window on mount and whenever the window changes. No cache —
// a fresh admin read per visit is correct and cheap; RLS (`is_admin()`) scopes
// the read. Mirrors useDashboard's loading/error/data + reload shape.
//
// No isSupabaseConfigured guard: this hook only renders inside a RoleGuard
// subtree that already requires a resolved admin role (hence a configured stack).

export interface UsageMonitoringState {
  rows: UsageByUser[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useUsageMonitoring(windowMs: number): UsageMonitoringState {
  const [rows, setRows] = useState<UsageByUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // `windowMs` is a user-facing picker, so switching windows (or hitting Retry)
  // can leave two reads in flight. Without a generation guard the SLOWER one wins
  // whichever window it was for — e.g. pick "Last 30 days" then "Last 24 hours"
  // and the 30-day totals land under the 24-hour label. Only the newest request
  // may write state.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    const isCurrent = () => mounted.current && requestId.current === id;
    setLoading(true);
    setError(null);
    try {
      const sinceIso = new Date(Date.now() - windowMs).toISOString();
      const result = await fetchUsageByUser(sinceIso);
      if (!isCurrent()) return;
      setRows(result);
      setError(null);
      setLoading(false);
    } catch (err: unknown) {
      if (!isCurrent()) return;
      console.error('[useUsageMonitoring] usage fetch failed', err);
      setError('Could not load usage monitoring.');
      setLoading(false);
    }
  }, [windowMs]);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  return { rows, loading, error, reload };
}

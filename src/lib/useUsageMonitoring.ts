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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sinceIso = new Date(Date.now() - windowMs).toISOString();
      const result = await fetchUsageByUser(sinceIso);
      if (!mounted.current) return;
      setRows(result);
      setError(null);
      setLoading(false);
    } catch (err: unknown) {
      if (!mounted.current) return;
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

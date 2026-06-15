import { useCallback, useEffect, useState } from 'react';
import {
  fetchCohortSummaries,
  fetchScoreDistribution,
  type CohortSummary,
  type ScoreDistribution,
} from './dashboard';

// Staff cohort-dashboard state (P5.2b). Fetches the scoped rollups once on
// mount; the cohort filter is client-side (the scoped views already returned
// every cohort the caller can see), so no refetch per selection. Realtime is
// P5.2d. No cache — a fresh staff read per visit is correct and cheap.

export interface DashboardState {
  summaries: CohortSummary[];
  distribution: Map<string, ScoreDistribution>;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useDashboard(): DashboardState {
  const [summaries, setSummaries] = useState<CohortSummary[]>([]);
  const [distribution, setDistribution] = useState<Map<string, ScoreDistribution>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // No isSupabaseConfigured guard: this hook only renders inside a RoleGuard
    // subtree that already requires a resolved staff role (hence a configured stack).
    Promise.all([fetchCohortSummaries(), fetchScoreDistribution()])
      .then(([s, d]) => {
        if (cancelled) return;
        setSummaries(s);
        setDistribution(d);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('[useDashboard] dashboard fetch failed', err);
        setError('Could not load the cohort dashboard.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { summaries, distribution, loading, error, reload };
}

import { useCallback, useEffect, useState } from 'react';
import {
  fetchCohortSummaries,
  fetchScoreDistribution,
  type CohortSummary,
  type ScoreDistribution,
} from './dashboard';
import { fetchCohortLearners, type LearnerRosterEntry } from './learnerDetail';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

// Staff cohort-dashboard state (P5.2b/P5.2c). Fetches the scoped rollups plus
// the per-learner roster (the P5.2c drill-down spine) once on mount; the cohort
// filter is client-side (the scoped views already returned every cohort the
// caller can see), so no refetch per selection. Realtime is P5.2d. No cache —
// a fresh staff read per visit is correct and cheap.

export interface DashboardState {
  summaries: CohortSummary[];
  distribution: Map<string, ScoreDistribution>;
  /** Every visible learner; the dashboard groups them by cohortId. */
  learners: LearnerRosterEntry[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useDashboard(): DashboardState {
  const [summaries, setSummaries] = useState<CohortSummary[]>([]);
  const [distribution, setDistribution] = useState<Map<string, ScoreDistribution>>(new Map());
  const [learners, setLearners] = useState<LearnerRosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // Realtime subscription for P5.2d
  useEffect(() => {
    let cancelled = false;
    let subscription: any = null;

    const fetchData = () => {
      Promise.all([fetchCohortSummaries(), fetchScoreDistribution(), fetchCohortLearners()])
        .then(([s, d, l]) => {
          if (cancelled) return;
          setSummaries(s);
          setDistribution(d);
          setLearners(l);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          console.error('[useDashboard] dashboard fetch failed', err);
          setError('Could not load the cohort dashboard.');
          setLoading(false);
        });
    };

    // Initial fetch
    fetchData();

    // Setup realtime subscription if Supabase is configured
    if (isSupabaseConfigured) {
      const supabase = getSupabaseClient();
      
      // Subscribe to changes in views that affect the dashboard
      // We need to subscribe to the underlying tables that drive the dashboard data
      subscription = supabase
        .from('cohort_progress_summary')
        .on('*', (payload) => {
          // Re-fetch when data changes
          if (!cancelled) {
            fetchData();
          }
        })
        .subscribe();

      // Also listen for changes to learner progress data that could affect summaries
      subscription = supabase
        .from('learner_progress_summary')
        .on('*', (payload) => {
          // Re-fetch when data changes
          if (!cancelled) {
            fetchData();
          }
        })
        .subscribe();
    }

    return () => {
      cancelled = true;
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [nonce]);

  return { summaries, distribution, learners, loading, error, reload };
}

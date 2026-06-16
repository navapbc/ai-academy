import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchCohortSummaries,
  fetchScoreDistribution,
  type CohortSummary,
  type ScoreDistribution,
} from './dashboard';
import { fetchCohortLearners, type LearnerRosterEntry } from './learnerDetail';
import { subscribeToDashboardChanges } from './dashboardRealtime';

// Staff cohort-dashboard state (P5.2b/P5.2c + P5.2d realtime). Fetches the scoped
// rollups plus the per-learner roster (the P5.2c drill-down spine) on mount; the
// cohort filter is client-side (the scoped views already returned every cohort the
// caller can see), so no refetch per selection. No cache — a fresh staff read per
// visit is correct and cheap.
//
// P5.2d: a Supabase realtime subscription on the base tables behind the views
// triggers a *background* refresh — one that never enters the loading state and
// never clears good data on a transient failure, so a live update can't flash the
// staff viewer's whole screen to a spinner or the error screen mid-session.
// `reload` stays the foreground path (mount + manual Retry).

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

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The single fetch path. `background` distinguishes a realtime-triggered refresh
  // (silent — keep showing the current data) from a foreground load (mount/Retry,
  // which owns the spinner + error screen). No isSupabaseConfigured guard: this
  // hook only renders inside a RoleGuard subtree that already requires a resolved
  // staff role (hence a configured stack).
  const load = useCallback(async ({ background }: { background: boolean } = { background: false }) => {
    if (!background) {
      setLoading(true);
      setError(null);
    }
    try {
      const [s, d, l] = await Promise.all([
        fetchCohortSummaries(),
        fetchScoreDistribution(),
        fetchCohortLearners(),
      ]);
      if (!mounted.current) return;
      setSummaries(s);
      setDistribution(d);
      setLearners(l);
      setError(null); // a healthy refresh clears any stale error
      if (!background) setLoading(false);
    } catch (err: unknown) {
      if (!mounted.current) return;
      console.error('[useDashboard] dashboard fetch failed', err);
      // A background refresh keeps the current data on the screen — only a
      // foreground load surfaces the error (and stops the spinner).
      if (!background) {
        setError('Could not load the cohort dashboard.');
        setLoading(false);
      }
    }
  }, []);

  const reload = useCallback(() => {
    void load({ background: false });
  }, [load]);

  useEffect(() => {
    void load({ background: false });
  }, [load]);

  // P5.2d: live updates → debounced background refresh. Inert when Supabase is
  // unconfigured (subscribeToDashboardChanges returns a no-op disposer).
  useEffect(() => subscribeToDashboardChanges(() => void load({ background: true })), [load]);

  return { summaries, distribution, learners, loading, error, reload };
}

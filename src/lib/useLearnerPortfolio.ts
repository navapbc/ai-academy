import { useCallback, useEffect, useState } from 'react';
import { fetchLearnerPortfolio, type LearnerPortfolio } from './learnerPortfolio';

// Learner portfolio fetch state (P5.3b). Mirrors useLearnerDetail: fetches the
// signed-in learner's own portfolio artifacts on mount (keyed on userId), no cache.
// Only rendered inside the learner self-view (LearnerDashboard), reading own rows
// under owner RLS.

export interface LearnerPortfolioState {
  portfolio: LearnerPortfolio | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useLearnerPortfolio(userId: string): LearnerPortfolioState {
  const [portfolio, setPortfolio] = useState<LearnerPortfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchLearnerPortfolio(userId)
      .then((p) => {
        if (cancelled) return;
        setPortfolio(p);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('[useLearnerPortfolio] portfolio fetch failed', err);
        setError('Could not load your portfolio.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, nonce]);

  return { portfolio, loading, error, reload };
}

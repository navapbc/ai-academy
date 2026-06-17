import { useCallback, useEffect, useState } from 'react';
import { fetchLearnerDetail, type LearnerDetailData } from './learnerDetail';

// Per-learner detail state (P5.2c). Fetches one learner's drill-down on demand
// (keyed on userId); no cache — a fresh read per open is correct and cheap.
// Two callers, same hook: the staff drill-down (LearnerDetail, champion/admin RLS,
// inside the RoleGuard staff subtree) and the learner self-view (LearnerDashboard,
// P5.3a, owner RLS with userId = the signed-in user). Mirrors useDashboard's shape.

export interface LearnerDetailState {
  detail: LearnerDetailData | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useLearnerDetail(userId: string): LearnerDetailState {
  const [detail, setDetail] = useState<LearnerDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchLearnerDetail(userId)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('[useLearnerDetail] detail fetch failed', err);
        setError('Could not load this learner’s detail.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, nonce]);

  return { detail, loading, error, reload };
}

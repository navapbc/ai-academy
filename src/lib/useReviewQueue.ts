import { useCallback, useEffect, useState } from 'react';
import { fetchReviewQueue, type ReviewQueueItem } from './reviewQueue';

// Review queue fetch state (P5.5b). Mirrors useLearnerDetail: loads the RLS-scoped
// reviewable submissions on mount, no cache. Only rendered inside the RoleGuard
// staff subtree (champion/admin).

export interface ReviewQueueState {
  queue: ReviewQueueItem[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useReviewQueue(): ReviewQueueState {
  const [queue, setQueue] = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchReviewQueue()
      .then((items) => {
        if (cancelled) return;
        setQueue(items);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('[useReviewQueue] review queue fetch failed', err);
        setError('Could not load the review queue.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { queue, loading, error, reload };
}

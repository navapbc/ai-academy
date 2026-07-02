import { useCallback, useEffect, useState } from 'react';
import { fetchWorkshops, type Workshop } from './workshops';

// Loads the learner's list of available workshops once after sign-in (X.3 Unit 4).
// Workshops are shared, read-only admin config (like the curriculum), so this
// fetches once per mount with a reload for the error path — no per-user
// reconciliation. Mirrors useCurriculum/useLearnerDetail's hook shape. Read-only:
// this hook never writes (workshop progress is derived from module_progress, R5).

export interface UseWorkshopsResult {
  workshops: Workshop[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** Look up a single workshop by id (for the runner). */
  getWorkshop: (id: string) => Workshop | undefined;
}

export function useWorkshops(): UseWorkshopsResult {
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchWorkshops()
      .then((loaded) => {
        if (cancelled) return;
        setWorkshops(loaded);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('[useWorkshops] fetch failed', err);
        setError('Could not load workshops. Check your connection and try again.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const getWorkshop = useCallback(
    (id: string) => workshops.find((w) => w.id === id),
    [workshops],
  );

  return { workshops, loading, error, reload, getWorkshop };
}

import { useEffect, useState } from 'react';
import type { Curriculum } from '../types';
import { fetchCurriculum } from './modules';

// Loads the curriculum from Supabase once after sign-in. The app gates its main
// view on this: a loading state until modules arrive, a clear error if the
// fetch fails. Because modules are shared, read-only content, this fetches once
// per mount (no per-user reconciliation like progress needs).

interface UseCurriculumResult {
  /** The fetched curriculum (sections + raw row count), or null until the first load resolves. */
  curriculum: Curriculum | null;
  /** True while the initial fetch is in flight. */
  loading: boolean;
  /** Non-null when the fetch failed; the app shows a retry-able error. */
  error: string | null;
}

export function useCurriculum(): UseCurriculumResult {
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCurriculum()
      .then((loaded) => {
        if (!cancelled) setCurriculum(loaded);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Could not load the curriculum. Check your connection and try again.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { curriculum, loading: curriculum === null && error === null, error };
}

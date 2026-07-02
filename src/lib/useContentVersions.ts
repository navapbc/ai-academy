import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchContentVersions, type ContentVersionEntry } from './contentVersions';

// Version-history state for the CMS lesson detail (X.2 Unit 3). Fetches a cell's
// content_versions (admin RLS-scoped, read-only) on mount and whenever the cell
// changes. No cache — a fresh admin read per open is correct and cheap; mirrors
// CmsHome's load pattern. `reload` re-fetches after a publish so a just-written
// snapshot appears without leaving the detail.

export interface ContentVersionsState {
  versions: ContentVersionEntry[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useContentVersions(cellId: string): ContentVersionsState {
  const [versions, setVersions] = useState<ContentVersionEntry[]>([]);
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
      const rows = await fetchContentVersions(cellId);
      if (!mounted.current) return;
      setVersions(rows);
      setLoading(false);
    } catch (err: unknown) {
      if (!mounted.current) return;
      console.error('[useContentVersions] load failed', err);
      setError('Could not load the version history.');
      setLoading(false);
    }
  }, [cellId]);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  return { versions, loading, error, reload };
}

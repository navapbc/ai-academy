import { useCallback, useEffect, useState } from 'react';
import type { UserProgress } from '../types';
import { readProgressCache, writeProgressCache } from './progressCache';
import {
  fetchModuleProgress,
  setModuleStatus,
  type ModuleProgressSnapshot,
} from './progress';

// Owns learner progress for the signed-in user. Supabase is the source of
// truth; localStorage is an optional read-through cache (instant first paint)
// and offline fallback. Lifecycle: hydrate from cache -> reconcile with
// Supabase -> persist every change to both. Supabase write failures keep the
// optimistic state and surface a dismissible error rather than blocking the UI.

interface UseProgressResult {
  progress: UserProgress;
  /** Marks a module complete and advances to the next module. */
  completeModule: (moduleId: string) => void;
  /** Sets the current module (and records it in_progress unless completed). */
  selectModule: (moduleId: string) => void;
  /** Non-blocking message when a Supabase sync fails; UI stays usable. */
  error: string | null;
  dismissError: () => void;
}

/** Picks the module to land on: live cursor -> latest in_progress -> first incomplete -> first. */
export function resolveCurrentModuleId(
  snapshot: ModuleProgressSnapshot,
  cursor: string | undefined,
  allModuleIds: string[],
): string {
  const completed = new Set(snapshot.completedModuleIds);
  const isResumable = (id: string | null | undefined): id is string =>
    !!id && allModuleIds.includes(id) && !completed.has(id);
  // Ignore ids we don't recognise (e.g. stale rows) so we never land on a
  // module that isn't in the curriculum.
  if (isResumable(cursor)) return cursor;
  if (isResumable(snapshot.latestInProgressId)) return snapshot.latestInProgressId;
  const firstIncomplete = allModuleIds.find((id) => !completed.has(id));
  return firstIncomplete ?? allModuleIds[0];
}

export function useProgress(userId: string, allModuleIds: string[]): UseProgressResult {
  const [progress, setProgress] = useState<UserProgress>(
    () =>
      readProgressCache() ?? {
        completedModuleIds: [],
        currentModuleId: allModuleIds[0],
      },
  );
  const [error, setError] = useState<string | null>(null);

  // Persist to cache on every change so the next load paints instantly and the
  // app survives offline.
  useEffect(() => {
    writeProgressCache(progress);
  }, [progress]);

  // Reconcile with Supabase when the signed-in user is known.
  useEffect(() => {
    let cancelled = false;
    fetchModuleProgress(userId)
      .then((snapshot) => {
        if (cancelled) return;
        setProgress((prev) => ({
          completedModuleIds: snapshot.completedModuleIds,
          currentModuleId: resolveCurrentModuleId(
            snapshot,
            prev.currentModuleId,
            allModuleIds,
          ),
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setError('Could not load your saved progress. Showing the last cached copy.');
      });
    return () => {
      cancelled = true;
    };
  }, [userId, allModuleIds]);

  const completeModule = useCallback(
    (moduleId: string) => {
      setProgress((prev) => {
        if (prev.completedModuleIds.includes(moduleId)) return prev;
        const nextIndex = allModuleIds.indexOf(moduleId) + 1;
        const nextModuleId = allModuleIds[nextIndex] ?? moduleId;
        return {
          completedModuleIds: [...prev.completedModuleIds, moduleId],
          currentModuleId: nextModuleId,
        };
      });
      setModuleStatus(userId, moduleId, 'completed').catch(() => {
        setError('Your progress was saved locally but could not sync. It will retry later.');
      });
    },
    [userId, allModuleIds],
  );

  const selectModule = useCallback(
    (moduleId: string) => {
      let alreadyCompleted = false;
      setProgress((prev) => {
        alreadyCompleted = prev.completedModuleIds.includes(moduleId);
        return { ...prev, currentModuleId: moduleId };
      });
      if (!alreadyCompleted) {
        setModuleStatus(userId, moduleId, 'in_progress').catch(() => {
          // Position is a soft signal; a failed sync shouldn't nag the learner.
        });
      }
    },
    [userId],
  );

  const dismissError = useCallback(() => setError(null), []);

  return { progress, completeModule, selectModule, error, dismissError };
}

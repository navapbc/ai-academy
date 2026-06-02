import { useCallback, useEffect, useState } from 'react';
import type { UserProgress } from '../types';
import { readProgressCache, writeProgressCache } from './progressCache';
import {
  addPendingCompletion,
  readPendingCompletions,
  removePendingCompletion,
} from './pendingWrites';
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
  /** Marks a module complete and advances to the next *unlocked* module. */
  completeModule: (moduleId: string) => void;
  /** Sets the current module (and records it in_progress unless completed). */
  selectModule: (moduleId: string) => void;
  /** Non-blocking message when a Supabase sync fails; UI stays usable. */
  error: string | null;
  dismissError: () => void;
}

/**
 * Optional gating predicate (FE-03): given a candidate module and the completed
 * set *after* a completion, returns whether that module is currently locked.
 * `completeModule` uses it to skip locked modules when advancing the cursor, so
 * a normal "Continue" never lands the learner on a gated Stage-2 module.
 */
export type IsModuleLockedFn = (moduleId: string, completedIds: string[]) => boolean;

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

/**
 * The next module to land on after completing `moduleId`: the first later module
 * that isn't locked given the new `completedIds`. Falls back to staying put —
 * never advances onto a locked module (FE-03).
 */
export function resolveNextModuleId(
  moduleId: string,
  completedIds: string[],
  allModuleIds: string[],
  isLocked?: IsModuleLockedFn,
): string {
  const start = allModuleIds.indexOf(moduleId) + 1;
  for (let i = start; i < allModuleIds.length; i++) {
    const candidate = allModuleIds[i];
    if (!isLocked || !isLocked(candidate, completedIds)) return candidate;
  }
  // Nothing unlocked ahead — stay on the just-completed module.
  return moduleId;
}

export function useProgress(
  userId: string,
  allModuleIds: string[],
  isLocked?: IsModuleLockedFn,
): UseProgressResult {
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

  // Reconcile with Supabase when the signed-in user is known. Also retries any
  // completion writes parked in the outbox (DATA-02) so a failed sync isn't lost.
  useEffect(() => {
    let cancelled = false;

    // Retry parked writes; drop each from the outbox once confirmed.
    for (const id of readPendingCompletions()) {
      setModuleStatus(userId, id, 'completed')
        .then(() => removePendingCompletion(id))
        .catch(() => {
          /* still offline — keep it parked for the next reconcile */
        });
    }

    fetchModuleProgress(userId)
      .then((snapshot) => {
        if (cancelled) return;
        setProgress((prev) => {
          // Merge, don't replace: union the server snapshot with the optimistic
          // local completions and anything still pending in the outbox, so a
          // completion can never regress here (DATA-02). Completions are
          // monotonic in this app (no "un-complete"), so union is safe.
          const pending = readPendingCompletions();
          const mergedCompleted = Array.from(
            new Set([...snapshot.completedModuleIds, ...prev.completedModuleIds, ...pending]),
          );
          const mergedSnapshot: ModuleProgressSnapshot = {
            ...snapshot,
            completedModuleIds: mergedCompleted,
          };
          return {
            completedModuleIds: mergedCompleted,
            currentModuleId: resolveCurrentModuleId(
              mergedSnapshot,
              prev.currentModuleId,
              allModuleIds,
            ),
          };
        });
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
        const completedModuleIds = [...prev.completedModuleIds, moduleId];
        return {
          completedModuleIds,
          // Skip locked modules when advancing (FE-03): the completion may itself
          // unlock the next stage, so resolve against the new completed set.
          currentModuleId: resolveNextModuleId(
            moduleId,
            completedModuleIds,
            allModuleIds,
            isLocked,
          ),
        };
      });
      setModuleStatus(userId, moduleId, 'completed')
        .then(() => removePendingCompletion(moduleId))
        .catch(() => {
          // Park the write so the next reconcile retries it (DATA-02).
          addPendingCompletion(moduleId);
          setError('Your progress was saved locally but could not sync. It will retry automatically.');
        });
    },
    [userId, allModuleIds, isLocked],
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

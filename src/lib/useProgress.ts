import { useCallback, useEffect, useRef, useState } from 'react';
import type { UserProgress } from '../types';
import { readProgressCache, writeProgressCache } from './progressCache';
import {
  addPendingCompletion,
  readPendingCompletions,
  removePendingCompletion,
} from './pendingWrites';
import {
  fetchModuleProgress,
  onParticipation,
  setModuleStatus,
  type CompletedVia,
  type ModuleProgressSnapshot,
} from './progress';

// Owns learner progress for the signed-in user. Supabase is the source of
// truth; localStorage is an optional read-through cache (instant first paint)
// and offline fallback. Lifecycle: hydrate from cache -> reconcile with
// Supabase -> persist every change to both. Supabase write failures keep the
// optimistic state and surface a dismissible error rather than blocking the UI.
//
// U9 (hybrid participation completion): the hook also subscribes to the data
// layer's participation seam — a recorded lab submission or finished quiz
// attempt auto-completes its module (stamped with `completed_via`), WITHOUT
// moving the cursor, so a background completion never yanks the learner off
// the activity they just submitted.

interface UseProgressResult {
  progress: UserProgress;
  /** Marks a module complete (stamping `via`) and advances to the next *unlocked* module. */
  completeModule: (moduleId: string, via: CompletedVia) => void;
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
  // Cache and outbox are keyed by userId (audit D-01); `userId` is stable for
  // the life of a hook instance (App keys AcademyApp on session.user.id, so a
  // user change remounts), which is what makes this lazy initializer safe.
  const [progress, setProgress] = useState<UserProgress>(
    () =>
      readProgressCache(userId) ?? {
        completedModuleIds: [],
        currentModuleId: allModuleIds[0],
      },
  );
  const [error, setError] = useState<string | null>(null);

  // Synchronous mirror of the completed set for idempotence checks (U9): state
  // updaters run asynchronously, so a repeat completion (footer click followed
  // by a participation event, or a duplicate submission) can't be reliably
  // detected through setProgress alone. Kept in sync from every state change
  // below; applyCompletion also adds to it eagerly before its write.
  const completedIdsRef = useRef<Set<string>>(new Set(progress.completedModuleIds));
  useEffect(() => {
    completedIdsRef.current = new Set(progress.completedModuleIds);
  }, [progress.completedModuleIds]);

  // Persist to cache on every change so the next load paints instantly and the
  // app survives offline.
  useEffect(() => {
    writeProgressCache(userId, progress);
  }, [userId, progress]);

  // Reconcile with Supabase when the signed-in user is known. Also retries any
  // completion writes parked in the outbox (DATA-02) so a failed sync isn't lost.
  useEffect(() => {
    let cancelled = false;

    // Retry parked writes; drop each from the outbox once confirmed. Each entry
    // carries the via it was earned with (U9) so the replay stamps completed_via
    // exactly as the original write would have (null for pre-U9 entries — the
    // data layer then omits the column rather than guessing).
    for (const { id, via } of readPendingCompletions(userId)) {
      setModuleStatus(userId, id, 'completed', via)
        .then(() => removePendingCompletion(userId, id))
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
          const pending = readPendingCompletions(userId).map((p) => p.id);
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

  /**
   * Shared completion core (U9). `advance` distinguishes an explicit learner
   * action (footer button, sorter Continue, GLAT Finish — cursor moves on) from
   * a background participation event (the learner stays on the module they just
   * worked in).
   *
   * Idempotence: the FIRST completion owns the write — a repeat never writes
   * again, so completed_via is never re-stamped. An explicit repeat still
   * advances the cursor (e.g. GLAT's Finish button clicked after the seam
   * already completed 2.14 must still navigate); a seam repeat is a full no-op.
   */
  const applyCompletion = useCallback(
    (moduleId: string, via: CompletedVia, advance: boolean) => {
      const alreadyCompleted = completedIdsRef.current.has(moduleId);
      if (alreadyCompleted && !advance) return;
      completedIdsRef.current.add(moduleId);
      setProgress((prev) => {
        const isNew = !prev.completedModuleIds.includes(moduleId);
        if (!isNew && !advance) return prev;
        const completedModuleIds = isNew
          ? [...prev.completedModuleIds, moduleId]
          : prev.completedModuleIds;
        return {
          completedModuleIds,
          // Skip locked modules when advancing (FE-03): the completion may itself
          // unlock the next stage, so resolve against the new completed set.
          currentModuleId: advance
            ? resolveNextModuleId(moduleId, completedModuleIds, allModuleIds, isLocked)
            : prev.currentModuleId,
        };
      });
      if (alreadyCompleted) return; // navigation only — no second write, no re-stamp
      setModuleStatus(userId, moduleId, 'completed', via)
        .then(() => removePendingCompletion(userId, moduleId))
        .catch(() => {
          // Park the write (with its via) so the next reconcile retries it (DATA-02).
          addPendingCompletion(userId, moduleId, via);
          setError('Your progress was saved locally but could not sync. It will retry automatically.');
        });
    },
    [userId, allModuleIds, isLocked],
  );

  const completeModule = useCallback(
    (moduleId: string, via: CompletedVia) => applyCompletion(moduleId, via, true),
    [applyCompletion],
  );

  // U9: participation events (a recorded lab submission / finished quiz attempt)
  // auto-complete their module. The event is completion, not navigation — no
  // cursor advance. Ids outside the learner's visible curriculum are ignored,
  // matching resolveCurrentModuleId's "never land on an unknown module" posture.
  useEffect(() => {
    return onParticipation(({ moduleId, via }) => {
      if (!allModuleIds.includes(moduleId)) return;
      applyCompletion(moduleId, via, false);
    });
  }, [allModuleIds, applyCompletion]);

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

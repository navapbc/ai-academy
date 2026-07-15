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
  isEpochCurrent,
  onParticipation,
  setModuleStatus,
  submitCompletion,
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
//
// U10 (durable publish-time reset): every completion CAPTURES the module's
// reset epoch (progress_reset_at) and its own eventAt at the moment it
// happens; the pair persists in the outbox and the progress cache and is
// ECHOED on replay — never re-derived from freshly fetched curriculum (that
// would resurrect resets). A STALE_RESET_EPOCH rejection is the one TERMINAL
// completion-write error: the entry is dropped, the local completion purged,
// and the module id surfaced through `resetModuleIds` for the reset notice.

interface UseProgressResult {
  progress: UserProgress;
  /** Marks a module complete (stamping `via`) and advances to the next *unlocked* module. */
  completeModule: (moduleId: string, via: CompletedVia) => void;
  /** Sets the current module (and records it in_progress unless completed). */
  selectModule: (moduleId: string) => void;
  /**
   * Module ids whose local completion THIS SESSION dropped because an admin
   * published-with-reset (U10) — drives the dismissible reset notice. An id
   * leaves the set the moment the learner re-completes the module.
   */
  resetModuleIds: ReadonlySet<string>;
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

/**
 * Optional reset-epoch lookup (U10): the module's `progress_reset_at` from the
 * IN-MEMORY module object (the mount-time curriculum fetch). `completeModule`
 * calls it AT COMPLETION TIME to capture the epoch the work happened under;
 * reconcile calls it to detect completions that a publish-time reset deleted.
 */
export type GetResetEpochFn = (moduleId: string) => string | null;

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

/** Progress + the session's reset notices, in ONE state so transitions are atomic. */
interface ProgressState {
  progress: UserProgress;
  resetIds: ReadonlySet<string>;
}

export function useProgress(
  userId: string,
  allModuleIds: string[],
  isLocked?: IsModuleLockedFn,
  getResetEpoch?: GetResetEpochFn,
): UseProgressResult {
  // Cache and outbox are keyed by userId (audit D-01); `userId` is stable for
  // the life of a hook instance (App keys AcademyApp on session.user.id, so a
  // user change remounts), which is what makes this lazy initializer safe.
  const [state, setState] = useState<ProgressState>(() => ({
    progress:
      readProgressCache(userId) ?? {
        completedModuleIds: [],
        currentModuleId: allModuleIds[0],
      },
    resetIds: new Set<string>(),
  }));
  const [error, setError] = useState<string | null>(null);
  const progress = state.progress;

  // Synchronous mirror of the completed set for idempotence checks (U9): state
  // updaters run asynchronously, so a repeat completion (footer click followed
  // by a participation event, or a duplicate submission) can't be reliably
  // detected through setState alone. Kept in sync from every state change
  // below; applyCompletion also adds to it eagerly before its write.
  const completedIdsRef = useRef<Set<string>>(new Set(progress.completedModuleIds));
  useEffect(() => {
    completedIdsRef.current = new Set(progress.completedModuleIds);
  }, [progress.completedModuleIds]);

  // Persist to cache on every change so the next load paints instantly and the
  // app survives offline. The cache carries the per-completion epochs (U10) —
  // that's what lets the next session detect a reset that happened while away.
  useEffect(() => {
    writeProgressCache(userId, progress);
  }, [userId, progress]);

  /**
   * Terminal reset handling (U10): a completion the server rejected as
   * STALE_RESET_EPOCH (or one reconcile found deleted) is purged from local
   * state/cache — NOT unioned back — and its module id surfaces for the notice.
   */
  const markReset = useCallback((moduleId: string) => {
    completedIdsRef.current.delete(moduleId);
    setState((prev) => {
      if (!prev.progress.completedModuleIds.includes(moduleId) && prev.resetIds.has(moduleId)) {
        return prev;
      }
      const completionEpochs = { ...prev.progress.completionEpochs };
      delete completionEpochs[moduleId];
      return {
        progress: {
          ...prev.progress,
          completedModuleIds: prev.progress.completedModuleIds.filter((id) => id !== moduleId),
          completionEpochs,
        },
        resetIds: new Set(prev.resetIds).add(moduleId),
      };
    });
  }, []);

  // Reconcile with Supabase when the signed-in user is known. Also retries any
  // completion writes parked in the outbox (DATA-02) so a failed sync isn't lost.
  useEffect(() => {
    let cancelled = false;

    // Retry parked writes; drop each from the outbox once confirmed. Each entry
    // carries the via it was earned with (U9) and — U10 — the reset epoch +
    // eventAt CAPTURED WHEN THE COMPLETION HAPPENED. The replay ECHOES THE
    // STORED EPOCH (entry.epoch) and never the freshly fetched module's
    // progress_reset_at: re-deriving the epoch at replay time would stamp a
    // post-reset epoch onto pre-reset work and silently resurrect the reset —
    // exactly the resurrection bug the plan review killed (the DB acceptance
    // test fails an implementation that does that).
    for (const entry of readPendingCompletions(userId)) {
      submitCompletion(userId, entry.id, entry.via, entry.epoch, entry.eventAt).then((outcome) => {
        if (outcome === 'ok') {
          removePendingCompletion(userId, entry.id);
        } else if (outcome === 'reset') {
          // Terminal: the module was reset after this work — drop the entry,
          // purge the local completion, surface the notice.
          removePendingCompletion(userId, entry.id);
          if (!cancelled) markReset(entry.id);
        }
        // 'retry' — still offline/transient; keep it parked for the next reconcile.
      });
    }

    fetchModuleProgress(userId)
      .then((snapshot) => {
        if (cancelled) return;
        setState((prev) => {
          // Merge, don't replace: union the server snapshot with the optimistic
          // local completions and anything still pending in the outbox, so a
          // completion can never regress here (DATA-02) — with ONE pierce (U10):
          // a local/cached completion the server does NOT have, on a module
          // whose progress_reset_at is NEWER than the epoch captured with that
          // completion, was deleted by a publish-time reset. It is DROPPED (not
          // unioned) and surfaced via resetIds. Pending outbox entries always
          // stay in the union — their fate belongs to the replay classification
          // above, which can legitimately resubmit genuinely-new work.
          const serverCompleted = new Set(snapshot.completedModuleIds);
          const pendingIds = new Set(readPendingCompletions(userId).map((p) => p.id));
          const prevEpochs = prev.progress.completionEpochs ?? {};
          const dropped: string[] = [];
          const keptLocal = prev.progress.completedModuleIds.filter((id) => {
            if (serverCompleted.has(id) || pendingIds.has(id)) return true;
            if (isEpochCurrent(prevEpochs[id] ?? null, getResetEpoch?.(id) ?? null)) return true;
            dropped.push(id);
            return false;
          });
          const mergedCompleted = Array.from(
            new Set([...snapshot.completedModuleIds, ...keptLocal, ...pendingIds]),
          );
          const completionEpochs: Record<string, string | null> = {};
          for (const id of mergedCompleted) {
            if (id in prevEpochs) completionEpochs[id] = prevEpochs[id];
          }
          const mergedSnapshot: ModuleProgressSnapshot = {
            ...snapshot,
            completedModuleIds: mergedCompleted,
          };
          return {
            progress: {
              completedModuleIds: mergedCompleted,
              completionEpochs,
              currentModuleId: resolveCurrentModuleId(
                mergedSnapshot,
                prev.progress.currentModuleId,
                allModuleIds,
              ),
            },
            resetIds:
              dropped.length === 0 ? prev.resetIds : new Set([...prev.resetIds, ...dropped]),
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
  }, [userId, allModuleIds, getResetEpoch, markReset]);

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
   *
   * U10: the module's reset epoch and the event time are captured HERE — the
   * moment the completion happens — and travel with the write, the outbox
   * entry, and the cache. They are never re-derived later.
   */
  const applyCompletion = useCallback(
    (moduleId: string, via: CompletedVia, advance: boolean) => {
      const alreadyCompleted = completedIdsRef.current.has(moduleId);
      if (alreadyCompleted && !advance) return;
      completedIdsRef.current.add(moduleId);
      const epoch = getResetEpoch?.(moduleId) ?? null;
      const eventAt = new Date().toISOString();
      setState((prev) => {
        const isNew = !prev.progress.completedModuleIds.includes(moduleId);
        // Re-completing clears any standing reset notice for the module.
        let resetIds = prev.resetIds;
        if (resetIds.has(moduleId)) {
          const next = new Set(resetIds);
          next.delete(moduleId);
          resetIds = next;
        }
        if (!isNew && !advance && resetIds === prev.resetIds) return prev;
        const completedModuleIds = isNew
          ? [...prev.progress.completedModuleIds, moduleId]
          : prev.progress.completedModuleIds;
        const completionEpochs = isNew
          ? { ...prev.progress.completionEpochs, [moduleId]: epoch }
          : prev.progress.completionEpochs;
        return {
          progress: {
            completedModuleIds,
            completionEpochs,
            // Skip locked modules when advancing (FE-03): the completion may itself
            // unlock the next stage, so resolve against the new completed set.
            currentModuleId: advance
              ? resolveNextModuleId(moduleId, completedModuleIds, allModuleIds, isLocked)
              : prev.progress.currentModuleId,
          },
          resetIds,
        };
      });
      if (alreadyCompleted) return; // navigation only — no second write, no re-stamp
      submitCompletion(userId, moduleId, via, epoch, eventAt).then((outcome) => {
        if (outcome === 'ok') {
          removePendingCompletion(userId, moduleId);
        } else if (outcome === 'retry') {
          // Park the write (with its via + captured epoch/eventAt) so the next
          // reconcile retries it (DATA-02).
          addPendingCompletion(userId, moduleId, via, epoch, eventAt);
          setError('Your progress was saved locally but could not sync. It will retry automatically.');
        } else {
          // 'reset' — TERMINAL (STALE_RESET_EPOCH after the eventAt refinement):
          // the module was reset; drop rather than retry, and show the notice.
          removePendingCompletion(userId, moduleId);
          markReset(moduleId);
        }
      });
    },
    [userId, allModuleIds, isLocked, getResetEpoch, markReset],
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
      const alreadyCompleted = completedIdsRef.current.has(moduleId);
      setState((prev) => ({
        ...prev,
        progress: { ...prev.progress, currentModuleId: moduleId },
      }));
      if (!alreadyCompleted) {
        setModuleStatus(userId, moduleId, 'in_progress').catch(() => {
          // Position is a soft signal; a failed sync shouldn't nag the learner.
        });
      }
    },
    [userId],
  );

  const dismissError = useCallback(() => setError(null), []);

  return {
    progress,
    completeModule,
    selectModule,
    resetModuleIds: state.resetIds,
    error,
    dismissError,
  };
}

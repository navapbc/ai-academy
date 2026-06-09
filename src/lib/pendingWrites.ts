// A tiny durable outbox for module-completion writes that failed to reach
// Supabase (DATA-02). completeModule is optimistic; if the network write fails
// the module id is parked here (localStorage) and retried on the next
// reconcile, so a completion is never silently lost. All access is defensive:
// a missing Storage or corrupt value degrades to an empty outbox.
//
// The outbox is keyed PER USER (audit D-01): a parked completion may only ever
// be replayed under the account that earned it. It deliberately survives
// sign-out — it is durable evidence of work done, and now that it is owner-keyed
// it is retried when that same user signs back in.

const PENDING_KEY_PREFIX = 'sprint_pending_completions';
// The pre-D-01 shared key. An entry here can't be attributed to a user, and
// replaying it under whoever signs in next is exactly the D-01 cross-account
// write — so it is deleted on sight and never replayed.
const LEGACY_PENDING_KEY = 'sprint_pending_completions';

function pendingKey(userId: string): string {
  return `${PENDING_KEY_PREFIX}:${userId}`;
}

function getStorage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

/** The given user's module ids whose "completed" write has not yet been confirmed by the server. */
export function readPendingCompletions(userId: string): string[] {
  const storage = getStorage();
  if (!storage) return [];

  // One-time cleanup of the pre-D-01 shared outbox (unattributable — never replayed).
  if (storage.getItem(LEGACY_PENDING_KEY) !== null) storage.removeItem(LEGACY_PENDING_KEY);

  const raw = storage.getItem(pendingKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function writePending(userId: string, ids: string[]): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(pendingKey(userId), JSON.stringify(ids));
}

/** Adds a module id to the given user's outbox (idempotent). */
export function addPendingCompletion(userId: string, moduleId: string): void {
  const ids = readPendingCompletions(userId);
  if (!ids.includes(moduleId)) writePending(userId, [...ids, moduleId]);
}

/** Removes a module id from the given user's outbox once its write is confirmed. */
export function removePendingCompletion(userId: string, moduleId: string): void {
  const ids = readPendingCompletions(userId);
  if (ids.includes(moduleId)) writePending(userId, ids.filter((id) => id !== moduleId));
}

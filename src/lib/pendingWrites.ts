// A tiny durable outbox for module-completion writes that failed to reach
// Supabase (DATA-02). completeModule is optimistic; if the network write fails
// the module id is parked here (localStorage) and retried on the next
// reconcile, so a completion is never silently lost. All access is defensive:
// a missing Storage or corrupt value degrades to an empty outbox.

const PENDING_KEY = 'sprint_pending_completions';

function getStorage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

/** The module ids whose "completed" write has not yet been confirmed by the server. */
export function readPendingCompletions(): string[] {
  const storage = getStorage();
  if (!storage) return [];
  const raw = storage.getItem(PENDING_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function writePending(ids: string[]): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(PENDING_KEY, JSON.stringify(ids));
}

/** Adds a module id to the outbox (idempotent). */
export function addPendingCompletion(moduleId: string): void {
  const ids = readPendingCompletions();
  if (!ids.includes(moduleId)) writePending([...ids, moduleId]);
}

/** Removes a module id from the outbox once its write is confirmed. */
export function removePendingCompletion(moduleId: string): void {
  const ids = readPendingCompletions();
  if (ids.includes(moduleId)) writePending(ids.filter((id) => id !== moduleId));
}

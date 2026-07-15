import type { CompletedVia } from './progress';

// A tiny durable outbox for module-completion writes that failed to reach
// Supabase (DATA-02). completeModule is optimistic; if the network write fails
// the completion is parked here (localStorage) and retried on the next
// reconcile, so a completion is never silently lost. All access is defensive:
// a missing Storage or corrupt value degrades to an empty outbox.
//
// The outbox is keyed PER USER (audit D-01): a parked completion may only ever
// be replayed under the account that earned it. It deliberately survives
// sign-out — it is durable evidence of work done, and now that it is owner-keyed
// it is retried when that same user signs back in.
//
// Entry shape (U9): `{ id, via }` so a replay stamps `completed_via` exactly as
// the original write would have. Parsing is tolerant of the pre-U9 format
// (bare module-id strings): those replay with `via: null`, and the data layer
// then OMITS completed_via rather than guessing.

const PENDING_KEY_PREFIX = 'sprint_pending_completions';
// The pre-D-01 shared key. An entry here can't be attributed to a user, and
// replaying it under whoever signs in next is exactly the D-01 cross-account
// write — so it is deleted on sight and never replayed.
const LEGACY_PENDING_KEY = 'sprint_pending_completions';

/** One parked completion: the module id + how it completed (null = unknown/pre-U9). */
export interface PendingCompletion {
  id: string;
  via: CompletedVia | null;
}

const VIA_VALUES: readonly string[] = ['quiz', 'lab', 'sorter', 'explored'];

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

/** Tolerant per-entry parse: bare string (pre-U9) or `{id, via}`; anything else is dropped. */
function parseEntry(entry: unknown): PendingCompletion | null {
  if (typeof entry === 'string') return { id: entry, via: null };
  if (entry && typeof entry === 'object') {
    const { id, via } = entry as { id?: unknown; via?: unknown };
    if (typeof id !== 'string') return null;
    return { id, via: typeof via === 'string' && VIA_VALUES.includes(via) ? (via as CompletedVia) : null };
  }
  return null;
}

/** The given user's completions whose "completed" write has not yet been confirmed by the server. */
export function readPendingCompletions(userId: string): PendingCompletion[] {
  const storage = getStorage();
  if (!storage) return [];

  // One-time cleanup of the pre-D-01 shared outbox (unattributable — never replayed).
  if (storage.getItem(LEGACY_PENDING_KEY) !== null) storage.removeItem(LEGACY_PENDING_KEY);

  const raw = storage.getItem(pendingKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseEntry).filter((e): e is PendingCompletion => e !== null);
  } catch {
    return [];
  }
}

function writePending(userId: string, entries: PendingCompletion[]): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(pendingKey(userId), JSON.stringify(entries));
}

/** Parks a completion in the given user's outbox (idempotent by module id; first via wins). */
export function addPendingCompletion(
  userId: string,
  moduleId: string,
  via: CompletedVia | null,
): void {
  const entries = readPendingCompletions(userId);
  if (!entries.some((e) => e.id === moduleId)) {
    writePending(userId, [...entries, { id: moduleId, via }]);
  }
}

/** Removes a module id from the given user's outbox once its write is confirmed. */
export function removePendingCompletion(userId: string, moduleId: string): void {
  const entries = readPendingCompletions(userId);
  if (entries.some((e) => e.id === moduleId)) {
    writePending(userId, entries.filter((e) => e.id !== moduleId));
  }
}

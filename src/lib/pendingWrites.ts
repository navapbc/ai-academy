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
// Entry shape (U10): `{ id, via, epoch, eventAt }`.
//  - `via` (U9): how the completion happened, so a replay stamps
//    `completed_via` exactly as the original write would have.
//  - `epoch` (U10): the module's `progress_reset_at` CAPTURED AT COMPLETION
//    TIME (null = never reset / unknown). The replay ECHOES THIS STORED VALUE
//    and never re-derives it from freshly fetched curriculum — re-derivation
//    would stamp a post-reset epoch onto pre-reset work and silently resurrect
//    a publish-time reset (the exact bug the plan review killed).
//  - `eventAt` (U10): when the completion happened (client clock), so the
//    stale-epoch refinement can tell genuinely-new work from pre-reset work.
// Parsing is tolerant of BOTH legacy formats: pre-U9 bare module-id strings
// (→ via/epoch/eventAt all null) and U9's `{ id, via }` (→ epoch/eventAt null).
// The data layer then omits completed_via / treats the epoch as "never reset"
// rather than guessing.

const PENDING_KEY_PREFIX = 'sprint_pending_completions';
// The pre-D-01 shared key. An entry here can't be attributed to a user, and
// replaying it under whoever signs in next is exactly the D-01 cross-account
// write — so it is deleted on sight and never replayed.
const LEGACY_PENDING_KEY = 'sprint_pending_completions';

/** One parked completion: module id + via + the completion-time epoch/eventAt. */
export interface PendingCompletion {
  id: string;
  via: CompletedVia | null;
  /** Module's progress_reset_at captured at completion time (null = never reset / legacy entry). */
  epoch: string | null;
  /** When the completion happened, client clock ISO (null = legacy entry). */
  eventAt: string | null;
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

/**
 * Tolerant per-entry parse: bare string (pre-U9), `{id, via}` (U9), or the full
 * `{id, via, epoch, eventAt}` (U10); anything else is dropped. Missing or
 * malformed fields degrade to null, never to a guess.
 */
function parseEntry(entry: unknown): PendingCompletion | null {
  if (typeof entry === 'string') return { id: entry, via: null, epoch: null, eventAt: null };
  if (entry && typeof entry === 'object') {
    const { id, via, epoch, eventAt } = entry as {
      id?: unknown;
      via?: unknown;
      epoch?: unknown;
      eventAt?: unknown;
    };
    if (typeof id !== 'string') return null;
    return {
      id,
      via: typeof via === 'string' && VIA_VALUES.includes(via) ? (via as CompletedVia) : null,
      epoch: typeof epoch === 'string' ? epoch : null,
      eventAt: typeof eventAt === 'string' ? eventAt : null,
    };
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

/**
 * Parks a completion in the given user's outbox (idempotent by module id; the
 * FIRST completion's via/epoch/eventAt win — completion is monotonic and the
 * stored epoch must stay the one captured when the work actually happened).
 */
export function addPendingCompletion(
  userId: string,
  moduleId: string,
  via: CompletedVia | null,
  epoch: string | null,
  eventAt: string | null,
): void {
  const entries = readPendingCompletions(userId);
  if (!entries.some((e) => e.id === moduleId)) {
    writePending(userId, [...entries, { id: moduleId, via, epoch, eventAt }]);
  }
}

/** Removes a module id from the given user's outbox once its write is confirmed. */
export function removePendingCompletion(userId: string, moduleId: string): void {
  const entries = readPendingCompletions(userId);
  if (entries.some((e) => e.id === moduleId)) {
    writePending(userId, entries.filter((e) => e.id !== moduleId));
  }
}

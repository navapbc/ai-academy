import type { UserProgress } from '../types';

// Optional localStorage cache for UserProgress. Supabase is the source of truth
// (see P1.4); this cache exists only for instant first paint and read-only
// offline fallback. All access is defensive: a missing Storage (node/SSR) or a
// corrupt value degrades to "no cache" rather than throwing.
//
// Entries are keyed PER USER (audit D-01): a shared browser must never paint
// user A's progress for user B, so an entry that can't be attributed to the
// current user is invisible by construction.

const CACHE_KEY_PREFIX = 'sprint_progress';
// The pre-D-01 shared key (no user id). It can't be attributed to anyone, so it
// is deleted on sight and never trusted — Supabase re-hydrates the real state.
const LEGACY_CACHE_KEY = 'sprint_progress';
// Bump when the UserProgress shape changes (TYPE-06 / DATA-10). A cached value
// without this exact version — or one that fails the shape check — is discarded
// rather than trusted, so a stale/old-schema blob can't deserialize into a
// wrong-shaped object. Supabase is the source of truth, so discarding just
// triggers a reconcile.
const CACHE_VERSION = 1;

interface CacheEnvelope {
  v: number;
  progress: UserProgress;
}

function cacheKey(userId: string): string {
  return `${CACHE_KEY_PREFIX}:${userId}`;
}

function getStorage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    // Accessing localStorage can throw in some sandboxed contexts.
    return null;
  }
}

function isUserProgress(value: unknown): value is UserProgress {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.completedModuleIds) &&
    v.completedModuleIds.every((id) => typeof id === 'string') &&
    typeof v.currentModuleId === 'string'
  );
}

/** Returns the given user's cached progress, or null if absent, unavailable, stale, or corrupt. */
export function readProgressCache(userId: string): UserProgress | null {
  const storage = getStorage();
  if (!storage) return null;

  // One-time cleanup of the pre-D-01 shared entry (unattributable — never read).
  if (storage.getItem(LEGACY_CACHE_KEY) !== null) storage.removeItem(LEGACY_CACHE_KEY);

  const raw = storage.getItem(cacheKey(userId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<CacheEnvelope>;
    if (parsed?.v !== CACHE_VERSION || !isUserProgress(parsed.progress)) return null;
    return parsed.progress;
  } catch {
    return null;
  }
}

/** Mirrors the given user's progress into the cache (versioned). No-op if storage is unavailable. */
export function writeProgressCache(userId: string, progress: UserProgress): void {
  const storage = getStorage();
  if (!storage) return;
  const envelope: CacheEnvelope = { v: CACHE_VERSION, progress };
  storage.setItem(cacheKey(userId), JSON.stringify(envelope));
}

/** Drops the given user's cached progress (sign-out hygiene). Supabase re-hydrates on next sign-in. */
export function clearProgressCache(userId: string): void {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(cacheKey(userId));
}

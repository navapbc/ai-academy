import type { UserProgress } from '../types';

// Optional localStorage cache for UserProgress. Supabase is the source of truth
// (see P1.4); this cache exists only for instant first paint and read-only
// offline fallback. All access is defensive: a missing Storage (node/SSR) or a
// corrupt value degrades to "no cache" rather than throwing.

const CACHE_KEY = 'sprint_progress';
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

/** Returns the cached progress, or null if absent, unavailable, stale, or corrupt. */
export function readProgressCache(): UserProgress | null {
  const storage = getStorage();
  if (!storage) return null;

  const raw = storage.getItem(CACHE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<CacheEnvelope>;
    if (parsed?.v !== CACHE_VERSION || !isUserProgress(parsed.progress)) return null;
    return parsed.progress;
  } catch {
    return null;
  }
}

/** Mirrors the given progress into the cache (versioned). No-op if storage is unavailable. */
export function writeProgressCache(progress: UserProgress): void {
  const storage = getStorage();
  if (!storage) return;
  const envelope: CacheEnvelope = { v: CACHE_VERSION, progress };
  storage.setItem(CACHE_KEY, JSON.stringify(envelope));
}

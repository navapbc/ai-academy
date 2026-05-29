import type { UserProgress } from '../types';

// Optional localStorage cache for UserProgress. Supabase is the source of truth
// (see P1.4); this cache exists only for instant first paint and read-only
// offline fallback. All access is defensive: a missing Storage (node/SSR) or a
// corrupt value degrades to "no cache" rather than throwing.

const CACHE_KEY = 'sprint_progress';

function getStorage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    // Accessing localStorage can throw in some sandboxed contexts.
    return null;
  }
}

/** Returns the cached progress, or null if absent, unavailable, or corrupt. */
export function readProgressCache(): UserProgress | null {
  const storage = getStorage();
  if (!storage) return null;

  const raw = storage.getItem(CACHE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as UserProgress;
  } catch {
    return null;
  }
}

/** Mirrors the given progress into the cache. No-op if storage is unavailable. */
export function writeProgressCache(progress: UserProgress): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(CACHE_KEY, JSON.stringify(progress));
}

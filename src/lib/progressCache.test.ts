import { describe, test, expect, beforeEach } from 'vitest';
import { readProgressCache, writeProgressCache, clearProgressCache } from './progressCache';

// A minimal in-memory Storage stand-in so these tests run under the `node`
// environment without jsdom. progressCache reads `globalThis.localStorage`.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
}

const USER_A = 'user-aaa';
const USER_B = 'user-bbb';

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
});

describe('progressCache', () => {
  test('round-trips a UserProgress value for its owner', () => {
    const progress = { completedModuleIds: ['p1-m0', 'p1-m1'], currentModuleId: 'p1-m2' };
    writeProgressCache(USER_A, progress);
    expect(readProgressCache(USER_A)).toEqual(progress);
  });

  test('returns null when nothing is cached', () => {
    expect(readProgressCache(USER_A)).toBeNull();
  });

  test('returns null (does not throw) when the cached value is corrupt JSON', () => {
    globalThis.localStorage.setItem(`sprint_progress:${USER_A}`, '{not valid json');
    expect(readProgressCache(USER_A)).toBeNull();
  });

  // D-01: one user's cache must be invisible to another.
  test("a second user cannot read the first user's cache", () => {
    const progress = { completedModuleIds: ['1.4', '1.5'], currentModuleId: '1.6' };
    writeProgressCache(USER_A, progress);
    expect(readProgressCache(USER_B)).toBeNull();
    // ...and the owner still sees it.
    expect(readProgressCache(USER_A)).toEqual(progress);
  });

  // D-01: the pre-fix shared entry is unattributable — ignored AND removed.
  test('a legacy un-keyed entry is never read and is deleted on sight', () => {
    globalThis.localStorage.setItem(
      'sprint_progress',
      JSON.stringify({ v: 1, progress: { completedModuleIds: ['1.4'], currentModuleId: '1.5' } }),
    );
    expect(readProgressCache(USER_B)).toBeNull();
    expect(globalThis.localStorage.getItem('sprint_progress')).toBeNull();
  });

  test('clearProgressCache drops only that user\'s entry', () => {
    const progress = { completedModuleIds: ['1.4'], currentModuleId: '1.5' };
    writeProgressCache(USER_A, progress);
    writeProgressCache(USER_B, progress);
    clearProgressCache(USER_A);
    expect(readProgressCache(USER_A)).toBeNull();
    expect(readProgressCache(USER_B)).toEqual(progress);
  });
});

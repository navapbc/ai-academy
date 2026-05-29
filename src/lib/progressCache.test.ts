import { describe, test, expect, beforeEach } from 'vitest';
import { readProgressCache, writeProgressCache } from './progressCache';

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

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
});

describe('progressCache', () => {
  test('round-trips a UserProgress value', () => {
    const progress = { completedModuleIds: ['p1-m0', 'p1-m1'], currentModuleId: 'p1-m2' };
    writeProgressCache(progress);
    expect(readProgressCache()).toEqual(progress);
  });

  test('returns null when nothing is cached', () => {
    expect(readProgressCache()).toBeNull();
  });

  test('returns null (does not throw) when the cached value is corrupt JSON', () => {
    globalThis.localStorage.setItem('sprint_progress', '{not valid json');
    expect(readProgressCache()).toBeNull();
  });
});

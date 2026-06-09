import { describe, test, expect, beforeEach } from 'vitest';
import {
  addPendingCompletion,
  readPendingCompletions,
  removePendingCompletion,
} from './pendingWrites';

// In-memory Storage stand-in (node environment, no jsdom) — same pattern as
// progressCache.test.ts.
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

describe('pendingWrites outbox', () => {
  test('parks and reads back a completion for its owner (idempotent add)', () => {
    addPendingCompletion(USER_A, '1.4');
    addPendingCompletion(USER_A, '1.4');
    addPendingCompletion(USER_A, '1.5');
    expect(readPendingCompletions(USER_A)).toEqual(['1.4', '1.5']);
  });

  test('remove drops only the confirmed id', () => {
    addPendingCompletion(USER_A, '1.4');
    addPendingCompletion(USER_A, '1.5');
    removePendingCompletion(USER_A, '1.4');
    expect(readPendingCompletions(USER_A)).toEqual(['1.5']);
  });

  // D-01: a parked completion may only ever surface for the user who earned it.
  test("a second user cannot read the first user's parked completions", () => {
    addPendingCompletion(USER_A, '1.4');
    expect(readPendingCompletions(USER_B)).toEqual([]);
    expect(readPendingCompletions(USER_A)).toEqual(['1.4']);
  });

  // D-01: the pre-fix shared outbox is unattributable — dropped, never replayed.
  test('a legacy un-keyed outbox entry is never read and is deleted on sight', () => {
    globalThis.localStorage.setItem('sprint_pending_completions', JSON.stringify(['1.4']));
    expect(readPendingCompletions(USER_B)).toEqual([]);
    expect(globalThis.localStorage.getItem('sprint_pending_completions')).toBeNull();
  });

  test('degrades to an empty outbox on corrupt JSON', () => {
    globalThis.localStorage.setItem(`sprint_pending_completions:${USER_A}`, '{nope');
    expect(readPendingCompletions(USER_A)).toEqual([]);
  });
});

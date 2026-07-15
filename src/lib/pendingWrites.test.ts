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
    addPendingCompletion(USER_A, '1.4', 'quiz');
    addPendingCompletion(USER_A, '1.4', 'quiz');
    addPendingCompletion(USER_A, '1.5', 'explored');
    expect(readPendingCompletions(USER_A)).toEqual([
      { id: '1.4', via: 'quiz' },
      { id: '1.5', via: 'explored' },
    ]);
  });

  // U9: the via a completion was earned with survives the park/replay
  // round-trip so replays stamp completed_via truthfully. First via wins on a
  // duplicate add (completion is monotonic; it never re-stamps).
  test('re-adding an already-parked id keeps the first via (first completion wins)', () => {
    addPendingCompletion(USER_A, '1.4', 'lab');
    addPendingCompletion(USER_A, '1.4', 'explored');
    expect(readPendingCompletions(USER_A)).toEqual([{ id: '1.4', via: 'lab' }]);
  });

  test('remove drops only the confirmed id', () => {
    addPendingCompletion(USER_A, '1.4', 'quiz');
    addPendingCompletion(USER_A, '1.5', 'sorter');
    removePendingCompletion(USER_A, '1.4');
    expect(readPendingCompletions(USER_A)).toEqual([{ id: '1.5', via: 'sorter' }]);
  });

  // D-01: a parked completion may only ever surface for the user who earned it.
  test("a second user cannot read the first user's parked completions", () => {
    addPendingCompletion(USER_A, '1.4', 'quiz');
    expect(readPendingCompletions(USER_B)).toEqual([]);
    expect(readPendingCompletions(USER_A)).toEqual([{ id: '1.4', via: 'quiz' }]);
  });

  // U9 backward compatibility: pre-U9 outbox entries were bare module-id
  // strings. They parse as via:null (the data layer then omits completed_via
  // rather than guessing) and are never dropped.
  test('legacy bare-string entries are tolerated and read back with via:null', () => {
    globalThis.localStorage.setItem(
      `sprint_pending_completions:${USER_A}`,
      JSON.stringify(['1.4', { id: '1.5', via: 'lab' }]),
    );
    expect(readPendingCompletions(USER_A)).toEqual([
      { id: '1.4', via: null },
      { id: '1.5', via: 'lab' },
    ]);
  });

  test('an unknown via value degrades to null; garbage entries are dropped', () => {
    globalThis.localStorage.setItem(
      `sprint_pending_completions:${USER_A}`,
      JSON.stringify([{ id: '1.4', via: 'telepathy' }, 42, { via: 'lab' }, null]),
    );
    expect(readPendingCompletions(USER_A)).toEqual([{ id: '1.4', via: null }]);
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

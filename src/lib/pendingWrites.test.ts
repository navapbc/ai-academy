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

const EPOCH = '2026-07-10T00:00:00.000Z';
const EVENT_AT = '2026-07-12T09:30:00.000Z';

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
});

describe('pendingWrites outbox', () => {
  test('parks and reads back a completion for its owner (idempotent add)', () => {
    addPendingCompletion(USER_A, '1.4', 'quiz', EPOCH, EVENT_AT);
    addPendingCompletion(USER_A, '1.4', 'quiz', EPOCH, EVENT_AT);
    addPendingCompletion(USER_A, '1.5', 'explored', null, EVENT_AT);
    expect(readPendingCompletions(USER_A)).toEqual([
      { id: '1.4', via: 'quiz', epoch: EPOCH, eventAt: EVENT_AT },
      { id: '1.5', via: 'explored', epoch: null, eventAt: EVENT_AT },
    ]);
  });

  // U9/U10: the via AND the completion-time epoch/eventAt survive the
  // park/replay round-trip. First add wins on a duplicate (completion is
  // monotonic; the stored epoch must stay the one the work happened under).
  test('re-adding an already-parked id keeps the first via/epoch/eventAt (first completion wins)', () => {
    addPendingCompletion(USER_A, '1.4', 'lab', EPOCH, EVENT_AT);
    addPendingCompletion(USER_A, '1.4', 'explored', '2026-07-14T00:00:00.000Z', '2026-07-14T01:00:00.000Z');
    expect(readPendingCompletions(USER_A)).toEqual([
      { id: '1.4', via: 'lab', epoch: EPOCH, eventAt: EVENT_AT },
    ]);
  });

  test('remove drops only the confirmed id', () => {
    addPendingCompletion(USER_A, '1.4', 'quiz', EPOCH, EVENT_AT);
    addPendingCompletion(USER_A, '1.5', 'sorter', null, EVENT_AT);
    removePendingCompletion(USER_A, '1.4');
    expect(readPendingCompletions(USER_A)).toEqual([
      { id: '1.5', via: 'sorter', epoch: null, eventAt: EVENT_AT },
    ]);
  });

  // D-01: a parked completion may only ever surface for the user who earned it.
  test("a second user cannot read the first user's parked completions", () => {
    addPendingCompletion(USER_A, '1.4', 'quiz', EPOCH, EVENT_AT);
    expect(readPendingCompletions(USER_B)).toEqual([]);
    expect(readPendingCompletions(USER_A)).toEqual([
      { id: '1.4', via: 'quiz', epoch: EPOCH, eventAt: EVENT_AT },
    ]);
  });

  // Backward compatibility (U10): BOTH legacy shapes parse tolerantly —
  // pre-U9 bare module-id strings (via/epoch/eventAt all null) and U9's
  // {id, via} (epoch/eventAt null). Null epoch means "module never reset as
  // far as this entry knows"; the DB trigger adjudicates on replay.
  test('legacy bare-string and U9 {id,via} entries are tolerated with null epoch/eventAt', () => {
    globalThis.localStorage.setItem(
      `sprint_pending_completions:${USER_A}`,
      JSON.stringify(['1.4', { id: '1.5', via: 'lab' }, { id: '1.6', via: 'quiz', epoch: EPOCH, eventAt: EVENT_AT }]),
    );
    expect(readPendingCompletions(USER_A)).toEqual([
      { id: '1.4', via: null, epoch: null, eventAt: null },
      { id: '1.5', via: 'lab', epoch: null, eventAt: null },
      { id: '1.6', via: 'quiz', epoch: EPOCH, eventAt: EVENT_AT },
    ]);
  });

  test('an unknown via degrades to null; malformed epoch/eventAt degrade to null; garbage entries are dropped', () => {
    globalThis.localStorage.setItem(
      `sprint_pending_completions:${USER_A}`,
      JSON.stringify([
        { id: '1.4', via: 'telepathy', epoch: 42, eventAt: { nested: true } },
        42,
        { via: 'lab' },
        null,
      ]),
    );
    expect(readPendingCompletions(USER_A)).toEqual([
      { id: '1.4', via: null, epoch: null, eventAt: null },
    ]);
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

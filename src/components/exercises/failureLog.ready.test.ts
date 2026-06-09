import { describe, test, expect } from 'vitest';
import { evaluateFailureLogReadiness, blankFailureEntry, type FailureEntry } from './failureLog.ready';
import type { FailureLogConfig } from '../../types';

// Pure submit-gate for the 2.9 failure log (P4.9): at least `minEntries` complete
// dated entries. `targetEntries` is a display-only goal and is NOT enforced.
const config: FailureLogConfig = {
  kind: 'failure-log',
  title: 'Failure log',
  helper: '',
  minEntries: 3,
  targetEntries: 6,
  taskPlaceholder: '',
  errorPlaceholder: '',
  caughtPlaceholder: '',
  tellPlaceholder: '',
};

const entry = (n: number): FailureEntry => ({
  date: `2026-03-0${n}`,
  task: `task ${n}`,
  error: `error ${n}`,
  caught: `caught ${n}`,
  tell: `tell ${n}`,
});

describe('evaluateFailureLogReadiness', () => {
  test('exactly minEntries complete entries → ready', () => {
    const r = evaluateFailureLogReadiness([entry(1), entry(2), entry(3)], config);
    expect(r.ready).toBe(true);
    expect(r.reasons).toEqual([]);
    expect(r.completeEntries).toBe(3);
  });

  test('below minEntries → not ready, says how many more are needed', () => {
    const r = evaluateFailureLogReadiness([entry(1)], config);
    expect(r.ready).toBe(false);
    expect(r.completeEntries).toBe(1);
    expect(r.reasons.some((x) => /Add 2 more complete entries/.test(x))).toBe(true);
  });

  test('an entry missing any field (incl. the date) does not count', () => {
    const noDate = { ...entry(2), date: '' };
    const noTell = { ...entry(3), tell: '   ' };
    const r = evaluateFailureLogReadiness([entry(1), noDate, noTell], config);
    expect(r.completeEntries).toBe(1);
    expect(r.ready).toBe(false);
  });

  test('targetEntries is not enforced — minEntries (3) is ready even below the target (6)', () => {
    const r = evaluateFailureLogReadiness([entry(1), entry(2), entry(3)], config);
    expect(r.ready).toBe(true);
  });

  test('a blank entry contributes nothing', () => {
    const r = evaluateFailureLogReadiness([blankFailureEntry()], config);
    expect(r.completeEntries).toBe(0);
    expect(r.ready).toBe(false);
  });
});

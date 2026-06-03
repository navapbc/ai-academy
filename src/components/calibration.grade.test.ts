import { describe, test, expect } from 'vitest';
import { gradeCalibration } from './calibration.grade';
import type { CalibrationConfig } from '../types';

// Scale ordered most-trusting (0) → least-trusting (3).
const config: Pick<CalibrationConfig, 'scale' | 'items'> = {
  scale: [
    { id: 'use-as-is', label: 'Use as-is' },
    { id: 'light-check', label: 'Light check' },
    { id: 'verify-key', label: 'Verify key claims' },
    { id: 'dont-rely', label: "Don't rely" },
  ],
  items: [
    { id: 'a', task: 'tidy a list', target: 'use-as-is', why: 'w' },
    { id: 'b', task: 'summarize a manual', target: 'verify-key', why: 'w' },
    { id: 'c', task: 'eligibility ruling', target: 'dont-rely', why: 'w' },
  ],
};

describe('gradeCalibration', () => {
  test('all calibrated → full score, allCalibrated, summary all-calibrated', () => {
    const g = gradeCalibration({ a: 'use-as-is', b: 'verify-key', c: 'dont-rely' }, config);
    expect(g.score).toBe(3);
    expect(g.total).toBe(3);
    expect(g.allCalibrated).toBe(true);
    expect(g.summary).toEqual({ calibrated: 3, over: 0, under: 0, unanswered: 0 });
    expect(g.results.every((r) => r.gap === 0)).toBe(true);
  });

  test('a too-trusting pick on a high-risk item is OVER-reliance (negative gap)', () => {
    // c target is dont-rely (idx 3); picking use-as-is (idx 0) → gap -3, over.
    const g = gradeCalibration({ a: 'use-as-is', b: 'verify-key', c: 'use-as-is' }, config);
    const c = g.results.find((r) => r.id === 'c')!;
    expect(c.result).toBe('over');
    expect(c.gap).toBe(-3);
    expect(g.summary.over).toBe(1);
    expect(g.score).toBe(2);
  });

  test('an over-verifying pick on a safe item is UNDER-reliance (positive gap)', () => {
    // a target is use-as-is (idx 0); picking dont-rely (idx 3) → gap +3, under.
    const g = gradeCalibration({ a: 'dont-rely', b: 'verify-key', c: 'dont-rely' }, config);
    const a = g.results.find((r) => r.id === 'a')!;
    expect(a.result).toBe('under');
    expect(a.gap).toBe(3);
    expect(g.summary.under).toBe(1);
    expect(g.score).toBe(2);
  });

  test('mixed over + under + calibrated', () => {
    const g = gradeCalibration({ a: 'light-check', b: 'verify-key', c: 'verify-key' }, config);
    // a: +1 under; b: 0 calibrated; c: -1 over
    expect(g.summary).toEqual({ calibrated: 1, over: 1, under: 1, unanswered: 0 });
    expect(g.score).toBe(1);
    expect(g.allCalibrated).toBe(false);
  });

  test('a missing pick is unanswered: null gap, counted in neither over nor under', () => {
    const g = gradeCalibration({ a: 'use-as-is', b: 'verify-key' }, config);
    const c = g.results.find((r) => r.id === 'c')!;
    expect(c.result).toBe('unanswered');
    expect(c.pickedIndex).toBeNull();
    expect(c.gap).toBeNull();
    expect(g.summary).toEqual({ calibrated: 2, over: 0, under: 0, unanswered: 1 });
    expect(g.score).toBe(2);
  });
});

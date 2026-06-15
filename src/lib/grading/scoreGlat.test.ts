import { describe, test, expect } from 'vitest';
import { scoreGlat, type GlatResponses } from './scoreGlat';
import type { GlatConfig } from '../../types';

// 5 scored items so the 0.8 threshold lands on a clean boundary: 4/5 = 0.8 passes,
// 3/5 = 0.6 fails. Correct index is the item's position mod options for variety.
const CONFIG: GlatConfig = {
  kind: 'glat',
  passThreshold: 0.8,
  sectionA: [
    { id: 'A1', prompt: 'How confident are you?' },
    { id: 'A2', prompt: 'How often do you decline AI?' },
  ],
  sectionBC: [
    { id: 'B1', question: 'q1', options: ['a', 'b'], correctIndex: 0, rationale: 'r1' },
    { id: 'B2', question: 'q2', options: ['a', 'b'], correctIndex: 1, rationale: 'r2' },
    { id: 'B3', question: 'q3', options: ['a', 'b', 'c'], correctIndex: 2, rationale: 'r3' },
    { id: 'C1', question: 'q4', options: ['a', 'b'], correctIndex: 0, rationale: 'r4' },
    { id: 'C2', question: 'q5', options: ['a', 'b'], correctIndex: 1, rationale: 'r5' },
  ],
};

const allCorrect: GlatResponses = {
  sectionA: { A1: 5, A2: 3 },
  sectionBC: { B1: 0, B2: 1, B3: 2, C1: 0, C2: 1 },
};

describe('scoreGlat', () => {
  test('all correct → 5/5, passes', () => {
    const r = scoreGlat(CONFIG, allCorrect);
    expect(r.correct).toBe(5);
    expect(r.total).toBe(5);
    expect(r.pct).toBeCloseTo(1, 6);
    expect(r.passed).toBe(true);
    expect(r.perItem).toHaveLength(5);
  });

  test('4/5 = 0.8 is exactly passing (boundary)', () => {
    const r = scoreGlat(CONFIG, { ...allCorrect, sectionBC: { B1: 0, B2: 1, B3: 2, C1: 0, C2: 0 } });
    expect(r.correct).toBe(4);
    expect(r.pct).toBeCloseTo(0.8, 6);
    expect(r.passed).toBe(true);
  });

  test('3/5 = 0.6 fails', () => {
    const r = scoreGlat(CONFIG, { ...allCorrect, sectionBC: { B1: 0, B2: 1, B3: 2, C1: 9, C2: 9 } });
    expect(r.correct).toBe(3);
    expect(r.passed).toBe(false);
  });

  test('unanswered scored items count as incorrect (selected: null)', () => {
    const r = scoreGlat(CONFIG, { sectionA: {}, sectionBC: { B1: 0 } });
    expect(r.correct).toBe(1);
    expect(r.passed).toBe(false);
    const b2 = r.perItem.find((i) => i.id === 'B2')!;
    expect(b2.selected).toBeNull();
    expect(b2.isCorrect).toBe(false);
  });

  test('Section A never affects scoring', () => {
    const withCrazyA = { ...allCorrect, sectionA: { A1: 1, A2: 1 } };
    expect(scoreGlat(CONFIG, withCrazyA).correct).toBe(5);
    expect(scoreGlat(CONFIG, withCrazyA).passed).toBe(true);
  });
});

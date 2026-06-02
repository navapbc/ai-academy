import { describe, test, expect } from 'vitest';
import { autoGrade } from './autoGrade';

const key = [
  { id: 'a', label: 'A', correct: 1 },
  { id: 'b', label: 'B', correct: 2 },
];

describe('autoGrade', () => {
  test('all correct → full marks, grader auto', () => {
    const r = autoGrade({ a: 1, b: 2 }, key);
    expect(r.grader).toBe('auto');
    expect(r.overall).toBe(4);
    expect(r.maxOverall).toBe(4);
    expect(r.perAnchor[0]).toEqual({ id: 'a', label: 'A', score: 2, max: 2, rationale: 'Correct.' });
  });

  test('a wrong answer scores that anchor 0', () => {
    const r = autoGrade({ a: 0, b: 2 }, key);
    expect(r.overall).toBe(2);
    expect(r.perAnchor[0].score).toBe(0);
    expect(r.perAnchor[0].rationale).toBe('Incorrect.');
  });

  test('a missing answer scores 0', () => {
    const r = autoGrade({ a: 1 }, key);
    expect(r.overall).toBe(2);
    expect(r.perAnchor[1].score).toBe(0);
  });
});

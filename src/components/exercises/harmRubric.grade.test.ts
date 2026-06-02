import { describe, test, expect } from 'vitest';
import { gradeHarmRubric } from './harmRubric.grade';
import type { HarmRubricConfig } from '../../types';

const scenarios: HarmRubricConfig['scenarios'] = [
  { id: 'a', text: 'A', correct: 'opacity', why: 'w' },
  { id: 'b', text: 'B', correct: 'exclusion', why: 'w' },
];

describe('gradeHarmRubric', () => {
  test('all correct → allCorrect true', () => {
    const g = gradeHarmRubric({ a: 'opacity', b: 'exclusion' }, scenarios);
    expect(g.total).toBe(2);
    expect(g.correctIds.sort()).toEqual(['a', 'b']);
    expect(g.allCorrect).toBe(true);
  });

  test('a wrong pick is excluded and allCorrect false', () => {
    const g = gradeHarmRubric({ a: 'opacity', b: 'opacity' }, scenarios);
    expect(g.correctIds).toEqual(['a']);
    expect(g.allCorrect).toBe(false);
  });

  test('a missing pick counts as not correct', () => {
    const g = gradeHarmRubric({ a: 'opacity' }, scenarios);
    expect(g.correctIds).toEqual(['a']);
    expect(g.allCorrect).toBe(false);
  });
});

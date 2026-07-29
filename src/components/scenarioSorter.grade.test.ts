import { describe, test, expect } from 'vitest';
import { gradeScenarios } from './scenarioSorter.grade';
import type { SorterScenario } from '../types';

const scenarios: SorterScenario[] = [
  { id: 'a', text: 'A', correct: 'delegate', rationale: 'r' },
  { id: 'b', text: 'B', correct: 'human-only', rationale: 'r' },
  { id: 'c', text: 'C', correct: 'refuse', rationale: 'r' },
];

describe('gradeScenarios', () => {
  test('all correct → allCorrect true, every id in correctIds', () => {
    const g = gradeScenarios({ a: 'delegate', b: 'human-only', c: 'refuse' }, scenarios);
    expect(g.total).toBe(3);
    expect(g.correctIds.sort()).toEqual(['a', 'b', 'c']);
    expect(g.allCorrect).toBe(true);
  });

  test('a wrong pick → flagged out of correctIds, allCorrect false', () => {
    const g = gradeScenarios({ a: 'delegate', b: 'assist', c: 'refuse' }, scenarios);
    expect(g.correctIds).toEqual(['a', 'c']);
    expect(g.allCorrect).toBe(false);
  });

  test('a missing assignment counts as not correct', () => {
    const g = gradeScenarios({ a: 'delegate' }, scenarios);
    expect(g.correctIds).toEqual(['a']);
    expect(g.allCorrect).toBe(false);
  });
});

// An empty scenario list is a misconfigured exercise, not a perfect score.
test('an empty scenario list is not allCorrect', () => {
  const g = gradeScenarios({}, []);
  expect(g.allCorrect).toBe(false);
  expect(g.total).toBe(0);
  expect(g.correctIds).toEqual([]);
});

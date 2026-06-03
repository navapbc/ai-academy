import { describe, test, expect } from 'vitest';
import { gradeOutputAudit } from './outputAudit.grade';
import type { OutputAuditConfig } from '../types';

const claims: OutputAuditConfig['claims'] = [
  { id: 'a', text: 'A real, cited rule', status: 'supported', why: 'w' },
  { id: 'b', text: 'An invented subsection', status: 'fabricated', why: 'w' },
  { id: 'c', text: 'An unsourced statistic', status: 'fabricated', why: 'w' },
];

describe('gradeOutputAudit', () => {
  test('all correct → full score, allCorrect true, every id in correctIds', () => {
    const g = gradeOutputAudit({ a: 'supported', b: 'fabricated', c: 'fabricated' }, claims);
    expect(g.total).toBe(3);
    expect(g.score).toBe(3);
    expect(g.correctIds.sort()).toEqual(['a', 'b', 'c']);
    expect(g.allCorrect).toBe(true);
    expect(g.results.every((r) => r.correct)).toBe(true);
  });

  test('mixed → only matching verdicts count; allCorrect false', () => {
    // a wrong (called it fabricated), b right, c wrong (called it supported)
    const g = gradeOutputAudit({ a: 'fabricated', b: 'fabricated', c: 'supported' }, claims);
    expect(g.score).toBe(1);
    expect(g.correctIds).toEqual(['b']);
    expect(g.allCorrect).toBe(false);
    expect(g.results.find((r) => r.id === 'a')).toMatchObject({ picked: 'fabricated', correct: false });
  });

  test('all wrong → score 0', () => {
    const g = gradeOutputAudit({ a: 'fabricated', b: 'supported', c: 'supported' }, claims);
    expect(g.score).toBe(0);
    expect(g.correctIds).toEqual([]);
    expect(g.allCorrect).toBe(false);
  });

  test('a missing pick counts as not correct and is recorded as null', () => {
    const g = gradeOutputAudit({ a: 'supported', b: 'fabricated' }, claims);
    expect(g.score).toBe(2);
    expect(g.correctIds.sort()).toEqual(['a', 'b']);
    expect(g.results.find((r) => r.id === 'c')).toMatchObject({ picked: null, correct: false });
  });
});

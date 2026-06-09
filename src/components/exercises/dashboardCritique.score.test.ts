import { describe, test, expect } from 'vitest';
import { scoreDashboardCritique } from './dashboardCritique.score';

// Two hidden signals (h1, h2 — the answer key) + one visible decoy (d1).
const signals = [
  { id: 'h1', hidden: true },
  { id: 'd1', hidden: false },
  { id: 'h2', hidden: true },
];

describe('scoreDashboardCritique', () => {
  test('all hidden named, no decoy flagged → all correct', () => {
    expect(scoreDashboardCritique({ selectedIds: ['h1', 'h2'], signals })).toEqual({
      correct: ['h1', 'h2'],
      missed: [],
      falseFlags: [],
      hiddenTotal: 2,
      namedCount: 2,
    });
  });

  test('one hidden missed → it lands in missed', () => {
    expect(scoreDashboardCritique({ selectedIds: ['h1'], signals })).toEqual({
      correct: ['h1'],
      missed: ['h2'],
      falseFlags: [],
      hiddenTotal: 2,
      namedCount: 1,
    });
  });

  test('a decoy flagged → it lands in falseFlags', () => {
    expect(scoreDashboardCritique({ selectedIds: ['h1', 'h2', 'd1'], signals })).toEqual({
      correct: ['h1', 'h2'],
      missed: [],
      falseFlags: ['d1'],
      hiddenTotal: 2,
      namedCount: 2,
    });
  });

  test('empty selection → all hidden missed, nothing correct or falsely flagged', () => {
    expect(scoreDashboardCritique({ selectedIds: [], signals })).toEqual({
      correct: [],
      missed: ['h1', 'h2'],
      falseFlags: [],
      hiddenTotal: 2,
      namedCount: 0,
    });
  });

  test('all selected → all hidden correct, all decoys false-flagged', () => {
    expect(scoreDashboardCritique({ selectedIds: ['h1', 'd1', 'h2'], signals })).toEqual({
      correct: ['h1', 'h2'],
      missed: [],
      falseFlags: ['d1'],
      hiddenTotal: 2,
      namedCount: 2,
    });
  });

  test('buckets follow config order, and unknown ids are ignored', () => {
    // selection order differs from config order; 'zzz' is not a real signal.
    expect(scoreDashboardCritique({ selectedIds: ['h2', 'zzz', 'h1'], signals })).toEqual({
      correct: ['h1', 'h2'],
      missed: [],
      falseFlags: [],
      hiddenTotal: 2,
      namedCount: 2,
    });
  });
});

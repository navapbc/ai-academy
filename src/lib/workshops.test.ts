import { describe, test, expect } from 'vitest';
import { workshopProgress, mapRowToWorkshop } from './workshops';

// Pure progress derivation for workshops (X.3 Unit 4, R5). Workshop progress is
// DERIVED from the learner's completed module ids — no stored state — so these
// exercise the counting rules without any DB/React.

describe('workshopProgress', () => {
  test('all steps complete → completed === total', () => {
    const r = workshopProgress(['2.6', '2.7', '2.10'], ['2.6', '2.7', '2.10']);
    expect(r).toEqual({ completed: 3, total: 3 });
  });

  test('no steps complete → 0 of total', () => {
    const r = workshopProgress(['2.6', '2.7'], []);
    expect(r).toEqual({ completed: 0, total: 2 });
  });

  test('partial completion counts only the completed steps', () => {
    const r = workshopProgress(['2.6', '2.7', '2.10'], ['2.6', '2.10']);
    expect(r).toEqual({ completed: 2, total: 3 });
  });

  test('completed ids outside the workshop steps are not counted', () => {
    const r = workshopProgress(['2.6', '2.7'], ['1.1', '1.2', '2.6', '9.9']);
    expect(r).toEqual({ completed: 1, total: 2 });
  });

  test('empty steps → 0 of 0 (defined, non-crashing state)', () => {
    expect(workshopProgress([], ['1.1'])).toEqual({ completed: 0, total: 0 });
    expect(workshopProgress([], [])).toEqual({ completed: 0, total: 0 });
  });

  test('duplicate step ids are counted once (a path, not a tally)', () => {
    expect(workshopProgress(['2.6', '2.6', '2.7'], ['2.6'])).toEqual({
      completed: 1,
      total: 2,
    });
  });

  test('accepts a Set of completed ids as well as an array', () => {
    const r = workshopProgress(['2.6', '2.7'], new Set(['2.7']));
    expect(r).toEqual({ completed: 1, total: 2 });
  });
});

describe('mapRowToWorkshop', () => {
  test('maps a row and defaults null intro / step_cell_ids', () => {
    expect(
      mapRowToWorkshop({ id: 'w1', title: 'Writing with AI', intro: null, step_cell_ids: null }),
    ).toEqual({ id: 'w1', title: 'Writing with AI', intro: null, stepCellIds: [] });
  });

  test('preserves step order and intro', () => {
    expect(
      mapRowToWorkshop({
        id: 'w2',
        title: 'Path',
        intro: 'Intro copy',
        step_cell_ids: ['2.6', '2.7', '2.10'],
      }),
    ).toEqual({ id: 'w2', title: 'Path', intro: 'Intro copy', stepCellIds: ['2.6', '2.7', '2.10'] });
  });
});

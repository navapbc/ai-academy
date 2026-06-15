import { describe, test, expect } from 'vitest';
import {
  buildCohortSummaries,
  pivotDistribution,
  type CohortSummaryRow,
  type CohortNameRow,
  type DistributionRow,
} from './dashboard';

describe('buildCohortSummaries', () => {
  const names: CohortNameRow[] = [
    { id: 'c-b', name: 'Beta cohort' },
    { id: 'c-a', name: 'Alpha cohort' },
  ];

  test('drops the NULL-cohort group, coerces numeric strings, sorts by name', () => {
    const rows: CohortSummaryRow[] = [
      {
        cohort_id: 'c-b',
        learner_count: 4,
        avg_completion_pct: '0.5',
        glat_pass_rate: '0',
        avg_quiz_pct: '0.82',
        reviewable_total: 2,
      },
      {
        cohort_id: 'c-a',
        learner_count: 3,
        avg_completion_pct: '0.333333',
        glat_pass_rate: null,
        avg_quiz_pct: null,
        reviewable_total: 0,
      },
      {
        cohort_id: null,
        learner_count: 9,
        avg_completion_pct: '0.1',
        glat_pass_rate: '0',
        avg_quiz_pct: '0.1',
        reviewable_total: 5,
      },
    ];

    const result = buildCohortSummaries(rows, names);

    expect(result.map((c) => c.cohortId)).toEqual(['c-a', 'c-b']);
    expect(result[0]).toEqual({
      cohortId: 'c-a',
      cohortName: 'Alpha cohort',
      learnerCount: 3,
      avgCompletionPct: 0.333333,
      glatPassRate: null,
      avgQuizPct: null,
      reviewableTotal: 0,
    });
    expect(result[1].avgCompletionPct).toBe(0.5);
    expect(result[1].glatPassRate).toBe(0);
  });

  test('falls back to a placeholder name when a cohort id has no name row', () => {
    const rows: CohortSummaryRow[] = [
      { cohort_id: 'c-x', learner_count: 1, avg_completion_pct: '0', glat_pass_rate: '0', avg_quiz_pct: null, reviewable_total: 0 },
    ];
    expect(buildCohortSummaries(rows, []).at(0)?.cohortName).toBe('Unnamed cohort');
  });
});

describe('pivotDistribution', () => {
  test('pivots (cohort, band, count) rows into per-cohort band maps, missing bands = 0', () => {
    const rows: DistributionRow[] = [
      { cohort_id: 'c-a', band: 'lt60', learner_count: 2 },
      { cohort_id: 'c-a', band: '80to100', learner_count: 5 },
      { cohort_id: 'c-b', band: '60to79', learner_count: 1 },
      { cohort_id: null, band: 'lt60', learner_count: 9 },
    ];

    const result = pivotDistribution(rows);

    expect(result.get('c-a')).toEqual({ lt60: 2, '60to79': 0, '80to100': 5 });
    expect(result.get('c-b')).toEqual({ lt60: 0, '60to79': 1, '80to100': 0 });
    expect(result.has('')).toBe(false);
    expect(result.has('null')).toBe(false);
  });
});

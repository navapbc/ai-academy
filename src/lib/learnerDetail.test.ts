import { describe, test, expect } from 'vitest';
import {
  buildLearnerRoster,
  buildLearnerModuleRows,
  buildLearnerLabRows,
  type LearnerSummaryRow,
  type ProfileNameRow,
  type PublishedModuleRow,
  type ModuleProgressRow,
  type QuizAttemptRow,
  type LabSubmissionRow,
} from './learnerDetail';

describe('buildLearnerRoster', () => {
  const rows: LearnerSummaryRow[] = [
    {
      user_id: 'u-2',
      cohort_id: 'c-a',
      completion_pct: '0.5',
      avg_quiz_pct: '0.82',
      glat_passed: true,
      reviewable_labs: 1,
    },
    {
      user_id: 'u-1',
      cohort_id: 'c-a',
      completion_pct: null,
      avg_quiz_pct: null,
      glat_passed: false,
      reviewable_labs: 0,
    },
  ];

  test('joins names, coerces numeric strings, and sorts by display name', () => {
    const names: ProfileNameRow[] = [
      { id: 'u-1', full_name: 'Ada Lovelace', email: 'ada@navapbc.com' },
      { id: 'u-2', full_name: 'Zoe Park', email: 'zoe@navapbc.com' },
    ];
    const out = buildLearnerRoster(rows, names);

    expect(out.map((l) => l.name)).toEqual(['Ada Lovelace', 'Zoe Park']);
    expect(out[0]).toMatchObject({ userId: 'u-1', completionPct: null, glatPassed: false });
    expect(out[1]).toMatchObject({ userId: 'u-2', completionPct: 0.5, avgQuizPct: 0.82 });
  });

  test('falls back to email, then a short id, when a name is missing', () => {
    const names: ProfileNameRow[] = [
      { id: 'u-2', full_name: '   ', email: 'zoe@navapbc.com' }, // blank name → email
      // u-1 has no profile row at all → id fallback
    ];
    const out = buildLearnerRoster(rows, names);
    const byId = new Map(out.map((l) => [l.userId, l]));

    expect(byId.get('u-2')!.name).toBe('zoe@navapbc.com');
    expect(byId.get('u-1')!.name).toBe('Learner u-1');
    expect(byId.get('u-1')!.email).toBeNull();
  });
});

describe('buildLearnerModuleRows', () => {
  const modules: PublishedModuleRow[] = [
    { cell_id: '1.1', title: 'Intro', stage: '1a' },
    { cell_id: '1.2', title: 'Data', stage: '1a' },
    { cell_id: '2.1', title: 'Prompting', stage: '2' },
  ];

  test('marks completion, picks the best quiz fraction, and keeps module order', () => {
    const progress: ModuleProgressRow[] = [
      { module_id: '1.1', status: 'completed' },
      { module_id: '1.2', status: 'in_progress' },
    ];
    const quizzes: QuizAttemptRow[] = [
      { module_id: '1.1', score: 2, max_score: 4, passed: false }, // 0.5
      { module_id: '1.1', score: 4, max_score: 4, passed: true }, // 1.0 — best wins
      { module_id: '2.1', score: 3, max_score: 5, passed: true }, // 0.6
    ];
    const out = buildLearnerModuleRows(modules, progress, quizzes);

    expect(out.map((r) => r.cellId)).toEqual(['1.1', '1.2', '2.1']);
    expect(out[0]).toMatchObject({ completed: true, bestQuizPct: 1, quizPassed: true });
    expect(out[1]).toMatchObject({ completed: false, bestQuizPct: null, quizPassed: null });
    expect(out[2]).toMatchObject({ completed: false, bestQuizPct: 0.6, quizPassed: true });
  });

  test('ignores attempts with no usable max_score', () => {
    const quizzes: QuizAttemptRow[] = [
      { module_id: '1.1', score: 5, max_score: 0, passed: true },
      { module_id: '1.1', score: null, max_score: 4, passed: null },
    ];
    const out = buildLearnerModuleRows(modules, [], quizzes);
    expect(out[0].bestQuizPct).toBeNull();
  });
});

describe('buildLearnerLabRows', () => {
  test('maps rows and sorts newest-first', () => {
    const rows: LabSubmissionRow[] = [
      { id: 'a', lab_id: 'lab-2.1', status: 'reviewable', created_at: '2026-01-01T00:00:00Z' },
      { id: 'b', lab_id: 'lab-2.2', status: 'reviewed', created_at: '2026-02-01T00:00:00Z' },
    ];
    const out = buildLearnerLabRows(rows);
    expect(out.map((l) => l.id)).toEqual(['b', 'a']);
    expect(out[0]).toMatchObject({ labId: 'lab-2.2', status: 'reviewed' });
  });
});

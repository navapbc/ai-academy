import { describe, test, expect } from 'vitest';
import { summarizeOwnProgress } from './learnerSelf';
import type { LearnerDetailData, LearnerModuleRow, LearnerLabRow } from './learnerDetail';

function mod(p: Partial<LearnerModuleRow> & { cellId: string }): LearnerModuleRow {
  return {
    cellId: p.cellId,
    title: p.title ?? p.cellId,
    origin: p.origin ?? 'course',
    section: p.section ?? 'Course lessons',
    completed: p.completed ?? false,
    bestQuizPct: p.bestQuizPct ?? null,
    quizPassed: p.quizPassed ?? null,
  };
}
function lab(p: Partial<LearnerLabRow> & { id: string }): LearnerLabRow {
  return {
    id: p.id,
    labId: p.labId ?? `lab-${p.id}`,
    status: p.status ?? null,
    createdAt: p.createdAt ?? '2026-01-01T00:00:00Z',
  };
}

describe('summarizeOwnProgress — course tier', () => {
  test('completion counts only origin=course modules', () => {
    const detail: LearnerDetailData = {
      modules: [
        mod({ cellId: 'c1-w0-a', origin: 'course', completed: true }),
        mod({ cellId: 'c1-w0-b', origin: 'course', completed: false }),
        mod({ cellId: '1.1', origin: 'matrix', completed: true }),
        mod({ cellId: 'custom-x', origin: 'custom', completed: true }),
      ],
      labs: [],
    };
    const s = summarizeOwnProgress(detail);
    expect(s.course).toMatchObject({ completedCount: 1, totalCount: 2, completionPct: 0.5 });
  });

  test('labsCompleted counts distinct lab ids among course-origin modules only', () => {
    const detail: LearnerDetailData = {
      modules: [
        mod({ cellId: 'c1-w1-a', origin: 'course' }),
        mod({ cellId: '1.1', origin: 'matrix' }),
      ],
      labs: [
        lab({ id: 'a', labId: 'c1-w1-a' }),
        lab({ id: 'b', labId: 'c1-w1-a' }), // resubmit — same lab, must not double-count
        lab({ id: 'c', labId: '1.1' }), // supplemental lab — must not count here
      ],
    };
    const s = summarizeOwnProgress(detail);
    expect(s.course.labsCompleted).toBe(1);
  });

  test('empty course tier when there are no course-origin modules (unenrolled learner)', () => {
    const detail: LearnerDetailData = {
      modules: [mod({ cellId: '1.1', origin: 'matrix', completed: true })],
      labs: [],
    };
    const s = summarizeOwnProgress(detail);
    expect(s.course).toMatchObject({
      completedCount: 0,
      totalCount: 0,
      completionPct: null,
      labsCompleted: 0,
    });
  });
});

describe('summarizeOwnProgress — supplemental tier', () => {
  test('completion combines matrix and custom, excludes course', () => {
    const detail: LearnerDetailData = {
      modules: [
        mod({ cellId: 'c1-w0-a', origin: 'course', completed: true }),
        mod({ cellId: '1.1', origin: 'matrix', completed: true }),
        mod({ cellId: '1.2', origin: 'matrix', completed: false }),
        mod({ cellId: 'custom-x', origin: 'custom', completed: true }),
      ],
      labs: [],
    };
    const s = summarizeOwnProgress(detail);
    expect(s.supplemental.completedCount).toBe(2);
    expect(s.supplemental.totalCount).toBe(3);
    expect(s.supplemental.completionPct).toBeCloseTo(2 / 3, 5);
  });

  test('avg quiz score is scoped to supplemental modules with a usable attempt', () => {
    const detail: LearnerDetailData = {
      modules: [
        mod({ cellId: 'c1-w0-a', origin: 'course', bestQuizPct: 0 }), // must not count
        mod({ cellId: '1.1', origin: 'matrix', bestQuizPct: 1 }),
        mod({ cellId: '1.2', origin: 'matrix', bestQuizPct: 0.5 }),
        mod({ cellId: '1.3', origin: 'matrix', bestQuizPct: null }), // never attempted
      ],
      labs: [],
    };
    const s = summarizeOwnProgress(detail);
    expect(s.supplemental.avgQuizPct).toBeCloseTo(0.75, 5);
  });

  test('glatPassed is true only when the supplemental 2.14 best attempt passed', () => {
    const passed = summarizeOwnProgress({
      modules: [mod({ cellId: '2.14', origin: 'matrix', bestQuizPct: 0.9, quizPassed: true })],
      labs: [],
    });
    expect(passed.supplemental.glatPassed).toBe(true);

    const failed = summarizeOwnProgress({
      modules: [mod({ cellId: '2.14', origin: 'matrix', bestQuizPct: 0.5, quizPassed: false })],
      labs: [],
    });
    expect(failed.supplemental.glatPassed).toBe(false);
  });

  test('reviewableLabs counts only reviewable submissions tied to supplemental modules', () => {
    const detail: LearnerDetailData = {
      modules: [
        mod({ cellId: 'c1-w1-a', origin: 'course' }),
        mod({ cellId: '2.1', origin: 'matrix' }),
      ],
      labs: [
        lab({ id: 'a', labId: '2.1', status: 'reviewable' }),
        lab({ id: 'b', labId: '2.1', status: 'reviewed' }),
        lab({ id: 'c', labId: 'c1-w1-a', status: 'reviewable' }), // course lab — must not count
      ],
    };
    const s = summarizeOwnProgress(detail);
    expect(s.supplemental.reviewableLabs).toBe(1);
  });

  test('empty supplemental tier when there is no matrix/custom content', () => {
    const detail: LearnerDetailData = {
      modules: [mod({ cellId: 'c1-w0-a', origin: 'course', completed: true })],
      labs: [],
    };
    const s = summarizeOwnProgress(detail);
    expect(s.supplemental).toMatchObject({
      completedCount: 0,
      totalCount: 0,
      completionPct: null,
      avgQuizPct: null,
      glatPassed: false,
      reviewableLabs: 0,
    });
  });
});

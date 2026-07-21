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

describe('summarizeOwnProgress', () => {
  test('completion is completed/total over course + resources modules', () => {
    const detail: LearnerDetailData = {
      modules: [
        mod({ cellId: 'c1-w0-a', origin: 'course', completed: true }),
        mod({ cellId: 'c1-w0-b', origin: 'course', completed: false }),
        mod({ cellId: 'custom-x', origin: 'custom', completed: true }),
      ],
      labs: [],
    };
    const s = summarizeOwnProgress(detail);
    expect(s.completedCount).toBe(2);
    expect(s.totalCount).toBe(3);
    expect(s.completionPct).toBeCloseTo(2 / 3, 5);
  });

  test('matrix-origin (Supplemental coursework) modules never count toward completion', () => {
    const detail: LearnerDetailData = {
      modules: [
        mod({ cellId: 'c1-w0-a', origin: 'course', completed: true }),
        // All matrix rows completed — a raw count over every module would read
        // 4/4 (100%); completion must stay 1/1 (still 100%, but for the right
        // reason) once supplemental is excluded.
        mod({ cellId: '1.1', origin: 'matrix', completed: true }),
        mod({ cellId: '1.2', origin: 'matrix', completed: true }),
        mod({ cellId: '2.14', origin: 'matrix', completed: true }),
      ],
      labs: [],
    };
    const s = summarizeOwnProgress(detail);
    expect(s.completedCount).toBe(1);
    expect(s.totalCount).toBe(1);
    expect(s.completionPct).toBe(1);
  });

  test('an entirely-matrix curriculum yields a null completionPct, not a false 0/0', () => {
    const detail: LearnerDetailData = {
      modules: [
        mod({ cellId: '1.1', origin: 'matrix', completed: true }),
        mod({ cellId: '1.2', origin: 'matrix', completed: false }),
      ],
      labs: [],
    };
    const s = summarizeOwnProgress(detail);
    expect(s.completedCount).toBe(0);
    expect(s.totalCount).toBe(0);
    expect(s.completionPct).toBeNull();
  });

  test('avg quiz averages only modules with a usable attempt', () => {
    const detail: LearnerDetailData = {
      modules: [
        mod({ cellId: '1.1', bestQuizPct: 1, quizPassed: true }),
        mod({ cellId: '1.2', bestQuizPct: 0.5, quizPassed: false }),
        mod({ cellId: '1.3', bestQuizPct: null }), // never attempted → excluded
      ],
      labs: [],
    };
    const s = summarizeOwnProgress(detail);
    expect(s.avgQuizPct).toBeCloseTo(0.75, 5);
  });

  test('glatPassed is true only when 2.14 best attempt passed', () => {
    const passed = summarizeOwnProgress({
      modules: [mod({ cellId: '2.14', bestQuizPct: 0.9, quizPassed: true })],
      labs: [],
    });
    expect(passed.glatPassed).toBe(true);

    const failed = summarizeOwnProgress({
      modules: [mod({ cellId: '2.14', bestQuizPct: 0.5, quizPassed: false })],
      labs: [],
    });
    expect(failed.glatPassed).toBe(false);

    const absent = summarizeOwnProgress({
      modules: [mod({ cellId: '2.1', quizPassed: true })],
      labs: [],
    });
    expect(absent.glatPassed).toBe(false);
  });

  test('reviewableLabs counts only reviewable submissions', () => {
    const s = summarizeOwnProgress({
      modules: [],
      labs: [
        lab({ id: 'a', status: 'reviewable' }),
        lab({ id: 'b', status: 'reviewed' }),
        lab({ id: 'c', status: 'reviewable' }),
        lab({ id: 'd', status: null }),
      ],
    });
    expect(s.reviewableLabs).toBe(2);
  });

  test('empty detail → null pcts, zero counts, no GLAT', () => {
    const s = summarizeOwnProgress({ modules: [], labs: [] });
    expect(s.completedCount).toBe(0);
    expect(s.totalCount).toBe(0);
    expect(s.completionPct).toBeNull();
    expect(s.avgQuizPct).toBeNull();
    expect(s.glatPassed).toBe(false);
    expect(s.reviewableLabs).toBe(0);
  });
});

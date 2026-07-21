import { describe, test, expect } from 'vitest';
import { buildWeekProgress, currentWeek } from './courseWeekProgress';
import type { CurriculumSection, Module } from '../types';

function mod(id: string): Module {
  return {
    id,
    cellId: id,
    title: `Module ${id}`,
    type: 'content',
    content: '# Lesson',
    phaseId: 'week-a',
    origin: 'course',
    stage: null,
    visibility: 'public',
    status: 'published',
    dimension: ['Diligence'],
    evidenceType: 'quiz',
    selfReportValidity: 'medium',
    progressResetAt: null,
  };
}

function week(id: string, weekLabel: string, title: string, moduleIds: string[]): CurriculumSection {
  return {
    kind: 'week',
    id,
    week: weekLabel,
    title,
    description: '',
    modules: moduleIds.map(mod),
  };
}

const supplemental: CurriculumSection = {
  kind: 'supplemental',
  id: 'supplemental',
  week: 'Supplemental',
  title: 'Supplemental coursework',
  description: '',
  modules: [mod('1.1')],
};

describe('buildWeekProgress', () => {
  test('one row per week section, in order, with completed/total counts', () => {
    const sections = [
      week('w0', 'Week 0', 'Claude Set-up', ['c1-w0-a']),
      week('w1', 'Week 1', 'Break Claude on Purpose', ['c1-w1-a', 'c1-w1-b']),
      supplemental, // non-week sections are excluded
    ];
    const completed = new Set(['c1-w0-a', 'c1-w1-a']);

    const weeks = buildWeekProgress(sections, completed);

    expect(weeks).toEqual([
      { id: 'w0', week: 'Week 0', title: 'Claude Set-up', completedCount: 1, totalCount: 1 },
      { id: 'w1', week: 'Week 1', title: 'Break Claude on Purpose', completedCount: 1, totalCount: 2 },
    ]);
  });

  test('a curriculum with no week sections returns an empty list', () => {
    expect(buildWeekProgress([supplemental], new Set())).toEqual([]);
  });
});

describe('currentWeek', () => {
  test('picks the first not-fully-complete week', () => {
    const weeks = [
      { id: 'w0', week: 'Week 0', title: 'Claude Set-up', completedCount: 1, totalCount: 1 },
      { id: 'w1', week: 'Week 1', title: 'Break Claude on Purpose', completedCount: 1, totalCount: 2 },
      { id: 'w2', week: 'Week 2', title: 'Ground & Scope', completedCount: 0, totalCount: 2 },
    ];
    expect(currentWeek(weeks)).toEqual({
      week: 'Week 1',
      title: 'Break Claude on Purpose',
      complete: false,
    });
  });

  test('falls back to the last week, marked complete, once every week is done', () => {
    const weeks = [
      { id: 'w0', week: 'Week 0', title: 'Claude Set-up', completedCount: 1, totalCount: 1 },
      { id: 'w1', week: 'Week 1', title: 'Break Claude on Purpose', completedCount: 2, totalCount: 2 },
    ];
    expect(currentWeek(weeks)).toEqual({
      week: 'Week 1',
      title: 'Break Claude on Purpose',
      complete: true,
    });
  });

  test('returns null when there are no weeks', () => {
    expect(currentWeek([])).toBeNull();
  });
});

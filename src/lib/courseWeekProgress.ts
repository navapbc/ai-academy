import type { CurriculumSection } from '../types';

// Per-week progress for the Course 1 block of the My Progress dashboard
// (2026-07-21 redesign). Pure — derived client-side from the `sections` the app
// already fetches via useCurriculum (the same data Sidebar renders), cross-referenced
// against the learner's completed cell ids. No new DB query: completion truth stays
// solely in the caller's `detail.modules` (DB-fresh); this module only supplies week
// membership/labels, so the two can never disagree on which modules are done.

export interface WeekProgress {
  id: string;
  week: string;
  title: string;
  completedCount: number;
  totalCount: number;
}

/** One row per course-week section (kind === 'week'), in curriculum order. */
export function buildWeekProgress(
  sections: CurriculumSection[],
  completedCellIds: ReadonlySet<string>,
): WeekProgress[] {
  return sections
    .filter((s) => s.kind === 'week')
    .map((s) => ({
      id: s.id,
      week: s.week,
      title: s.title,
      completedCount: s.modules.filter((m) => completedCellIds.has(m.id)).length,
      totalCount: s.modules.length,
    }));
}

export interface CurrentWeek {
  week: string;
  title: string;
  /** True once every week is fully done — `week`/`title` are then the last week's. */
  complete: boolean;
}

/**
 * The first not-fully-complete week, or the last week (marked complete) once every
 * week is done. Null when there are no weeks (e.g. an unenrolled learner — Course 1
 * isn't visible to them yet).
 */
export function currentWeek(weeks: WeekProgress[]): CurrentWeek | null {
  if (weeks.length === 0) return null;
  const inProgress = weeks.find((w) => w.completedCount < w.totalCount);
  if (inProgress) {
    return { week: inProgress.week, title: inProgress.title, complete: false };
  }
  const last = weeks[weeks.length - 1];
  return { week: last.week, title: last.title, complete: true };
}

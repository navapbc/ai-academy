import { describe, test, expect } from 'vitest';
import {
  buildCourseAuthoring,
  type CourseRow,
  type WeekRow,
  type MembershipRow,
  type ModuleInfoRow,
} from './adminCourses';

// Pure-shaping tests for the U3 course-authoring read path (the write path is
// the admin-courses Edge Function, unit-tested in admin-courses-core.test.ts).

const COURSES: CourseRow[] = [
  { id: 'c1', slug: 'course-1', title: 'Understanding & Deciding When to Use AI', sort_order: 0 },
];

const WEEKS: WeekRow[] = [
  { id: 'w0', course_id: 'c1', title: 'Week 0', subtitle: 'Claude Set-up', sort_order: 0 },
  { id: 'w1', course_id: 'c1', title: 'Week 1', subtitle: 'Break Claude on Purpose', sort_order: 1 },
  { id: 'w5', course_id: 'c1', title: 'Week 5', subtitle: null, sort_order: 4 },
];

const MEMBERSHIPS: MembershipRow[] = [
  { week_id: 'w1', cell_id: 'c1-w1-b', sort_order: 0 },
  { week_id: 'w1', cell_id: 'c1-w1-a', sort_order: 1 },
];

const MODULES: ModuleInfoRow[] = [
  { cell_id: '1.1', title: 'Rules of the road', status: 'published', origin: 'matrix', archived_at: null },
  { cell_id: 'c1-w1-b', title: 'Break Claude', status: 'published', origin: 'course', archived_at: null },
  { cell_id: 'c1-w1-a', title: 'Adversarial pane', status: 'published', origin: 'course', archived_at: null },
  { cell_id: 'course-draft', title: 'Unfinished lesson', status: 'draft', origin: 'course', archived_at: null },
  { cell_id: 'custom-gone', title: 'Archived one', status: 'published', origin: 'custom', archived_at: '2026-07-01T00:00:00Z' },
];

describe('buildCourseAuthoring (U3)', () => {
  test('folds weeks under their course in fetch order, ALL weeks included (empty too)', () => {
    const data = buildCourseAuthoring(COURSES, WEEKS, MEMBERSHIPS, MODULES);
    expect(data.courses).toHaveLength(1);
    const [course] = data.courses;
    expect(course.slug).toBe('course-1');
    // Staff/CMS see every week — including the empty Week 0 and Week 5.
    expect(course.weeks.map((w) => w.title)).toEqual(['Week 0', 'Week 1', 'Week 5']);
    expect(course.weeks[0].members).toEqual([]);
    expect(course.weeks[2].subtitle).toBeNull();
  });

  test('members keep membership order (sort_order fetch order), mapped to module info', () => {
    const data = buildCourseAuthoring(COURSES, WEEKS, MEMBERSHIPS, MODULES);
    const week1 = data.courses[0].weeks[1];
    expect(week1.members.map((m) => m.cellId)).toEqual(['c1-w1-b', 'c1-w1-a']);
    expect(week1.members[0]).toEqual({
      cellId: 'c1-w1-b',
      title: 'Break Claude',
      status: 'published',
      origin: 'course',
      archived: false,
    });
  });

  test('assignable = published, non-archived, not already in any week', () => {
    const data = buildCourseAuthoring(COURSES, WEEKS, MEMBERSHIPS, MODULES);
    // 1.1 is the only published, non-archived, unassigned module:
    // c1-w1-a/b are assigned, course-draft is a draft, custom-gone is archived.
    expect(data.assignable.map((m) => m.cellId)).toEqual(['1.1']);
  });

  test('a membership referencing an unknown module is skipped, but still blocks reassignment', () => {
    const data = buildCourseAuthoring(
      COURSES,
      WEEKS,
      [...MEMBERSHIPS, { week_id: 'w0', cell_id: 'ghost', sort_order: 0 }],
      MODULES,
    );
    expect(data.courses[0].weeks[0].members).toEqual([]);
    expect(data.assignable.map((m) => m.cellId)).toEqual(['1.1']);
  });

  test('empty inputs produce empty output (no crash)', () => {
    expect(buildCourseAuthoring([], [], [], [])).toEqual({ courses: [], assignable: [] });
  });
});

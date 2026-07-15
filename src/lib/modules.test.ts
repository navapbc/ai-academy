import { describe, test, expect } from 'vitest';
import { mapRowToModule, groupCurriculum, assertModuleRow, type CourseStructure } from './modules';
import type { Module } from '../types';

// mapRowToModule / groupCurriculum / assertModuleRow are pure (no Supabase
// call), so they test without a live stack.
const baseRow = {
  cell_id: '1.3',
  stage: '1a',
  status: 'published',
  origin: 'matrix',
  visibility: 'public',
  title: 'Recognizing when AI is appropriate',
  type: 'sorter',
  dimension: ['Delegation'],
  evidence_type: 'performance-task',
  self_report_validity: 'medium',
  body_md: '# Lesson',
  video_url: null,
  tutor_reference_md: null,
  archived_at: null,
  mastery_anchor: null,
  emergent_anchor: null,
  quiz_json: null,
  lab_config_json: null,
  sorter_config_json: null,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapRow = (over: Record<string, unknown>): Module => mapRowToModule({ ...baseRow, ...over } as any);

/** An empty structure (no courses/weeks/memberships) — the pre-U1 world. */
const EMPTY_STRUCTURE: CourseStructure = { courses: [], weeks: [], memberships: [] };

/** Course 1 with one week and the given memberships. */
function structureWithWeek(cellIds: string[], weekId = 'w-1'): CourseStructure {
  return {
    courses: [{ id: 'c-1', slug: 'course-1', title: 'Understanding & Deciding When to Use AI', description: null, sortOrder: 0 }],
    weeks: [{ id: weekId, courseId: 'c-1', title: 'Week 1', subtitle: 'Break Claude on Purpose', sortOrder: 0 }],
    memberships: cellIds.map((cellId, i) => ({ weekId, cellId, sortOrder: i })),
  };
}

describe('mapRowToModule — sorter config', () => {
  test('maps sorter_config_json to sorterConfig', () => {
    const cfg = {
      kind: 'scenario-sort',
      scenarios: [{ id: 's1', text: 't', correct: 'delegate', rationale: 'r' }],
    };
    const m = mapRow({ sorter_config_json: cfg });
    expect(m.type).toBe('sorter');
    expect(m.sorterConfig).toEqual(cfg);
  });

  test('maps a null sorter_config_json to undefined', () => {
    expect(mapRow({ sorter_config_json: null }).sorterConfig).toBeUndefined();
  });
});

describe('mapRowToModule — P5.4-1 fields', () => {
  test('maps video_url / tutor_reference_md / origin; phaseId is stamped later by grouping', () => {
    const m = mapRow({ video_url: 'https://x.test/v', tutor_reference_md: 'extra grounding' });
    expect(m.videoUrl).toBe('https://x.test/v');
    expect(m.tutorReference).toBe('extra grounding');
    expect(m.origin).toBe('matrix');
    expect(m.phaseId).toBe(''); // U2: sections assign phaseId, not the row
    expect(m.stage).toBe('1a');
    expect(m.visibility).toBe('public'); // U1: mapped through from the row
  });

  test('a custom lesson (stage=null) maps with a null stage', () => {
    const m = mapRow({ cell_id: 'custom-foo', origin: 'custom', stage: null });
    expect(m.origin).toBe('custom');
    expect(m.stage).toBeNull();
  });

  test('null video_url / tutor_reference_md become undefined', () => {
    const m = mapRow({});
    expect(m.videoUrl).toBeUndefined();
    expect(m.tutorReference).toBeUndefined();
  });
});

describe('groupCurriculum (restructure U2)', () => {
  const m = (over: Record<string, unknown>) => mapRow(over);

  test('with no structure, matrix cells form one Supplemental section (existing order preserved)', () => {
    const sections = groupCurriculum(
      [m({ cell_id: '1.3', stage: '1a' }), m({ cell_id: '1.1', stage: '1b' }), m({ cell_id: '2.1', stage: '2' })],
      EMPTY_STRUCTURE,
    );
    expect(sections.map((s) => s.id)).toEqual(['supplemental']);
    expect(sections[0].kind).toBe('supplemental');
    expect(sections[0].title).toBe('Supplemental coursework');
    expect(sections[0].modules.map((x) => x.id)).toEqual(['1.3', '1.1', '2.1']);
    expect(sections[0].modules.every((x) => x.phaseId === 'supplemental')).toBe(true);
  });

  test('appends a "Resources & additional lessons" section ONLY when a custom lesson exists', () => {
    const sections = groupCurriculum(
      [m({ cell_id: '1.3', stage: '1a' }), m({ cell_id: 'custom-foo', origin: 'custom', stage: null })],
      EMPTY_STRUCTURE,
    );
    expect(sections.map((s) => s.id)).toEqual(['supplemental', 'resources']);
    const resources = sections.find((s) => s.kind === 'resources')!;
    expect(resources.title).toBe('Resources & additional lessons');
    expect(resources.modules.map((x) => x.id)).toEqual(['custom-foo']);
    // The custom lesson never leaks into supplemental.
    expect(sections[0].modules.map((x) => x.id)).toEqual(['1.3']);
  });

  test('a week with a published member is visible, in course/week order, before supplemental', () => {
    const course = m({ cell_id: 'c1-w1-break-claude', origin: 'course', stage: null, visibility: 'program' });
    const sections = groupCurriculum(
      [m({ cell_id: '1.3', stage: '1a' }), course],
      structureWithWeek(['c1-w1-break-claude']),
    );
    expect(sections.map((s) => s.kind)).toEqual(['week', 'supplemental']);
    const week = sections[0];
    expect(week.id).toBe('week-w-1');
    expect(week.week).toBe('Week 1');
    expect(week.title).toBe('Break Claude on Purpose');
    expect(week.courseTitle).toBe('Understanding & Deciding When to Use AI');
    expect(week.modules.map((x) => x.id)).toEqual(['c1-w1-break-claude']);
    expect(week.modules[0].phaseId).toBe('week-w-1');
  });

  test('the demo-seed shape: 7 empty weeks are all hidden; learners see supplemental only', () => {
    // Mirrors the U1 seed reality: Course 1 + 7 week rows with EMPTY membership
    // and 28 matrix cells — the shape the seeded demo user sees today.
    const matrix = Array.from({ length: 28 }, (_, i) => m({ cell_id: `1.${i + 1}`, stage: '1a' }));
    const structure: CourseStructure = {
      courses: [{ id: 'c-1', slug: 'course-1', title: 'Course 1', description: null, sortOrder: 0 }],
      weeks: Array.from({ length: 7 }, (_, i) => ({
        id: `w-${i}`, courseId: 'c-1', title: `Week ${i}`, subtitle: null, sortOrder: i,
      })),
      memberships: [],
    };
    const sections = groupCurriculum(matrix, structure);
    expect(sections.map((s) => s.kind)).toEqual(['supplemental']);
    expect(sections[0].modules).toHaveLength(28);
  });

  test('a public module assigned to a week renders under the week and LEAVES supplemental', () => {
    const sections = groupCurriculum(
      [m({ cell_id: '1.3', stage: '1a' }), m({ cell_id: '1.4', stage: '1a' })],
      structureWithWeek(['1.4']),
    );
    const week = sections.find((s) => s.kind === 'week')!;
    const supplemental = sections.find((s) => s.kind === 'supplemental')!;
    expect(week.modules.map((x) => x.id)).toEqual(['1.4']);
    expect(supplemental.modules.map((x) => x.id)).toEqual(['1.3']);
  });

  test('a draft-only week is hidden; its matrix member falls back to supplemental', () => {
    const draftMatrix = m({ cell_id: '1.4', stage: '1a', status: 'draft' });
    const sections = groupCurriculum([draftMatrix], structureWithWeek(['1.4']));
    expect(sections.map((s) => s.kind)).toEqual(['supplemental']);
    expect(sections[0].modules.map((x) => x.id)).toEqual(['1.4']);
  });

  test('an unassigned course-origin module renders nowhere for learners', () => {
    const sections = groupCurriculum(
      [m({ cell_id: '1.3', stage: '1a' }), m({ cell_id: 'course-orphan', origin: 'course', stage: null })],
      EMPTY_STRUCTURE,
    );
    expect(sections.map((s) => s.kind)).toEqual(['supplemental']);
    expect(sections.flatMap((s) => s.modules.map((x) => x.id))).toEqual(['1.3']);
  });

  test('a membership referencing a module the viewer cannot see is skipped (week stays hidden)', () => {
    // e.g. post-U4: a program module's row never reached this viewer.
    const sections = groupCurriculum(
      [m({ cell_id: '1.3', stage: '1a' })],
      structureWithWeek(['c1-w1-invisible']),
    );
    expect(sections.map((s) => s.kind)).toEqual(['supplemental']);
  });

  test('week members render in membership sort order, and a visible week shows its draft matrix member (D10 badge posture)', () => {
    const structure = structureWithWeek(['1.5', '1.4']);
    const sections = groupCurriculum(
      [
        m({ cell_id: '1.4', stage: '1a', status: 'draft' }),
        m({ cell_id: '1.5', stage: '1a' }), // published — makes the week visible
      ],
      structure,
    );
    const week = sections.find((s) => s.kind === 'week')!;
    expect(week.modules.map((x) => x.id)).toEqual(['1.5', '1.4']);
  });
});

describe('assertModuleRow — P5.4-1 origin/stage guard', () => {
  test('accepts a matrix row with a valid stage and a custom row with null stage', () => {
    expect(() => assertModuleRow({ ...baseRow })).not.toThrow();
    expect(() => assertModuleRow({ ...baseRow, cell_id: 'custom-x', origin: 'custom', stage: null })).not.toThrow();
  });

  test('throws on an unknown origin, an unknown matrix stage, or a custom row with a stage', () => {
    expect(() => assertModuleRow({ ...baseRow, origin: 'weird' })).toThrow(/origin/);
    expect(() => assertModuleRow({ ...baseRow, stage: 'Z9' })).toThrow(/stage/);
    expect(() => assertModuleRow({ ...baseRow, origin: 'custom', stage: '1a' })).toThrow(/custom/);
  });
});

describe('assertModuleRow — restructure U1 course origin + visibility guard', () => {
  test('accepts a stage-less course row, in both visibility classes', () => {
    expect(() =>
      assertModuleRow({ ...baseRow, cell_id: 'c1-w1-break-claude', origin: 'course', stage: null, visibility: 'program' }),
    ).not.toThrow();
    expect(() =>
      assertModuleRow({ ...baseRow, cell_id: 'c1-w0-claude-setup', origin: 'course', stage: null, visibility: 'public' }),
    ).not.toThrow();
  });

  test('throws on a course row with a stage (stage-less, like custom)', () => {
    expect(() => assertModuleRow({ ...baseRow, origin: 'course', stage: '2' })).toThrow(/course/);
  });

  test('throws on a missing or unknown visibility (schema lockstep)', () => {
    expect(() => assertModuleRow({ ...baseRow, visibility: undefined })).toThrow(/visibility/);
    expect(() => assertModuleRow({ ...baseRow, visibility: 'secret' })).toThrow(/visibility/);
  });
});

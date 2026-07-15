import { describe, test, expect } from 'vitest';
import { mapRowToModule, groupCurriculum, isModuleLive, assertModuleRow, type CourseStructure } from './modules';
import type { Module } from '../types';

// Pure helpers (no Supabase) — these complement the existing modules.test.ts
// (which covers the sorter_config mapping and the U2 grouping rules) with the
// field mapping, null-body fallback, section ordering across multiple weeks,
// and the stub-vs-live derivation.

const row = (over: Record<string, unknown> = {}) => ({
  cell_id: '1.4',
  stage: '1a',
  status: 'published',
  origin: 'matrix',
  visibility: 'public',
  title: 'Data classification',
  type: 'content',
  dimension: ['Diligence'],
  evidence_type: 'quiz',
  self_report_validity: 'medium',
  body_md: '# Lesson body',
  mastery_anchor: null,
  emergent_anchor: null,
  quiz_json: null,
  lab_config_json: null,
  sorter_config_json: null,
  ...over,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mod = (over: Record<string, unknown> = {}): Module => mapRowToModule(row(over) as any);

describe('mapRowToModule — field mapping', () => {
  test('maps cell_id to id+cellId and body_md to content', () => {
    const m = mod();
    expect(m.id).toBe('1.4');
    expect(m.cellId).toBe('1.4');
    expect(m.content).toBe('# Lesson body');
    expect(m.dimension).toEqual(['Diligence']);
    expect(m.evidenceType).toBe('quiz');
    expect(m.selfReportValidity).toBe('medium');
  });

  test('null body_md becomes an empty string (not null/undefined)', () => {
    expect(mod({ body_md: null }).content).toBe('');
  });

  test('null optional columns map to undefined', () => {
    const m = mod();
    expect(m.masteryAnchor).toBeUndefined();
    expect(m.emergentAnchor).toBeUndefined();
    expect(m.quiz).toBeUndefined();
    expect(m.labConfig).toBeUndefined();
    expect(m.sorterConfig).toBeUndefined();
  });
});

describe('groupCurriculum — section ordering across weeks (U2)', () => {
  test('weeks render in course + week sort order, then supplemental, then resources', () => {
    const structure: CourseStructure = {
      courses: [{ id: 'c-1', slug: 'course-1', title: 'Course 1', description: null, sortOrder: 0 }],
      weeks: [
        { id: 'w-0', courseId: 'c-1', title: 'Week 0', subtitle: 'Claude Set-up', sortOrder: 0 },
        { id: 'w-1', courseId: 'c-1', title: 'Week 1', subtitle: 'Break Claude on Purpose', sortOrder: 1 },
      ],
      memberships: [
        { weekId: 'w-1', cellId: 'c1-w1-a', sortOrder: 0 },
        { weekId: 'w-0', cellId: 'c1-w0-setup', sortOrder: 0 },
      ],
    };
    const sections = groupCurriculum(
      [
        mod({ cell_id: '1.3' }),
        mod({ cell_id: 'custom-extra', origin: 'custom', stage: null }),
        mod({ cell_id: 'c1-w0-setup', origin: 'course', stage: null }),
        mod({ cell_id: 'c1-w1-a', origin: 'course', stage: null, visibility: 'program' }),
      ],
      structure,
    );
    expect(sections.map((s) => s.id)).toEqual(['week-w-0', 'week-w-1', 'supplemental', 'resources']);
    expect(sections.map((s) => s.week)).toEqual(['Week 0', 'Week 1', 'Supplemental', 'Resources']);
  });

  test('a week whose title has no subtitle falls back to the week title', () => {
    const structure: CourseStructure = {
      courses: [{ id: 'c-1', slug: 'course-1', title: 'Course 1', description: null, sortOrder: 0 }],
      weeks: [{ id: 'w-5', courseId: 'c-1', title: 'Week 5', subtitle: null, sortOrder: 0 }],
      memberships: [{ weekId: 'w-5', cellId: 'c1-w5-a', sortOrder: 0 }],
    };
    const sections = groupCurriculum([mod({ cell_id: 'c1-w5-a', origin: 'course', stage: null })], structure);
    expect(sections[0].title).toBe('Week 5');
  });

  test('an empty curriculum yields zero sections — the empty state keys on ZERO ROWS, not shape (FE-02 re-cut)', () => {
    const sections = groupCurriculum([], { courses: [], weeks: [], memberships: [] });
    expect(sections).toEqual([]);
  });
});

describe('assertModuleRow (TYPE-03 — schema-drift guard)', () => {
  const good = row();
  test('accepts a well-formed row', () => {
    expect(() => assertModuleRow(good)).not.toThrow();
  });
  test('throws a clear error on a renamed/missing required field', () => {
    const { cell_id, ...missingCellId } = good;
    void cell_id;
    expect(() => assertModuleRow(missingCellId)).toThrow(/cell_id|schema drift/i);
  });
  test('throws on an unknown stage', () => {
    expect(() => assertModuleRow({ ...good, stage: '9z' })).toThrow(/stage|schema drift/i);
  });
  test('throws on an out-of-enum status (W3-2)', () => {
    expect(() => assertModuleRow({ ...good, status: 'archived' })).toThrow(/status|schema drift/i);
  });
  test('throws on a non-object', () => {
    expect(() => assertModuleRow(null)).toThrow(/schema drift/i);
  });
});

describe('isModuleLive', () => {
  test('true when content is authored', () => {
    expect(isModuleLive({ content: '# Real lesson' } as Module)).toBe(true);
  });

  test('false for empty content', () => {
    expect(isModuleLive({ content: '' } as Module)).toBe(false);
  });

  test('false for a "Coming soon." stub', () => {
    expect(isModuleLive({ content: 'Intro\n\n*Coming soon.*' } as Module)).toBe(false);
  });
});

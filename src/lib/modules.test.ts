import { describe, test, expect } from 'vitest';
import { mapRowToModule, groupIntoPhases, assertModuleRow } from './modules';
import type { Module } from '../types';

// mapRowToModule / groupIntoPhases / assertModuleRow are pure (no Supabase call),
// so they test without a live stack.
const baseRow = {
  cell_id: '1.3',
  stage: '1a',
  status: 'published',
  origin: 'matrix',
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
  test('maps video_url / tutor_reference_md / origin and defaults stage→matrix phase', () => {
    const m = mapRow({ video_url: 'https://x.test/v', tutor_reference_md: 'extra grounding' });
    expect(m.videoUrl).toBe('https://x.test/v');
    expect(m.tutorReference).toBe('extra grounding');
    expect(m.origin).toBe('matrix');
    expect(m.phaseId).toBe('stage-1a');
    expect(m.stage).toBe('1a');
  });

  test('a custom lesson (stage=null) maps into the Additional-lessons phase', () => {
    const m = mapRow({ cell_id: 'custom-foo', origin: 'custom', stage: null });
    expect(m.origin).toBe('custom');
    expect(m.stage).toBeNull();
    expect(m.phaseId).toBe('additional-lessons');
  });

  test('null video_url / tutor_reference_md become undefined', () => {
    const m = mapRow({});
    expect(m.videoUrl).toBeUndefined();
    expect(m.tutorReference).toBeUndefined();
  });
});

describe('groupIntoPhases', () => {
  const m = (over: Record<string, unknown>) => mapRow(over);

  test('returns exactly the 3 matrix stages when there are no custom lessons', () => {
    const phases = groupIntoPhases([
      m({ cell_id: '1.3', stage: '1a' }),
      m({ cell_id: '1.1', stage: '1b' }),
      m({ cell_id: '2.1', stage: '2' }),
    ]);
    expect(phases.map((p) => p.id)).toEqual(['stage-1a', 'stage-1b', 'stage-2']);
  });

  test('appends an "Additional lessons" group ONLY when a custom lesson exists', () => {
    const phases = groupIntoPhases([
      m({ cell_id: '1.3', stage: '1a' }),
      m({ cell_id: 'custom-foo', origin: 'custom', stage: null }),
    ]);
    expect(phases.map((p) => p.id)).toEqual([
      'stage-1a',
      'stage-1b',
      'stage-2',
      'additional-lessons',
    ]);
    const additional = phases.find((p) => p.id === 'additional-lessons')!;
    expect(additional.modules.map((x) => x.id)).toEqual(['custom-foo']);
    // The custom lesson never leaks into a matrix stage.
    expect(phases.find((p) => p.id === 'stage-1a')!.modules.map((x) => x.id)).toEqual(['1.3']);
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

import { describe, test, expect } from 'vitest';
import { mapRowToModule, groupIntoPhases, isModuleLive } from './modules';
import type { Module, Stage } from '../types';

// Pure helpers (no Supabase) — these complement the existing modules.test.ts
// (which covers the sorter_config mapping) with the field mapping, null-body
// fallback, phase grouping/order, and the stub-vs-live derivation.

const row = (over: Record<string, unknown> = {}) => ({
  cell_id: '1.4',
  stage: '1a' as Stage,
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

describe('mapRowToModule — field mapping', () => {
  test('maps cell_id to id+cellId and body_md to content', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = mapRowToModule(row() as any);
    expect(m.id).toBe('1.4');
    expect(m.cellId).toBe('1.4');
    expect(m.content).toBe('# Lesson body');
    expect(m.phaseId).toBe('stage-1a');
    expect(m.dimension).toEqual(['Diligence']);
    expect(m.evidenceType).toBe('quiz');
    expect(m.selfReportValidity).toBe('medium');
  });

  test('null body_md becomes an empty string (not null/undefined)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = mapRowToModule(row({ body_md: null }) as any);
    expect(m.content).toBe('');
  });

  test('null optional columns map to undefined', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = mapRowToModule(row() as any);
    expect(m.masteryAnchor).toBeUndefined();
    expect(m.emergentAnchor).toBeUndefined();
    expect(m.quiz).toBeUndefined();
    expect(m.labConfig).toBeUndefined();
    expect(m.sorterConfig).toBeUndefined();
  });

  test('maps each stage to its phase id', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(mapRowToModule(row({ stage: '1a' }) as any).phaseId).toBe('stage-1a');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(mapRowToModule(row({ stage: '1b' }) as any).phaseId).toBe('stage-1b');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(mapRowToModule(row({ stage: '2' }) as any).phaseId).toBe('stage-2');
  });
});

describe('groupIntoPhases', () => {
  const mod = (id: string, stage: Stage): Module => ({ id, cellId: id, stage } as Module);

  test('returns the three stages in nav order (1a, 1b, 2)', () => {
    const phases = groupIntoPhases([mod('2.1', '2'), mod('1.3', '1a'), mod('1.7', '1b')]);
    expect(phases.map((p) => p.id)).toEqual(['stage-1a', 'stage-1b', 'stage-2']);
  });

  test('buckets modules into their stage', () => {
    const phases = groupIntoPhases([mod('1.3', '1a'), mod('1.4', '1a'), mod('2.1', '2')]);
    const byId = Object.fromEntries(phases.map((p) => [p.id, p.modules.map((m) => m.id)]));
    expect(byId['stage-1a']).toEqual(['1.3', '1.4']);
    expect(byId['stage-1b']).toEqual([]);
    expect(byId['stage-2']).toEqual(['2.1']);
  });

  test('an empty curriculum still yields three empty stages (never []), which is the FE-02 crash precondition', () => {
    const phases = groupIntoPhases([]);
    expect(phases).toHaveLength(3);
    expect(phases.every((p) => p.modules.length === 0)).toBe(true);
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

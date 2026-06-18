import { describe, test, expect } from 'vitest';
import type { Module, Phase } from '../types';
import { stage1aProgress, isModuleLocked, firstIncompleteStage1aId } from './gating';

// Pure helpers — no Supabase, so they test without a live stack.
const mod = (id: string, stage: Module['stage']): Module =>
  ({ id, cellId: id, stage } as Module);

const phases: Phase[] = [
  { id: 'stage-1a', title: '', description: '', week: '', modules: [mod('1.3', '1a'), mod('1.4', '1a'), mod('1.13', '1a')] },
  { id: 'stage-1b', title: '', description: '', week: '', modules: [mod('1.7', '1b'), mod('1.8', '1b')] },
  { id: 'stage-2', title: '', description: '', week: '', modules: [mod('2.1', '2'), mod('2.2', '2')] },
];

describe('stage1aProgress', () => {
  test('counts only Stage-1a modules and is not done when incomplete', () => {
    const p = stage1aProgress(phases, ['1.3']);
    expect(p).toEqual({ completed: 1, total: 3, done: false });
  });

  test('done only when every Stage-1a module is complete', () => {
    // Completing Stage-1b/Stage-2 modules does not move the gate.
    expect(stage1aProgress(phases, ['1.3', '1.4', '1.7', '2.1']).done).toBe(false);
    expect(stage1aProgress(phases, ['1.3', '1.4', '1.13']).done).toBe(true);
  });

  test('empty curriculum never reads as done', () => {
    expect(stage1aProgress([], []).done).toBe(false);
  });
});

describe('isModuleLocked', () => {
  test('locks Stage-2 modules until Stage 1a is done', () => {
    expect(isModuleLocked(mod('2.1', '2'), false)).toBe(true);
    expect(isModuleLocked(mod('2.1', '2'), true)).toBe(false);
  });

  test('never locks Stage 1a or Stage 1b', () => {
    expect(isModuleLocked(mod('1.3', '1a'), false)).toBe(false);
    expect(isModuleLocked(mod('1.8', '1b'), false)).toBe(false);
  });
});

describe('firstIncompleteStage1aId', () => {
  test('returns the first incomplete Stage-1a module id', () => {
    expect(firstIncompleteStage1aId(phases, ['1.3'])).toBe('1.4');
  });

  test('returns undefined when Stage 1a is complete', () => {
    expect(firstIncompleteStage1aId(phases, ['1.3', '1.4', '1.13'])).toBeUndefined();
  });
});

describe('custom lessons are invisible to gating (P5.4-1)', () => {
  // A custom lesson carries stage=null and lives in the "Additional lessons" group.
  const custom = mod('custom-foo', null);
  const withCustom: Phase[] = [
    ...phases,
    { id: 'additional-lessons', title: '', description: '', week: '', modules: [custom] },
  ];

  test('does not change the Stage-1a denominator or unlock Stage 2', () => {
    // Same 3/3 Stage-1a total as without the custom lesson; completing it doesn't help.
    expect(stage1aProgress(withCustom, ['1.3', '1.4', '1.13']).total).toBe(3);
    expect(stage1aProgress(withCustom, ['custom-foo']).done).toBe(false);
  });

  test('a custom lesson is never locked', () => {
    expect(isModuleLocked(custom, false)).toBe(false);
    expect(isModuleLocked(custom, true)).toBe(false);
  });
});

import { describe, test, expect } from 'vitest';
import { resolveCurrentModuleId, resolveNextModuleId } from './useProgress';
import type { ModuleProgressSnapshot } from './progress';

const ALL = ['m0', 'm1', 'm2', 'm3'];

function snap(partial: Partial<ModuleProgressSnapshot>): ModuleProgressSnapshot {
  return {
    completedModuleIds: [],
    inProgressModuleIds: [],
    latestInProgressId: null,
    ...partial,
  };
}

describe('resolveCurrentModuleId', () => {
  test('keeps the cursor when it is a known, incomplete module', () => {
    const result = resolveCurrentModuleId(snap({ completedModuleIds: ['m0'] }), 'm2', ALL);
    expect(result).toBe('m2');
  });

  test('falls back to the latest in_progress module when no cursor', () => {
    const result = resolveCurrentModuleId(
      snap({ completedModuleIds: ['m0'], latestInProgressId: 'm1' }),
      undefined,
      ALL,
    );
    expect(result).toBe('m1');
  });

  // Regression: a stale row (e.g. a test fixture) carried an id not in the
  // curriculum; the app must ignore it rather than land on a missing module.
  test('ignores an unknown latestInProgressId and lands on the first incomplete', () => {
    const result = resolveCurrentModuleId(
      snap({ completedModuleIds: ['m0'], latestInProgressId: 'stale-test-id' }),
      undefined,
      ALL,
    );
    expect(result).toBe('m1');
  });

  test('ignores a cursor pointing at a completed module', () => {
    const result = resolveCurrentModuleId(snap({ completedModuleIds: ['m0', 'm1'] }), 'm0', ALL);
    expect(result).toBe('m2');
  });

  // Restructure U2: after the re-grouping (or a visibility change), a cached
  // cursor can reference a module id that is no longer in the visible
  // curriculum. It must be ignored gracefully, landing on the first incomplete.
  test('ignores a stale cursor id that is not in the visible curriculum', () => {
    const result = resolveCurrentModuleId(snap({ completedModuleIds: ['m0'] }), 'gone-id', ALL);
    expect(result).toBe('m1');
  });

  test('falls back to the first module when everything is incomplete and nothing is set', () => {
    expect(resolveCurrentModuleId(snap({}), undefined, ALL)).toBe('m0');
  });
});

describe('resolveNextModuleId', () => {
  test('advances to the next module in the flattened order', () => {
    expect(resolveNextModuleId('m1', ALL)).toBe('m2');
  });

  test('stays put on the last module (no overrun)', () => {
    expect(resolveNextModuleId('m3', ALL)).toBe('m3');
  });

  // Regression: `indexOf(...) + 1` is 0 for an id that isn't in the curriculum,
  // so an unknown id silently advanced the learner to the FIRST module.
  test('stays put for an id that is not in the visible curriculum', () => {
    expect(resolveNextModuleId('gone-id', ALL)).toBe('gone-id');
  });
});

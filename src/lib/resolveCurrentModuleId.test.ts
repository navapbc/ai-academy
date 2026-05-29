import { describe, test, expect } from 'vitest';
import { resolveCurrentModuleId } from './useProgress';
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

  test('falls back to the first module when everything is incomplete and nothing is set', () => {
    expect(resolveCurrentModuleId(snap({}), undefined, ALL)).toBe('m0');
  });
});

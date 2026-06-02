import { describe, test, expect } from 'vitest';
import type { Module, Phase } from '../types';
import { isModuleLocked, firstIncompleteStage1aId, stage1aProgress } from './gating';

// Complements gating.test.ts. Focuses on the interaction the frontend audit
// flagged (FE-03): the next-module advance in useProgress is gating-unaware and
// can land the learner on a locked Stage-2 module.
const mod = (id: string, stage: Module['stage']): Module => ({ id, cellId: id, stage } as Module);

// A curriculum where a Stage-2 module immediately follows a Stage-1b module in
// flat order — the ordering that triggers FE-03.
const phases: Phase[] = [
  { id: 'stage-1a', title: '', description: '', week: '', modules: [mod('1.3', '1a'), mod('1.4', '1a')] },
  { id: 'stage-1b', title: '', description: '', week: '', modules: [mod('1.8', '1b')] },
  { id: 'stage-2', title: '', description: '', week: '', modules: [mod('2.1', '2')] },
];
const flatIds = phases.flatMap((p) => p.modules).map((m) => m.id); // ['1.3','1.4','1.8','2.1']

describe('gating — Stage 2 lock interaction', () => {
  test('Stage 1b is never locked even when Stage 1a is incomplete', () => {
    expect(isModuleLocked(mod('1.8', '1b'), false)).toBe(false);
  });

  test('firstIncompleteStage1aId points at the gate the learner must finish', () => {
    expect(firstIncompleteStage1aId(phases, ['1.3'])).toBe('1.4');
  });

  test('stage1aProgress is not done while a Stage-1a module remains', () => {
    expect(stage1aProgress(phases, ['1.3', '1.8']).done).toBe(false);
  });

  // FE-03 is now fixed in useProgress.completeModule (gating-aware advance via
  // resolveNextModuleId + an injected isLocked predicate) and verified in
  // src/lib/useProgress.test.tsx → "gating-aware advance (FE-03)". This pure
  // assertion just confirms the precondition the fix relies on: '2.1' is locked
  // while Stage 1a is incomplete, so the advance must skip it.
  test('the Stage-2 module that follows 1.8 is locked while Stage 1a is incomplete (FE-03 precondition)', () => {
    const stage1aDone = stage1aProgress(phases, ['1.8']).done;
    const nextId = flatIds[flatIds.indexOf('1.8') + 1]; // '2.1'
    const next = phases.flatMap((p) => p.modules).find((m) => m.id === nextId)!;
    expect(isModuleLocked(next, stage1aDone)).toBe(true);
  });
});

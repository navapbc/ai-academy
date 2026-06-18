import type { Module, Phase } from '../types';

// Stage gating (P3.11): Stage 2 unlocks only after ALL of Stage 1a is complete.
// Stage 1b is never gated — it runs alongside Stage 1a. Gating is per-user,
// derived purely from the loaded curriculum + the learner's completedModuleIds,
// so it's a thin UI concern with no schema, auth, or data-layer changes.
//
// Custom lessons (origin='custom', stage=null — P5.4-1) are invisible to gating:
// every check below keys off stage ∈ {'1a','2'}, and a null stage matches neither,
// so a custom lesson is never counted toward the Stage-1a gate and is never locked.

export interface Stage1aProgress {
  completed: number;
  total: number;
  /** True once every Stage-1a module is complete — the unlock condition for Stage 2. */
  done: boolean;
}

/** Counts completed Stage-1a modules across all phases (the unlock gate for Stage 2). */
export function stage1aProgress(
  phases: Phase[],
  completedModuleIds: string[],
): Stage1aProgress {
  const completedSet = new Set(completedModuleIds);
  const stage1aModules = phases
    .flatMap((p) => p.modules)
    .filter((m) => m.stage === '1a');
  const total = stage1aModules.length;
  const completed = stage1aModules.filter((m) => completedSet.has(m.id)).length;
  // Guard total > 0 so an empty/still-loading curriculum can't read as "done"
  // (0 === 0) and wrongly unlock Stage 2.
  return { completed, total, done: total > 0 && completed === total };
}

/** A Stage-2 module is locked until Stage 1a is fully complete. */
export function isModuleLocked(module: Module, stage1aDone: boolean): boolean {
  return module.stage === '2' && !stage1aDone;
}

/** First incomplete Stage-1a module id — where the "Go to Stage 1a" button sends the learner. */
export function firstIncompleteStage1aId(
  phases: Phase[],
  completedModuleIds: string[],
): string | undefined {
  const completedSet = new Set(completedModuleIds);
  return phases
    .flatMap((p) => p.modules)
    .find((m) => m.stage === '1a' && !completedSet.has(m.id))?.id;
}

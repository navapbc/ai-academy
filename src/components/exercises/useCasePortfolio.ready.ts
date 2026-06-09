import type { UseCasePortfolioConfig } from '../../types';

export type UseCaseVerdict = 'helps' | 'doesnt';

export interface UseCaseEntry {
  verdict: UseCaseVerdict;
  task: string;
  approach: string;
  watch: string;
}

export interface PortfolioState {
  entries: UseCaseEntry[];
  /** Diligence Statement text keyed by dimension id. */
  statement: Record<string, string>;
}

export interface PortfolioReadiness {
  ready: boolean;
  /** Human-readable list of what's still missing (drives the readiness line). */
  reasons: string[];
  completeEntries: number;
  doesntCount: number;
  statementWords: number;
}

/** An entry counts only once all three of its fields carry real text. */
export function isEntryComplete(e: UseCaseEntry): boolean {
  return e.task.trim() !== '' && e.approach.trim() !== '' && e.watch.trim() !== '';
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

/**
 * Pure submit-gate for the 2.11 portfolio (no React, so it's unit-testable).
 * Submitting requires: at least `minEntries` complete library entries, with at
 * least one of them a "Doesn't help" entry (the lesson's honesty point — a
 * library of only wins is the failure mode); every 4D dimension filled; and the
 * combined statement at or above the word floor. Returns the specific reasons it
 * isn't ready yet so the UI can announce them.
 */
export function evaluatePortfolioReadiness(
  state: PortfolioState,
  config: UseCasePortfolioConfig,
): PortfolioReadiness {
  const complete = state.entries.filter(isEntryComplete);
  const completeEntries = complete.length;
  const doesntCount = complete.filter((e) => e.verdict === 'doesnt').length;

  const statementWords = config.diligence.dimensions.reduce(
    (sum, d) => sum + countWords(state.statement[d.id] ?? ''),
    0,
  );
  const missingDimensions = config.diligence.dimensions.filter(
    (d) => (state.statement[d.id] ?? '').trim() === '',
  );

  const reasons: string[] = [];
  if (completeEntries < config.library.minEntries) {
    const need = config.library.minEntries - completeEntries;
    reasons.push(`Add ${need} more complete use-case ${need === 1 ? 'entry' : 'entries'}.`);
  }
  if (doesntCount === 0) {
    reasons.push('Include at least one “Doesn’t help” entry — those are the ones that save you time.');
  }
  if (missingDimensions.length > 0) {
    reasons.push(`Complete the Diligence Statement: ${missingDimensions.map((d) => d.label).join(', ')}.`);
  }
  if (statementWords < config.diligence.minWords) {
    reasons.push(`Write at least ${config.diligence.minWords} words across the Diligence Statement.`);
  }

  return { ready: reasons.length === 0, reasons, completeEntries, doesntCount, statementWords };
}

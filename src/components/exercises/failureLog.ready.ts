import type { FailureLogConfig } from '../../types';

export interface FailureEntry {
  date: string;
  task: string;
  error: string;
  caught: string;
  tell: string;
}

export interface FailureLogReadiness {
  ready: boolean;
  /** What's still missing (drives the readiness line). */
  reasons: string[];
  completeEntries: number;
}

export const blankFailureEntry = (): FailureEntry => ({
  date: '',
  task: '',
  error: '',
  caught: '',
  tell: '',
});

/** An entry counts only once the date and all four fields carry real text. */
export function isFailureEntryComplete(e: FailureEntry): boolean {
  return (
    e.date.trim() !== '' &&
    e.task.trim() !== '' &&
    e.error.trim() !== '' &&
    e.caught.trim() !== '' &&
    e.tell.trim() !== ''
  );
}

/**
 * Pure submit-gate for the 2.9 failure log (no React, so it's unit-testable).
 * Recording requires at least `minEntries` complete entries — the hard floor.
 * `targetEntries` (the "≥6 over time" portfolio goal) is a display-only nudge and
 * is intentionally NOT enforced here, matching the lesson's build-it-over-time
 * framing. Returns the specific reason it isn't ready so the UI can announce it.
 */
export function evaluateFailureLogReadiness(
  entries: FailureEntry[],
  config: FailureLogConfig,
): FailureLogReadiness {
  const completeEntries = entries.filter(isFailureEntryComplete).length;
  const reasons: string[] = [];
  if (completeEntries < config.minEntries) {
    const need = config.minEntries - completeEntries;
    reasons.push(`Add ${need} more complete ${need === 1 ? 'entry' : 'entries'} (each needs a date and all four fields).`);
  }
  return { ready: reasons.length === 0, reasons, completeEntries };
}

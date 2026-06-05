export interface DashboardCritiqueInput {
  /** Signal ids the learner marked as MISSING. */
  selectedIds: string[];
  signals: { id: string; hidden: boolean }[];
}

export interface DashboardCritiqueResult {
  /** Hidden signals the learner correctly flagged (true positives). */
  correct: string[];
  /** Hidden signals the learner did NOT flag (false negatives). */
  missed: string[];
  /** Visible decoys the learner wrongly flagged (false positives). */
  falseFlags: string[];
  /** Count of hidden signals in the config. */
  hiddenTotal: number;
  /** correct.length — how many hidden signals the learner named. */
  namedCount: number;
}

/**
 * Pure scoring for the dashboard-critique exercise — no React, so it's
 * unit-testable. Walks `signals` in config order (stable, testable output) and
 * sorts each into a bucket by whether it's hidden (the answer key) and whether
 * the learner selected it. Ids in `selectedIds` that aren't real signals are
 * ignored; an empty selection puts every hidden signal in `missed`.
 */
export function scoreDashboardCritique(
  input: DashboardCritiqueInput,
): DashboardCritiqueResult {
  const selected = new Set(input.selectedIds);
  const correct: string[] = [];
  const missed: string[] = [];
  const falseFlags: string[] = [];

  for (const signal of input.signals) {
    const picked = selected.has(signal.id);
    if (signal.hidden && picked) correct.push(signal.id);
    else if (signal.hidden && !picked) missed.push(signal.id);
    else if (!signal.hidden && picked) falseFlags.push(signal.id);
    // !hidden && !picked → correctly left unflagged; nothing to record.
  }

  const hiddenTotal = input.signals.filter((s) => s.hidden).length;
  return { correct, missed, falseFlags, hiddenTotal, namedCount: correct.length };
}

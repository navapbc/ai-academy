import { getSupabaseClient } from './supabaseClient';

// Learner portfolio reader (P5.3b). Surfaces, on the learner's own dashboard, the
// artifacts the Stage-2 practice instruments persist to lab_submissions.transcript:
// the PairedCalibration number (2.15), confidence calibration (2.8), the
// failure-mode log (2.9), and the use-case library + 4D Diligence Statement (2.11).
//
// Owner-RLS only: the read is scoped to the signed-in user's own rows (userId =
// the caller), so the existing owner policy on lab_submissions already permits it —
// no new policy, view, or migration. transcript is free-form jsonb, so every parser
// is defensive (typed `unknown`, type-guarded, returns null on a shape mismatch) —
// an old or partial row degrades to "not submitted yet", never a crash.

// The cells whose transcripts feed the portfolio view.
export const PORTFOLIO_LAB_IDS = ['2.15', '2.8', '2.9', '2.11'] as const;

// ---------------------------------------------------------------------------
// Parsed artifact shapes
// ---------------------------------------------------------------------------

export interface PairedCalibrationArtifact {
  /** The calibration number: |estimate − actual speedup|, in points. Lower = better. */
  gapPct: number;
  estimatePct: number;
  actualSpeedupPct: number;
  offMs: number;
  onMs: number;
  offDefects: number;
  onDefects: number;
  createdAt: string;
}

export interface ConfidenceCalibrationArtifact {
  calibrated: number;
  over: number;
  under: number;
  unanswered: number;
  score: number;
  maxScore: number;
  createdAt: string;
}

export interface FailureLogEntry {
  date: string;
  task: string;
  error: string;
  caught: string;
  tell: string;
}
export interface FailureLogArtifact {
  entries: FailureLogEntry[];
  entryCount: number;
  createdAt: string;
}

export interface UseCaseEntry {
  verdict: 'helps' | 'doesnt';
  task: string;
  approach: string;
  watch: string;
}
export interface UseCasePortfolioArtifact {
  entries: UseCaseEntry[];
  /** Diligence Statement text keyed by 4D dimension id (e.g. "delegation"). */
  statement: Record<string, string>;
  helpsCount: number;
  doesntCount: number;
  wordCount: number;
  createdAt: string;
}

export interface LearnerPortfolio {
  pairedCalibration: PairedCalibrationArtifact | null;
  confidenceCalibration: ConfidenceCalibrationArtifact | null;
  failureLog: FailureLogArtifact | null;
  useCasePortfolio: UseCasePortfolioArtifact | null;
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function asNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function asStr(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

// ---------------------------------------------------------------------------
// Parsers (transcript: unknown → typed artifact | null)
// ---------------------------------------------------------------------------

export function parsePairedCalibration(
  transcript: unknown,
  createdAt: string,
): PairedCalibrationArtifact | null {
  if (!isObj(transcript)) return null;
  const gapPct = asNum(transcript.gapPct);
  const actualSpeedupPct = asNum(transcript.actualSpeedupPct);
  const estimatePct = asNum(transcript.estimatePct);
  // The three derived numbers are the heart of the artifact; bail if any is missing.
  if (gapPct === null || actualSpeedupPct === null || estimatePct === null) return null;
  return {
    gapPct,
    estimatePct,
    actualSpeedupPct,
    offMs: asNum(transcript.offMs) ?? 0,
    onMs: asNum(transcript.onMs) ?? 0,
    offDefects: asNum(transcript.offDefects) ?? 0,
    onDefects: asNum(transcript.onDefects) ?? 0,
    createdAt,
  };
}

export function parseConfidenceCalibration(
  transcript: unknown,
  createdAt: string,
): ConfidenceCalibrationArtifact | null {
  if (!isObj(transcript) || transcript.kind !== 'calibration') return null;
  if (!isObj(transcript.summary)) return null;
  const s = transcript.summary;
  const score = asNum(transcript.score);
  const maxScore = asNum(transcript.maxScore);
  if (score === null || maxScore === null) return null;
  return {
    calibrated: asNum(s.calibrated) ?? 0,
    over: asNum(s.over) ?? 0,
    under: asNum(s.under) ?? 0,
    unanswered: asNum(s.unanswered) ?? 0,
    score,
    maxScore,
    createdAt,
  };
}

export function parseFailureLog(transcript: unknown, createdAt: string): FailureLogArtifact | null {
  if (!isObj(transcript) || transcript.kind !== 'failure-log') return null;
  if (!Array.isArray(transcript.entries)) return null;
  const entries: FailureLogEntry[] = transcript.entries.filter(isObj).map((e) => ({
    date: asStr(e.date),
    task: asStr(e.task),
    error: asStr(e.error),
    caught: asStr(e.caught),
    tell: asStr(e.tell),
  }));
  return {
    entries,
    entryCount: asNum(transcript.entryCount) ?? entries.length,
    createdAt,
  };
}

export function parseUseCasePortfolio(
  transcript: unknown,
  createdAt: string,
): UseCasePortfolioArtifact | null {
  if (!isObj(transcript) || transcript.kind !== 'use-case-portfolio') return null;
  if (!Array.isArray(transcript.entries)) return null;
  const entries: UseCaseEntry[] = transcript.entries.filter(isObj).map((e) => ({
    verdict: e.verdict === 'doesnt' ? 'doesnt' : 'helps',
    task: asStr(e.task),
    approach: asStr(e.approach),
    watch: asStr(e.watch),
  }));
  const statement: Record<string, string> = {};
  if (isObj(transcript.statement)) {
    for (const [k, v] of Object.entries(transcript.statement)) statement[k] = asStr(v);
  }
  return {
    entries,
    statement,
    helpsCount: asNum(transcript.helpsCount) ?? entries.filter((e) => e.verdict === 'helps').length,
    doesntCount: asNum(transcript.doesntCount) ?? entries.filter((e) => e.verdict === 'doesnt').length,
    wordCount: asNum(transcript.wordCount) ?? 0,
    createdAt,
  };
}

// ---------------------------------------------------------------------------
// Build + fetch
// ---------------------------------------------------------------------------

/** Raw lab_submissions row shape for the portfolio read. */
export interface PortfolioRow {
  lab_id: string;
  transcript: unknown;
  created_at: string;
}

/**
 * Pure: from the learner's lab_submissions rows (any order), pick the most recent
 * submission per portfolio lab id and parse it into the typed artifact. A row that
 * fails to parse is treated as absent (null).
 */
export function buildLearnerPortfolio(rows: PortfolioRow[]): LearnerPortfolio {
  // Latest row per lab id.
  const latest = new Map<string, PortfolioRow>();
  for (const row of rows) {
    const prev = latest.get(row.lab_id);
    if (!prev || row.created_at > prev.created_at) latest.set(row.lab_id, row);
  }
  const r = (id: string) => latest.get(id);
  const paired = r('2.15');
  const conf = r('2.8');
  const fail = r('2.9');
  const useCase = r('2.11');
  return {
    pairedCalibration: paired ? parsePairedCalibration(paired.transcript, paired.created_at) : null,
    confidenceCalibration: conf
      ? parseConfidenceCalibration(conf.transcript, conf.created_at)
      : null,
    failureLog: fail ? parseFailureLog(fail.transcript, fail.created_at) : null,
    useCasePortfolio: useCase
      ? parseUseCasePortfolio(useCase.transcript, useCase.created_at)
      : null,
  };
}

/**
 * Reads the signed-in learner's own portfolio artifacts. Owner RLS scopes the read
 * to userId's rows; an unsubmitted instrument simply has no row → null artifact.
 */
export async function fetchLearnerPortfolio(userId: string): Promise<LearnerPortfolio> {
  const { data, error } = await getSupabaseClient()
    .from('lab_submissions')
    .select('lab_id, transcript, created_at')
    .eq('user_id', userId)
    .in('lab_id', PORTFOLIO_LAB_IDS as unknown as string[])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return buildLearnerPortfolio((data ?? []) as PortfolioRow[]);
}

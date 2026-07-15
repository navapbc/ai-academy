import { getSupabaseClient } from './supabaseClient';
import type { GradeResult } from './grading';

// Supabase data-access for learner progress and quiz scores. Pure async
// functions (no React, no localStorage) so they can be unit-tested against the
// local stack. RLS is owner-only, so callers must be signed in and pass their
// own user id. Each function maps DB rows <-> app types and throws on error.

export type ModuleStatus = 'in_progress' | 'completed';

/**
 * How a completion happened (restructure U9, R15/R16). Stamped into
 * `module_progress.completed_via` (CHECK: quiz|lab|sorter|explored|null).
 * Never surfaced to learners in v1 — it is an era/analytics marker.
 */
export type CompletedVia = 'quiz' | 'lab' | 'sorter' | 'explored';

/**
 * A participation event: the learner did the module's activity (a recorded lab
 * submission or a finished quiz attempt). Completion is an EVENT, never derived
 * state — these fire from the data layer because `recordLabSubmission` is called
 * inside ~20 exercise components (a renderer-level hook can't see those calls,
 * and per-component threading would break the additive-kinds merge property).
 *
 * NOTE 'sorter' is in the union for parity with `CompletedVia`, but no data-layer
 * path emits it today: ScenarioSorter grades entirely client-side and persists
 * nothing, so its completion flows through the renderer's explicit
 * onComplete('sorter') instead (see ModuleRenderer).
 */
export interface ParticipationEvent {
  moduleId: string;
  via: 'quiz' | 'lab' | 'sorter';
}

const participationListeners = new Set<(e: ParticipationEvent) => void>();

/**
 * Subscribes to participation events (U9). Returns an unsubscribe function.
 * `useProgress` subscribes and auto-completes the module (`completeModule(id,
 * via)`), so finishing an activity completes its module with no per-component
 * wiring.
 */
export function onParticipation(cb: (e: ParticipationEvent) => void): () => void {
  participationListeners.add(cb);
  return () => {
    participationListeners.delete(cb);
  };
}

/** Emits to all subscribers. A listener error must never break the write path. */
function emitParticipation(event: ParticipationEvent): void {
  for (const cb of [...participationListeners]) {
    try {
      cb(event);
    } catch {
      // Completion is best-effort on top of the durable submission/attempt row.
    }
  }
}

export interface ModuleProgressSnapshot {
  completedModuleIds: string[];
  inProgressModuleIds: string[];
  /** Most recently updated in_progress module, used to resume position. */
  latestInProgressId: string | null;
}

export interface QuizAttemptInput {
  moduleId: string;
  score: number;
  maxScore: number;
  passed: boolean;
  /** Map of question index -> selected option index, or null. */
  answers: Record<string, number> | null;
}

export interface QuizResult {
  score: number;
  maxScore: number;
  passed: boolean;
}

export interface QuizSummary {
  best: QuizResult | null;
  latest: QuizResult | null;
}

/** Reads all module_progress rows for the user into a snapshot. */
export async function fetchModuleProgress(userId: string): Promise<ModuleProgressSnapshot> {
  const { data, error } = await getSupabaseClient()
    .from('module_progress')
    .select('module_id, status, updated_at')
    .eq('user_id', userId)
    // Secondary sort by module_id so rows with identical updated_at have a
    // deterministic order — `latestInProgressId` (= first in_progress row) is
    // then stable across reloads instead of arbitrary (DATA-06).
    .order('updated_at', { ascending: false })
    .order('module_id', { ascending: true });

  if (error) throw error;

  const rows = data ?? [];
  const completedModuleIds = rows
    .filter((r) => r.status === 'completed')
    .map((r) => r.module_id as string);
  const inProgress = rows.filter((r) => r.status === 'in_progress');
  const inProgressModuleIds = inProgress.map((r) => r.module_id as string);
  // Rows come back ordered by updated_at desc, so the first in_progress is latest.
  const latestInProgressId = (inProgress[0]?.module_id as string) ?? null;

  return { completedModuleIds, inProgressModuleIds, latestInProgressId };
}

/**
 * Upserts the status of a single module on the (user_id, module_id) key.
 *
 * `via` (U9) is stamped into `completed_via` on completion writes. When a
 * completion's via is unknown (e.g. a pre-U9 outbox entry replaying), the
 * column is OMITTED from the payload — we never guess, and an upsert-update
 * then leaves any existing value untouched. `in_progress` writes clear it,
 * mirroring `completed_at`.
 *
 * `epoch` (U10) is the module's `progress_reset_at` AS CAPTURED WHEN THE
 * COMPLETION HAPPENED (null = the module had never been reset / legacy entry),
 * written into `reset_epoch`. The DB trigger rejects a completion whose epoch
 * predates the module's current reset with a STALE_RESET_EPOCH error —
 * callers classify that via `submitCompletion` below. `in_progress` writes
 * clear it (the trigger ignores them anyway).
 */
export async function setModuleStatus(
  userId: string,
  moduleId: string,
  status: ModuleStatus,
  via?: CompletedVia | null,
  epoch?: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    user_id: userId,
    module_id: moduleId,
    status,
    completed_at: status === 'completed' ? now : null,
    updated_at: now,
  };
  if (status === 'completed') {
    if (via) row.completed_via = via;
    row.reset_epoch = epoch ?? null;
  } else {
    row.completed_via = null;
    row.reset_epoch = null;
  }
  const { error } = await getSupabaseClient()
    .from('module_progress')
    .upsert(row, { onConflict: 'user_id,module_id' });

  if (error) throw error;
}

// --- Progress-reset epoch protocol (U10) ------------------------------------

/**
 * The DB trigger's dedicated error contract (see migration
 * 20260715050000_progress_reset_epoch.sql): a rejected stale-epoch completion
 * raises `STALE_RESET_EPOCH: …` — the message PREFIX is the contract. This is
 * the ONLY terminal completion-write error; everything else keeps the
 * park-and-retry semantics (DATA-02).
 */
export function isStaleResetEpochError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message.includes('STALE_RESET_EPOCH');
}

/**
 * Reads the module's CURRENT `progress_reset_at` (used only by the
 * stale-session refinement in `submitCompletion`). A module the caller cannot
 * see (RLS — e.g. an unenrolled learner and a program module) resolves to
 * null, which the refinement treats as "cannot verify → drop" (fail-closed).
 */
export async function fetchModuleResetEpoch(moduleId: string): Promise<string | null> {
  const { data, error } = await getSupabaseClient()
    .from('modules')
    .select('progress_reset_at')
    .eq('cell_id', moduleId)
    .maybeSingle();
  if (error) throw error;
  return (data?.progress_reset_at as string | null) ?? null;
}

/**
 * Whether a locally captured completion epoch is still current against the
 * module's reset epoch: true when the module was never reset, or the captured
 * epoch is at (or after) the reset. Timestamps are compared as instants —
 * never as strings, because the client's `toISOString()` ('…Z') and
 * PostgREST's ('…+00:00') formats do not sort lexicographically.
 */
export function isEpochCurrent(
  capturedEpoch: string | null,
  moduleResetAt: string | null,
): boolean {
  if (moduleResetAt === null) return true;
  if (capturedEpoch === null) return false;
  return new Date(capturedEpoch).getTime() >= new Date(moduleResetAt).getTime();
}

/** True when work done at `eventAt` is genuinely NEWER than the reset itself. */
export function shouldResubmitAfterReset(
  eventAt: string | null,
  currentResetAt: string | null,
): boolean {
  if (eventAt === null || currentResetAt === null) return false;
  return new Date(eventAt).getTime() > new Date(currentResetAt).getTime();
}

/**
 * How a completion write resolved (U10 classification):
 *  - 'ok'    — the row is on the server; drop any outbox entry.
 *  - 'retry' — transient failure (offline, 5xx, …): park in the outbox and
 *              replay on the next reconcile (today's DATA-02 semantics).
 *  - 'reset' — TERMINAL: the module was reset after this work happened. Drop
 *              the entry, purge the local completion, show the reset notice.
 */
export type CompletionSyncOutcome = 'ok' | 'retry' | 'reset';

/**
 * Performs one completion write with the U10 classification. `epoch` and
 * `eventAt` are the values CAPTURED WHEN THE COMPLETION HAPPENED — callers
 * (useProgress, its outbox replay) must pass the stored values and never
 * re-derive them from freshly fetched curriculum, which would resurrect resets.
 *
 * STALE_RESET_EPOCH refinement (never wrongly drop genuinely new work): when
 * the stored `eventAt` is AFTER the module's current `progress_reset_at` — the
 * learner did the work in a stale session AFTER the reset — refetch the epoch
 * once and resubmit with it. Otherwise the rejection is terminal ('reset').
 * A transient failure of the refetch/resubmit itself returns 'retry' (the
 * entry stays parked; the server re-adjudicates on every replay, so nothing
 * can be resurrected by retrying).
 */
export async function submitCompletion(
  userId: string,
  moduleId: string,
  via: CompletedVia | null,
  epoch: string | null,
  eventAt: string | null,
): Promise<CompletionSyncOutcome> {
  try {
    await setModuleStatus(userId, moduleId, 'completed', via, epoch);
    return 'ok';
  } catch (error) {
    if (!isStaleResetEpochError(error)) return 'retry';
  }

  // STALE_RESET_EPOCH — the one refinement before declaring it terminal.
  let currentResetAt: string | null;
  try {
    currentResetAt = await fetchModuleResetEpoch(moduleId);
  } catch {
    return 'retry'; // transient read failure — the trigger re-adjudicates next replay
  }
  if (!shouldResubmitAfterReset(eventAt, currentResetAt)) return 'reset';
  try {
    await setModuleStatus(userId, moduleId, 'completed', via, currentResetAt);
    return 'ok';
  } catch (retryError) {
    // Stale again (another reset raced us) → terminal; anything else → parked.
    return isStaleResetEpochError(retryError) ? 'reset' : 'retry';
  }
}

/**
 * Inserts one quiz attempt (the table is append-only attempt history).
 *
 * Emits a `via: 'quiz'` participation event on success (U9). Every call site
 * records only FINISHED attempts — Quiz.tsx writes from its results effect,
 * which only runs once all questions are answered, and GlatExam writes only
 * when every scored question is answered — so "insert succeeded" here is
 * exactly "quiz finished, any score", the U9 auto-complete rule.
 */
export async function recordQuizAttempt(
  userId: string,
  attempt: QuizAttemptInput,
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('quiz_attempts')
    .insert({
      user_id: userId,
      module_id: attempt.moduleId,
      score: attempt.score,
      max_score: attempt.maxScore,
      passed: attempt.passed,
      answers: attempt.answers,
    });

  if (error) throw error;
  emitParticipation({ moduleId: attempt.moduleId, via: 'quiz' });
}

export interface LabSubmissionInput {
  labId: string;
  /** Free-form record of the lab run — e.g. { brief, prompt, response }. */
  transcript: unknown;
  status: string;
}

/**
 * Inserts one lab submission (append-only; RLS owner-only).
 *
 * Emits a `via: 'lab'` participation event on success (U9): a recorded
 * submission IS participation, so the module auto-completes. `labId` is the
 * module's cell_id, which is also its Module.id (modules.ts maps cell_id to
 * both), so the event's moduleId is directly completable.
 */
export async function recordLabSubmission(
  userId: string,
  submission: LabSubmissionInput,
): Promise<string> {
  const { data, error } = await getSupabaseClient()
    .from('lab_submissions')
    .insert({
      user_id: userId,
      lab_id: submission.labId,
      transcript: submission.transcript,
      status: submission.status,
    })
    .select('id')
    .single();

  if (error) throw error;
  emitParticipation({ moduleId: submission.labId, via: 'lab' });
  return data.id as string;
}

/** Updates a lab submission with its grade (P4.2). Owner-update RLS already exists. */
export async function saveGrade(
  submissionId: string,
  result: GradeResult,
  status: string,
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('lab_submissions')
    .update({ rubric_scores: result, grader: result.grader, status })
    .eq('id', submissionId);

  if (error) throw error;
}

/** Returns the best (highest score) and latest (most recent) attempts. */
export async function fetchQuizSummary(
  userId: string,
  moduleId: string,
): Promise<QuizSummary> {
  const { data, error } = await getSupabaseClient()
    .from('quiz_attempts')
    .select('score, max_score, passed, attempted_at')
    .eq('user_id', userId)
    .eq('module_id', moduleId);

  if (error) throw error;

  const rows = data ?? [];
  if (rows.length === 0) return { best: null, latest: null };

  const toResult = (r: (typeof rows)[number]): QuizResult => ({
    score: r.score as number,
    maxScore: r.max_score as number,
    passed: r.passed as boolean,
  });

  const best = rows.reduce((a, b) => ((b.score as number) > (a.score as number) ? b : a));
  const latest = rows.reduce((a, b) =>
    (b.attempted_at as string) > (a.attempted_at as string) ? b : a,
  );

  return { best: toResult(best), latest: toResult(latest) };
}

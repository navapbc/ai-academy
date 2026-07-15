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
 */
export async function setModuleStatus(
  userId: string,
  moduleId: string,
  status: ModuleStatus,
  via?: CompletedVia | null,
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
  } else {
    row.completed_via = null;
  }
  const { error } = await getSupabaseClient()
    .from('module_progress')
    .upsert(row, { onConflict: 'user_id,module_id' });

  if (error) throw error;
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

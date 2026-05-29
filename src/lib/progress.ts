import { getSupabaseClient } from './supabaseClient';

// Supabase data-access for learner progress and quiz scores. Pure async
// functions (no React, no localStorage) so they can be unit-tested against the
// local stack. RLS is owner-only, so callers must be signed in and pass their
// own user id. Each function maps DB rows <-> app types and throws on error.

export type ModuleStatus = 'in_progress' | 'completed';

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
    .order('updated_at', { ascending: false });

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

/** Upserts the status of a single module on the (user_id, module_id) key. */
export async function setModuleStatus(
  userId: string,
  moduleId: string,
  status: ModuleStatus,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await getSupabaseClient()
    .from('module_progress')
    .upsert(
      {
        user_id: userId,
        module_id: moduleId,
        status,
        completed_at: status === 'completed' ? now : null,
        updated_at: now,
      },
      { onConflict: 'user_id,module_id' },
    );

  if (error) throw error;
}

/** Inserts one quiz attempt (the table is append-only attempt history). */
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

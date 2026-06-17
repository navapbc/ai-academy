import { getSupabaseClient } from './supabaseClient';
import type { GradeResult } from './grading';

// Champion/admin review queue (P5.5b). Lists lab_submissions awaiting review
// (status='reviewable' — the judge-graded labs) and surfaces each one's learner
// submission + LLM verdict for a reviewer. Read-only this slice (the champion grade
// action is P5.5c). No new RLS/migration: the P5.1c champion/admin SELECT policies
// on lab_submissions already scope the read (a champion sees only their cohort's
// rows, an admin all), so the status filter rides on top. Pure shaping fns (no
// React) so they unit-test like dashboard.ts.

export interface ReviewQueueItem {
  submissionId: string;
  learnerUserId: string;
  /** full_name, else email, else a short id fallback. */
  learnerName: string;
  labId: string;
  transcript: unknown;
  rubricScores: GradeResult | null;
  grader: string | null;
  createdAt: string;
}

// Raw PostgREST row shapes.
export interface ReviewSubmissionRow {
  id: string;
  user_id: string;
  lab_id: string;
  transcript: unknown;
  rubric_scores: GradeResult | null;
  grader: string | null;
  created_at: string;
}
export interface ProfileNameRow {
  id: string;
  full_name: string | null;
  email: string | null;
}

const SUBMISSION_COLUMNS = 'id, user_id, lab_id, transcript, rubric_scores, grader, created_at';

/**
 * Pure: join reviewable submissions to learner names (the buildLearnerRoster
 * pattern) and sort newest-first. Names are resolved only for the ids the
 * RLS-scoped read surfaced, so the queue never names a learner the caller can't see.
 */
export function buildReviewQueue(
  rows: ReviewSubmissionRow[],
  names: ProfileNameRow[],
): ReviewQueueItem[] {
  const byId = new Map(names.map((n) => [n.id, n]));
  return rows
    .map((r) => {
      const profile = byId.get(r.user_id);
      const name =
        profile?.full_name?.trim() || profile?.email || `Learner ${r.user_id.slice(0, 8)}`;
      return {
        submissionId: r.id,
        learnerUserId: r.user_id,
        learnerName: name,
        labId: r.lab_id,
        transcript: r.transcript,
        rubricScores: r.rubric_scores ?? null,
        grader: r.grader,
        createdAt: r.created_at,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ---------------------------------------------------------------------------
// Transcript → labeled submission blocks (defensive; transcript is free-form jsonb)
// ---------------------------------------------------------------------------

export interface SubmissionField {
  label: string;
  value: string;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function asStr(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * Pure: extract the learner-authored artifact from a submission transcript as
 * labeled text blocks, keyed by the lab's transcript kind. Falls back to the raw
 * JSON for an unrecognized shape so a reviewer always sees *something*.
 */
export function summarizeSubmission(transcript: unknown): SubmissionField[] {
  if (!isObj(transcript)) return [{ label: 'Submission', value: '' }];

  const kind = typeof transcript.kind === 'string' ? transcript.kind : null;

  if (kind === 'voice-edit') {
    return [
      { label: 'AI first draft', value: asStr(transcript.draft) },
      { label: 'Learner revision (AI-off)', value: asStr(transcript.revision) },
    ];
  }
  if (kind === 'iteration') {
    const messages = Array.isArray(transcript.messages) ? transcript.messages : [];
    const userTurns = messages
      .filter((m): m is Record<string, unknown> => isObj(m) && m.role === 'user')
      .map((m) => asStr(m.content))
      .filter((t) => t !== '');
    const turns =
      typeof transcript.turnCount === 'number' ? transcript.turnCount : userTurns.length;
    return [
      { label: 'Turns', value: String(turns) },
      { label: 'Learner messages', value: userTurns.join('\n\n— — —\n\n') },
    ];
  }
  if (kind === 'prompt-eval') {
    return [{ label: 'Reusable prompt', value: asStr(transcript.prompt) }];
  }
  // critique / synthesis store the text under a key named for the kind.
  if (kind && typeof transcript[kind] === 'string') {
    return [{ label: 'Response', value: asStr(transcript[kind]) }];
  }
  // 2.1 prompt-construction: { brief, prompt, response } (no kind).
  if (typeof transcript.prompt === 'string') {
    const fields: SubmissionField[] = [{ label: 'Prompt', value: asStr(transcript.prompt) }];
    if (typeof transcript.response === 'string') {
      fields.push({ label: 'Claude response', value: asStr(transcript.response) });
    }
    return fields;
  }
  return [{ label: 'Submission', value: JSON.stringify(transcript) }];
}

/**
 * Reads the reviewable submissions visible to the caller (RLS-scoped by P5.1c),
 * then resolves learner names for exactly the ids surfaced.
 */
export async function fetchReviewQueue(): Promise<ReviewQueueItem[]> {
  const sb = getSupabaseClient();
  const { data: rows, error } = await sb
    .from('lab_submissions')
    .select(SUBMISSION_COLUMNS)
    .eq('status', 'reviewable');
  if (error) throw error;

  const submissionRows = (rows ?? []) as ReviewSubmissionRow[];
  const ids = [...new Set(submissionRows.map((r) => r.user_id))];
  if (ids.length === 0) return [];

  const { data: names, error: nameError } = await sb
    .from('profiles')
    .select('id, full_name, email')
    .in('id', ids);
  if (nameError) throw nameError;

  return buildReviewQueue(submissionRows, (names ?? []) as ProfileNameRow[]);
}

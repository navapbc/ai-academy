import { getSupabaseClient } from './supabaseClient';

// Staff per-learner drill-down data-access (P5.2c). Reads only substrate that
// already exists: the P5.2a `learner_progress_summary` view (the RLS-scoped
// roster spine) for the roster, and the P5.1c champion/admin SELECT policies on
// module_progress / quiz_attempts / lab_submissions for one learner's detail.
// RLS scopes every read to the caller — a champion sees only their cohort's
// learners, an admin sees all, a learner sees nothing. No new view or policy.
// Pure shaping fns (no React) so they unit-test like dashboard.ts.

function toNum(v: number | string | null): number | null {
  if (v === null || v === '') return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// Roster — one row per visible learner, grouped by cohort in the UI.
// ---------------------------------------------------------------------------

/** One visible learner's rolled-up metrics (from learner_progress_summary). */
export interface LearnerRosterEntry {
  userId: string;
  cohortId: string | null;
  /** Display name: full_name, else email, else a short id fallback. */
  name: string;
  email: string | null;
  completionPct: number | null; // 0..1
  avgQuizPct: number | null;    // 0..1
  glatPassed: boolean;
  reviewableLabs: number;
}

// Raw PostgREST shapes. `numeric` columns come back as strings.
export interface LearnerSummaryRow {
  user_id: string;
  cohort_id: string | null;
  completion_pct: number | string | null;
  avg_quiz_pct: number | string | null;
  glat_passed: boolean;
  reviewable_labs: number;
}
export interface ProfileNameRow {
  id: string;
  full_name: string | null;
  email: string | null;
}

const LEARNER_SUMMARY_COLUMNS =
  'user_id, cohort_id, completion_pct, avg_quiz_pct, glat_passed, reviewable_labs';

/**
 * Pure: join summary rows to profile names, coerce numerics, sort by name.
 * Name lookup is keyed on the ids the RLS-scoped view returned, so we never
 * surface a learner the caller can't see.
 */
export function buildLearnerRoster(
  rows: LearnerSummaryRow[],
  names: ProfileNameRow[],
): LearnerRosterEntry[] {
  const byId = new Map(names.map((n) => [n.id, n]));
  return rows
    .map((r) => {
      const profile = byId.get(r.user_id);
      const email = profile?.email ?? null;
      const name = profile?.full_name?.trim() || email || `Learner ${r.user_id.slice(0, 8)}`;
      return {
        userId: r.user_id,
        cohortId: r.cohort_id,
        name,
        email,
        completionPct: toNum(r.completion_pct),
        avgQuizPct: toNum(r.avg_quiz_pct),
        glatPassed: r.glat_passed,
        reviewableLabs: r.reviewable_labs,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Reads the RLS-scoped learner roster (the drill-down spine), then resolves
 * names for exactly the ids the view surfaced — mirroring fetchCohortSummaries'
 * cohort-name lookup. Returns every visible learner; the UI groups by cohort.
 */
export async function fetchCohortLearners(): Promise<LearnerRosterEntry[]> {
  const sb = getSupabaseClient();
  const { data: rows, error } = await sb
    .from('learner_progress_summary')
    .select(LEARNER_SUMMARY_COLUMNS);
  if (error) throw error;

  const summaryRows = (rows ?? []) as LearnerSummaryRow[];
  const ids = summaryRows.map((r) => r.user_id);
  if (ids.length === 0) return [];

  const { data: names, error: nameError } = await sb
    .from('profiles')
    .select('id, full_name, email')
    .in('id', ids);
  if (nameError) throw nameError;

  return buildLearnerRoster(summaryRows, (names ?? []) as ProfileNameRow[]);
}

// ---------------------------------------------------------------------------
// Detail — one learner's best-per-module rollup + lab submission statuses.
// ---------------------------------------------------------------------------

/**
 * Section grouping (restructure U13): the rollup groups by the curriculum
 * sections the app renders — course lessons, then "Supplemental coursework"
 * (matrix), then "Resources & additional lessons" (custom) — replacing the
 * retired stage grouping. This surface has only module rows (no course/week
 * structure fetch), so course lessons share one "Course lessons" heading
 * rather than per-week titles; deliberately NO extra DB round-trip here.
 */
const SECTION_BY_ORIGIN: Record<string, { label: string; rank: number }> = {
  course: { label: 'Course lessons', rank: 0 },
  matrix: { label: 'Supplemental coursework', rank: 1 },
  custom: { label: 'Resources & additional lessons', rank: 2 },
};

/** Display section (group heading) for a module's origin. */
export function sectionForOrigin(origin: string): string {
  return SECTION_BY_ORIGIN[origin]?.label ?? origin;
}

/** One published module's status for a learner (best-per-module rollup). */
export interface LearnerModuleRow {
  cellId: string;
  title: string;
  /** Display section the row groups under (see SECTION_BY_ORIGIN). */
  section: string;
  completed: boolean;
  /** Best quiz score as a 0..1 fraction, or null if never attempted. */
  bestQuizPct: number | null;
  /** Whether the best attempt passed, or null if never attempted. */
  quizPassed: boolean | null;
}

/** One lab submission's status (badges only — transcript reading is P5.5). */
export interface LearnerLabRow {
  id: string;
  labId: string;
  status: string | null;
  createdAt: string;
}

export interface LearnerDetailData {
  modules: LearnerModuleRow[];
  labs: LearnerLabRow[];
}

// Raw row shapes for the three scoped reads.
export interface PublishedModuleRow {
  cell_id: string;
  title: string;
  origin: string;
}
export interface ModuleProgressRow {
  module_id: string;
  status: string;
}
export interface QuizAttemptRow {
  module_id: string;
  score: number | null;
  max_score: number | null;
  passed: boolean | null;
}
export interface LabSubmissionRow {
  id: string;
  lab_id: string;
  status: string | null;
  created_at: string;
}

/**
 * Pure: fold the three scoped reads into one row per published module. Walks the
 * published-module list (so not-yet-started modules still show, surfacing gaps),
 * marking completion from module_progress and the best quiz fraction per module.
 * Best = highest score/max_score over that module's attempts (ties keep the first
 * seen); attempts with no usable max_score are ignored. Rows are ordered by
 * section (course → supplemental → resources, matching the learner nav) with
 * the fetch order (sort_order) preserved within each section.
 */
export function buildLearnerModuleRows(
  modules: PublishedModuleRow[],
  progress: ModuleProgressRow[],
  quizzes: QuizAttemptRow[],
): LearnerModuleRow[] {
  const completedIds = new Set(
    progress.filter((p) => p.status === 'completed').map((p) => p.module_id),
  );

  // best quiz fraction per module_id
  const best = new Map<string, { pct: number; passed: boolean | null }>();
  for (const q of quizzes) {
    if (q.max_score === null || q.max_score <= 0 || q.score === null) continue;
    const pct = q.score / q.max_score;
    const prior = best.get(q.module_id);
    if (!prior || pct > prior.pct) {
      best.set(q.module_id, { pct, passed: q.passed });
    }
  }

  return modules
    .map((m): { rank: number; row: LearnerModuleRow } => {
      const b = best.get(m.cell_id);
      return {
        rank: SECTION_BY_ORIGIN[m.origin]?.rank ?? Number.MAX_SAFE_INTEGER,
        row: {
          cellId: m.cell_id,
          title: m.title,
          section: sectionForOrigin(m.origin),
          completed: completedIds.has(m.cell_id),
          bestQuizPct: b ? b.pct : null,
          quizPassed: b ? b.passed : null,
        },
      };
    })
    // Stable sort: section rank first (unknown origins last), fetch order within.
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.row);
}

/** Pure: map raw lab rows to display rows (newest first). */
export function buildLearnerLabRows(rows: LabSubmissionRow[]): LearnerLabRow[] {
  return rows
    .map((r) => ({ id: r.id, labId: r.lab_id, status: r.status, createdAt: r.created_at }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Reads one learner's detail across the three RLS-scoped activity tables plus
 * the published-module list. Champion/admin SELECT (P5.1c) scopes the activity
 * reads to learners the caller can see; an out-of-cohort id returns empty rows
 * (RLS-filtered), never an error.
 *
 * INVARIANT (U13): this is also the LEARNER self-view's data path
 * (LearnerDashboard → useLearnerDetail(own id) → here), so it must read only
 * the base tables under owner/champion RLS — NEVER the staff
 * `learner_progress_summary` view, whose viewer-independent denominator has
 * deliberately different semantics. Asserted by learnerDetail.test.ts.
 */
export async function fetchLearnerDetail(userId: string): Promise<LearnerDetailData> {
  const sb = getSupabaseClient();

  const [modulesRes, progressRes, quizRes, labRes] = await Promise.all([
    sb.from('modules').select('cell_id, title, origin').eq('status', 'published').order('sort_order', { ascending: true }),
    sb.from('module_progress').select('module_id, status').eq('user_id', userId),
    sb.from('quiz_attempts').select('module_id, score, max_score, passed').eq('user_id', userId),
    sb.from('lab_submissions').select('id, lab_id, status, created_at').eq('user_id', userId),
  ]);

  if (modulesRes.error) throw modulesRes.error;
  if (progressRes.error) throw progressRes.error;
  if (quizRes.error) throw quizRes.error;
  if (labRes.error) throw labRes.error;

  return {
    modules: buildLearnerModuleRows(
      (modulesRes.data ?? []) as PublishedModuleRow[],
      (progressRes.data ?? []) as ModuleProgressRow[],
      (quizRes.data ?? []) as QuizAttemptRow[],
    ),
    labs: buildLearnerLabRows((labRes.data ?? []) as LabSubmissionRow[]),
  };
}

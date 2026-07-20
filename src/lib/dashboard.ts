import { getSupabaseClient } from './supabaseClient';

// Staff cohort-dashboard data-access (P5.2b). Pure async reads of the P5.2a
// aggregation views (cohort_progress_summary, cohort_score_distribution) plus
// cohort names. No React, no cache. RLS scopes every read to the caller: a
// champion sees only their cohort, an admin sees all, a learner sees nothing.
// This slice adds no policy or view — it only consumes P5.2a.

export type ScoreBand = 'lt60' | '60to79' | '80to100';

export interface ScoreDistribution {
  lt60: number;
  '60to79': number;
  '80to100': number;
}

/** One visible cohort's rolled-up metrics (the four summary cards). */
export interface CohortSummary {
  cohortId: string;
  cohortName: string;
  /** U5: archived cohorts stay readable (read-only) and are labeled as such. */
  archived: boolean;
  learnerCount: number;
  avgCompletionPct: number | null; // 0..1
  glatPassRate: number | null;     // 0..1 — 0 until the GLAT (P4.10) ships
  avgQuizPct: number | null;       // 0..1
  reviewableTotal: number;         // integer count
}

// Raw PostgREST shapes. Postgres `numeric` (avg/rate) comes back as a string to
// preserve precision; `::int` columns come back as numbers.
export interface CohortSummaryRow {
  cohort_id: string | null;
  learner_count: number;
  avg_completion_pct: number | string | null;
  glat_pass_rate: number | string | null;
  avg_quiz_pct: number | string | null;
  reviewable_total: number;
}
export interface CohortNameRow {
  id: string;
  name: string;
  archived_at: string | null;
}
export interface DistributionRow {
  cohort_id: string | null;
  band: ScoreBand;
  learner_count: number;
}

function toNum(v: number | string | null): number | null {
  if (v === null || v === '') return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isNaN(n) ? null : n;
}

/**
 * Pure: join summary rows to cohort names, drop the NULL-cohort group
 * (unenrolled learners), coerce numerics, sort by cohort name. Name lookup is
 * keyed on the ids the RLS-scoped summary returned, so we never surface a cohort
 * the caller can't see.
 */
export function buildCohortSummaries(
  rows: CohortSummaryRow[],
  names: CohortNameRow[],
): CohortSummary[] {
  const nameRowById = new Map(names.map((n) => [n.id, n]));
  return rows
    .filter((r): r is CohortSummaryRow & { cohort_id: string } => r.cohort_id !== null)
    .map((r) => ({
      cohortId: r.cohort_id,
      cohortName: nameRowById.get(r.cohort_id)?.name ?? 'Unnamed cohort',
      archived: (nameRowById.get(r.cohort_id)?.archived_at ?? null) !== null,
      learnerCount: r.learner_count,
      avgCompletionPct: toNum(r.avg_completion_pct),
      glatPassRate: toNum(r.glat_pass_rate),
      avgQuizPct: toNum(r.avg_quiz_pct),
      reviewableTotal: r.reviewable_total,
    }))
    .sort((a, b) => a.cohortName.localeCompare(b.cohortName));
}

/** Pure: pivot (cohort, band, count) rows into per-cohort band maps (missing bands = 0). */
export function pivotDistribution(rows: DistributionRow[]): Map<string, ScoreDistribution> {
  const out = new Map<string, ScoreDistribution>();
  for (const r of rows) {
    if (r.cohort_id === null) continue;
    const d = out.get(r.cohort_id) ?? { lt60: 0, '60to79': 0, '80to100': 0 };
    d[r.band] = r.learner_count;
    out.set(r.cohort_id, d);
  }
  return out;
}

/**
 * Reads the RLS-scoped cohort rollups, then looks up names for exactly the
 * cohort ids the view surfaced (never enumerating the world-readable cohorts
 * table). Returns real cohorts only, sorted by name.
 */
export async function fetchCohortSummaries(): Promise<CohortSummary[]> {
  const sb = getSupabaseClient();
  const { data: rows, error } = await sb
    .from('cohort_progress_summary')
    .select('cohort_id, learner_count, avg_completion_pct, glat_pass_rate, avg_quiz_pct, reviewable_total');
  if (error) throw error;

  const summaryRows = (rows ?? []) as CohortSummaryRow[];
  const ids = summaryRows
    .map((r) => r.cohort_id)
    .filter((id): id is string => id !== null);

  if (ids.length === 0) return [];

  const { data: names, error: nameError } = await sb
    .from('cohorts')
    .select('id, name, archived_at')
    .in('id', ids);
  if (nameError) throw nameError;

  return buildCohortSummaries(summaryRows, (names ?? []) as CohortNameRow[]);
}

/** Reads the RLS-scoped score distribution and pivots it per cohort. */
export async function fetchScoreDistribution(): Promise<Map<string, ScoreDistribution>> {
  const { data, error } = await getSupabaseClient()
    .from('cohort_score_distribution')
    .select('cohort_id, band, learner_count');
  if (error) throw error;
  return pivotDistribution((data ?? []) as DistributionRow[]);
}

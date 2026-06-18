import type {
  Dimension,
  EvidenceType,
  LabConfig,
  ModuleOrigin,
  ModuleStatus,
  ModuleType,
  QuizQuestion,
  SelfReportValidity,
  SorterConfig,
  Stage,
} from '../types';
import { getSupabaseClient } from './supabaseClient';

// Admin CMS read path (P5.4-2). Unlike the learner curriculum fetch (modules.ts),
// the CMS fetch includes ALL statuses (draft / in_review / published) AND archived
// rows, and selects the admin-only `draft` working copy, so an admin can see every
// lesson and any pending edits. Pure shaping fns (no React) so they unit-test like
// reviewQueue.ts / dashboard.ts. `modules` is authenticated-readable; the CMS UI
// surface is admin-gated in StaffArea (the accepted read posture per the plan —
// draft content is unpublished lesson copy, not sensitive). This chunk is read-only;
// CMS writes route through the admin-content function in later chunks.

/**
 * The editable fields an admin can stage in `modules.draft` (jsonb), keyed by the
 * LIVE column names so Publish is a straight draft → live copy. Every field is
 * optional: a draft may touch only a subset. Loosely typed because it is admin-
 * authored and re-validated on write; the read side only surfaces it for display.
 */
export interface DraftFields {
  title?: string;
  type?: ModuleType;
  body_md?: string | null;
  video_url?: string | null;
  tutor_reference_md?: string | null;
  quiz_json?: QuizQuestion[] | null;
  lab_config_json?: LabConfig | null;
  sorter_config_json?: SorterConfig | null;
}

/** Raw `modules` row as the CMS reads it (live columns + admin-only `draft`). */
export interface CmsLessonRow {
  cell_id: string;
  stage: Stage | null;
  status: ModuleStatus;
  origin: ModuleOrigin;
  title: string;
  type: ModuleType;
  dimension: Dimension[];
  evidence_type: EvidenceType;
  self_report_validity: SelfReportValidity;
  body_md: string | null;
  video_url: string | null;
  tutor_reference_md: string | null;
  archived_at: string | null;
  version: number;
  sort_order: number;
  updated_at: string;
  draft: DraftFields | null;
  quiz_json: QuizQuestion[] | null;
  lab_config_json: LabConfig | null;
  sorter_config_json: SorterConfig | null;
}

/** A row reduced to what the lesson list needs. */
export interface CmsLessonSummary {
  cellId: string;
  title: string;
  type: ModuleType;
  origin: ModuleOrigin;
  status: ModuleStatus;
  stage: Stage | null;
  /** A non-null `draft` means unpublished edits are staged on this row. */
  hasPendingDraft: boolean;
  /** A non-null `archived_at` means the lesson is soft-deleted (hidden from learners). */
  archived: boolean;
}

/** The full read-only detail: current LIVE content + any staged draft fields. */
export interface CmsLessonDetailData extends CmsLessonSummary {
  version: number;
  updatedAt: string;
  dimension: Dimension[];
  evidenceType: EvidenceType;
  selfReportValidity: SelfReportValidity;
  // Current LIVE content (what learners read today).
  bodyMd: string | null;
  videoUrl: string | null;
  tutorReference: string | null;
  quiz: QuizQuestion[] | null;
  labConfig: LabConfig | null;
  sorterConfig: SorterConfig | null;
  /** Staged working copy, or null when no edits are pending. */
  draft: DraftFields | null;
}

const CMS_COLUMNS =
  'cell_id, stage, status, origin, title, type, dimension, evidence_type, self_report_validity, ' +
  'body_md, video_url, tutor_reference_md, archived_at, version, sort_order, updated_at, draft, ' +
  'quiz_json, lab_config_json, sorter_config_json';

/** A row reduced to its list summary. */
export function toLessonSummary(row: CmsLessonRow): CmsLessonSummary {
  return {
    cellId: row.cell_id,
    title: row.title,
    type: row.type,
    origin: row.origin,
    status: row.status,
    stage: row.stage,
    hasPendingDraft: row.draft != null,
    archived: row.archived_at != null,
  };
}

/**
 * Pure: shape all rows into list summaries, ordered the way the curriculum reads —
 * matrix cells first (by sort_order, cell_id as a stable tiebreaker), then custom
 * lessons. Archived rows are included here; the UI filters them with `filterLessons`.
 */
export function buildCmsLessonList(rows: CmsLessonRow[]): CmsLessonSummary[] {
  return [...rows]
    .sort(
      (a, b) =>
        Number(a.origin === 'custom') - Number(b.origin === 'custom') ||
        a.sort_order - b.sort_order ||
        a.cell_id.localeCompare(b.cell_id),
    )
    .map(toLessonSummary);
}

/** Pure: drop archived lessons unless the archived filter is on. */
export function filterLessons(
  lessons: CmsLessonSummary[],
  includeArchived: boolean,
): CmsLessonSummary[] {
  return includeArchived ? lessons : lessons.filter((l) => !l.archived);
}

/** Pure: shape one row into the full read-only detail. */
export function buildCmsLessonDetail(row: CmsLessonRow): CmsLessonDetailData {
  return {
    ...toLessonSummary(row),
    version: row.version,
    updatedAt: row.updated_at,
    dimension: row.dimension,
    evidenceType: row.evidence_type,
    selfReportValidity: row.self_report_validity,
    bodyMd: row.body_md,
    videoUrl: row.video_url,
    tutorReference: row.tutor_reference_md,
    quiz: row.quiz_json,
    labConfig: row.lab_config_json,
    sorterConfig: row.sorter_config_json,
    draft: row.draft,
  };
}

/**
 * Fetches every lesson for the CMS — all statuses and archived rows included, with
 * the admin-only `draft` column. Throws on error so the caller surfaces a clear
 * failure state. (Reads under the authenticated SELECT policy; the admin gate is
 * the StaffArea CMS entry.)
 */
export async function fetchCmsLessons(): Promise<CmsLessonRow[]> {
  const { data, error } = await getSupabaseClient()
    .from('modules')
    .select(CMS_COLUMNS)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  // PostgREST string-selects are loosely typed (the union includes an error shape),
  // so TS requires casting through `unknown` here. The CMS columns are admin-authored
  // and re-validated on write, so the read side casts at this boundary.
  return (data ?? []) as unknown as CmsLessonRow[];
}

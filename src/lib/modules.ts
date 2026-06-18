import type {
  Dimension,
  EvidenceType,
  LabConfig,
  Module,
  ModuleOrigin,
  ModuleStatus,
  ModuleType,
  Phase,
  QuizQuestion,
  SelfReportValidity,
  SorterConfig,
  Stage,
} from '../types';
import { getSupabaseClient } from './supabaseClient';

// Content-as-data (P3.2.2): the curriculum is now read from the Supabase
// `modules` table at runtime instead of the static src/data/phases.ts. Each row
// is one matrix cell; this module maps rows -> the existing Module type and
// groups them into the Phase[] shape the app already renders, so downstream
// components barely change. Quizzes come from the row's quiz_json column
// (P3.2.3a) and lab config from lab_config_json (P3.2.3b).

/** Stage-level metadata that lives in the app, not the modules table. */
const STAGE_META: Record<Stage, Pick<Phase, 'id' | 'week' | 'title' | 'description'>> = {
  '1a': {
    id: 'stage-1a',
    week: 'Stage 1a',
    title: 'Rules & Access',
    description: 'The gate: the rules, tools, and access every practitioner needs before using AI.',
  },
  '1b': {
    id: 'stage-1b',
    week: 'Stage 1b',
    title: 'Orienting Frames',
    description: 'The mental models and framings that shape how to think about AI.',
  },
  '2': {
    id: 'stage-2',
    week: 'Stage 2',
    title: 'Active Practitioner',
    description: 'The hands-on craft of working with AI as a literate practitioner.',
  },
};

/** Stages in nav order. sort_order keeps cells ordered within each stage. */
const STAGE_ORDER: Stage[] = ['1a', '1b', '2'];

/**
 * Meta for the ungated "Additional lessons" group — the home for custom
 * (origin='custom') free-form lessons (P5.4-1). It is appended AFTER the three
 * matrix stages, and only when at least one custom lesson exists, so the matrix's
 * "always exactly 3 phases" shape is preserved for the default curriculum.
 */
const CUSTOM_PHASE_META: Pick<Phase, 'id' | 'week' | 'title' | 'description'> = {
  id: 'additional-lessons',
  week: 'Additional',
  title: 'Additional lessons',
  description: 'Standalone lessons outside the matrix — available to everyone, not gated.',
};

/** A row from the `modules` table (only the columns the runtime curriculum needs). */
interface ModuleRow {
  cell_id: string;
  // Custom lessons are ungated and carry stage = null (P5.4-1).
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
  mastery_anchor: string | null;
  emergent_anchor: string | null;
  quiz_json: QuizQuestion[] | null;
  lab_config_json: LabConfig | null;
  sorter_config_json: SorterConfig | null;
}

// The LIVE columns the learner curriculum reads. The `draft` working copy is
// intentionally NOT fetched here — learners always read the last-published LIVE
// content, never an in-progress draft (R3, W2-2). The CMS read path (Chunk 2)
// selects `draft` separately for admins.
const MODULE_COLUMNS =
  'cell_id, stage, status, origin, title, type, dimension, evidence_type, self_report_validity, body_md, video_url, tutor_reference_md, archived_at, mastery_anchor, emergent_anchor, quiz_json, lab_config_json, sorter_config_json';

/**
 * Runtime guard for a `modules` row (TYPE-03). The Supabase client returns
 * loosely-typed data, so without this a column rename or shape change would
 * compile clean and silently mis-render. We assert the required scalar fields
 * exist with the right primitive type at the mapping boundary, so drift fails
 * loudly with a clear message instead of producing a broken curriculum.
 */
export function assertModuleRow(row: unknown): asserts row is ModuleRow {
  if (typeof row !== 'object' || row === null) {
    throw new Error('modules row is not an object — schema drift?');
  }
  const r = row as Record<string, unknown>;
  const requireString = (key: string) => {
    if (typeof r[key] !== 'string') {
      throw new Error(`modules row is missing string field "${key}" — schema drift?`);
    }
  };
  requireString('cell_id');
  requireString('status');
  requireString('title');
  requireString('type');
  requireString('origin');
  if (!['draft', 'in_review', 'published'].includes(r.status as string)) {
    throw new Error(`modules row has unknown status "${String(r.status)}" — schema drift?`);
  }
  if (!['matrix', 'custom'].includes(r.origin as string)) {
    throw new Error(`modules row has unknown origin "${String(r.origin)}" — schema drift?`);
  }
  // Matrix cells carry a valid stage; custom lessons are ungated (stage = null).
  // The draft working copy is admin-only and re-validated on write, so the read
  // side only needs to guard the live stage discriminator here (P5.4-1).
  if (r.origin === 'custom') {
    if (r.stage !== null && r.stage !== undefined) {
      throw new Error(`custom module has a non-null stage "${String(r.stage)}" — schema drift?`);
    }
  } else if (!((r.stage as string) in STAGE_META)) {
    throw new Error(`modules row has unknown stage "${String(r.stage)}" — schema drift?`);
  }
  if (!Array.isArray(r.dimension)) {
    throw new Error('modules row field "dimension" is not an array — schema drift?');
  }
}

/** Maps a DB row to the existing Module shape (cell_id -> id+cellId, body_md -> content). */
export function mapRowToModule(row: ModuleRow): Module {
  const origin: ModuleOrigin = row.origin ?? 'matrix';
  // Custom lessons (stage = null) live in the "Additional lessons" group; matrix
  // cells map to their stage's phase.
  const phaseId = row.stage ? STAGE_META[row.stage].id : CUSTOM_PHASE_META.id;
  return {
    id: row.cell_id,
    cellId: row.cell_id,
    title: row.title,
    type: row.type,
    content: row.body_md ?? '',
    videoUrl: row.video_url ?? undefined,
    tutorReference: row.tutor_reference_md ?? undefined,
    phaseId,
    origin,
    stage: row.stage,
    status: row.status,
    dimension: row.dimension,
    evidenceType: row.evidence_type,
    selfReportValidity: row.self_report_validity,
    masteryAnchor: row.mastery_anchor ?? undefined,
    emergentAnchor: row.emergent_anchor ?? undefined,
    quiz: row.quiz_json ?? undefined,
    labConfig: row.lab_config_json ?? undefined,
    sorterConfig: row.sorter_config_json ?? undefined,
  };
}

/**
 * Groups modules (already ordered by sort_order) into Phase[]: the three matrix
 * stages, then an ungated "Additional lessons" group for any custom lessons. The
 * custom group is only appended when at least one custom lesson exists, so the
 * default matrix curriculum keeps its "exactly 3 phases" shape (P5.4-1).
 */
export function groupIntoPhases(modules: Module[]): Phase[] {
  const matrixPhases = STAGE_ORDER.map((stage) => ({
    ...STAGE_META[stage],
    modules: modules.filter((m) => m.origin !== 'custom' && m.stage === stage),
  }));
  const customModules = modules.filter((m) => m.origin === 'custom');
  if (customModules.length === 0) return matrixPhases;
  return [...matrixPhases, { ...CUSTOM_PHASE_META, modules: customModules }];
}

/**
 * Whether a cell has authored content (vs. a "Coming soon" stub) — drives the
 * "Soon" badge in the nav. Derived from the content itself so editing a stub
 * row into a real lesson flips it live with no code change (content-as-data).
 */
export function isModuleLive(module: Module): boolean {
  return module.content.length > 0 && !module.content.includes('*Coming soon.*');
}

/**
 * Fetches the full curriculum from Supabase and returns it as Phase[], the same
 * structure the static PHASES had. Reads under the authenticated SELECT policy
 * from P3.2.1 (modules are shared, read-only content). Throws on error so the
 * loader can surface a clear failure state.
 */
export async function fetchCurriculum(): Promise<Phase[]> {
  const { data, error } = await getSupabaseClient()
    .from('modules')
    .select(MODULE_COLUMNS)
    // Soft-deleted lessons are hidden from learners (R6); restore brings them back.
    .is('archived_at', null)
    .order('sort_order', { ascending: true });

  if (error) throw error;

  // Validate each row's shape before mapping so schema drift fails loudly.
  const rows = data ?? [];
  const modules = rows
    .map((row) => {
      assertModuleRow(row);
      return mapRowToModule(row);
    })
    // A custom lesson is invisible to learners until it has been published; matrix
    // cells are always shown (their D10 "draft — under review" badge is driven by
    // status, not visibility). Learners always read the LIVE columns (R3).
    .filter((m) => m.origin !== 'custom' || m.status === 'published');
  return groupIntoPhases(modules);
}

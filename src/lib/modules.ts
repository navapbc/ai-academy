import type {
  Dimension,
  EvidenceType,
  LabConfig,
  Module,
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

/** A row from the `modules` table (only the columns the runtime curriculum needs). */
interface ModuleRow {
  cell_id: string;
  stage: Stage;
  title: string;
  type: ModuleType;
  dimension: Dimension[];
  evidence_type: EvidenceType;
  self_report_validity: SelfReportValidity;
  body_md: string | null;
  mastery_anchor: string | null;
  emergent_anchor: string | null;
  quiz_json: QuizQuestion[] | null;
  lab_config_json: LabConfig | null;
  sorter_config_json: SorterConfig | null;
}

const MODULE_COLUMNS =
  'cell_id, stage, title, type, dimension, evidence_type, self_report_validity, body_md, mastery_anchor, emergent_anchor, quiz_json, lab_config_json, sorter_config_json';

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
  requireString('stage');
  requireString('title');
  requireString('type');
  if (!((r.stage as string) in STAGE_META)) {
    throw new Error(`modules row has unknown stage "${String(r.stage)}" — schema drift?`);
  }
  if (!Array.isArray(r.dimension)) {
    throw new Error('modules row field "dimension" is not an array — schema drift?');
  }
}

/** Maps a DB row to the existing Module shape (cell_id -> id+cellId, body_md -> content). */
export function mapRowToModule(row: ModuleRow): Module {
  return {
    id: row.cell_id,
    cellId: row.cell_id,
    title: row.title,
    type: row.type,
    content: row.body_md ?? '',
    phaseId: STAGE_META[row.stage].id,
    stage: row.stage,
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

/** Groups modules (already ordered by sort_order) into Phase[] by stage. */
export function groupIntoPhases(modules: Module[]): Phase[] {
  return STAGE_ORDER.map((stage) => ({
    ...STAGE_META[stage],
    modules: modules.filter((m) => m.stage === stage),
  }));
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
    .order('sort_order', { ascending: true });

  if (error) throw error;

  // Validate each row's shape before mapping so schema drift fails loudly.
  const rows = data ?? [];
  const modules = rows.map((row) => {
    assertModuleRow(row);
    return mapRowToModule(row);
  });
  return groupIntoPhases(modules);
}

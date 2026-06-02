import type {
  Dimension,
  EvidenceType,
  Module,
  ModuleType,
  Phase,
  QuizQuestion,
  SelfReportValidity,
  Stage,
} from '../types';
import { getSupabaseClient } from './supabaseClient';

// Content-as-data (P3.2.2): the curriculum is now read from the Supabase
// `modules` table at runtime instead of the static src/data/phases.ts. Each row
// is one matrix cell; this module maps rows -> the existing Module type and
// groups them into the Phase[] shape the app already renders, so downstream
// components barely change. Quizzes now come from the row's quiz_json column
// (P3.2.3a); labs still resolve statically by type==='lab'.

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
}

const MODULE_COLUMNS =
  'cell_id, stage, title, type, dimension, evidence_type, self_report_validity, body_md, mastery_anchor, emergent_anchor, quiz_json';

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

  const modules = ((data ?? []) as ModuleRow[]).map(mapRowToModule);
  return groupIntoPhases(modules);
}

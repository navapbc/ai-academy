import type {
  Course,
  CourseWeek,
  CourseWeekModule,
  Curriculum,
  CurriculumSection,
  Dimension,
  EvidenceType,
  LabConfig,
  Module,
  ModuleOrigin,
  ModuleStatus,
  ModuleType,
  ModuleVisibility,
  QuizQuestion,
  SelfReportValidity,
  SorterConfig,
  Stage,
} from '../types';
import { getSupabaseClient } from './supabaseClient';

// Content-as-data (P3.2.2): the curriculum is read from the Supabase `modules`
// table at runtime. Cohort-restructure U2: rows are grouped into Course → Week
// sections (from courses/course_weeks/course_week_modules), then a
// "Supplemental coursework" section (matrix modules not in any visible week),
// then "Resources & additional lessons" (custom lessons) — replacing the old
// hardcoded 3-stage grouping. Quizzes come from the row's quiz_json column
// (P3.2.3a) and lab config from lab_config_json (P3.2.3b).

/** Valid matrix stages (assertModuleRow's stage allow-list). */
const STAGES: Stage[] = ['1a', '1b', '2'];

/**
 * Meta for the "Supplemental coursework" section (U2/R2): the home for matrix
 * lessons that are not assigned to any visible course week. One flat group —
 * the existing sort order is preserved, no sub-groups (Key Decisions).
 */
const SUPPLEMENTAL_META: Pick<CurriculumSection, 'kind' | 'id' | 'week' | 'title' | 'description'> = {
  kind: 'supplemental',
  id: 'supplemental',
  week: 'Supplemental',
  title: 'Supplemental coursework',
  description: 'The AI-literacy matrix lessons — open practice outside the course weeks, not gated.',
};

/**
 * Meta for the "Resources & additional lessons" section (U2/R13) — the former
 * "Additional lessons" custom-lessons group, renamed. Keeps its published-only
 * rule and appears only when at least one such lesson exists.
 */
const RESOURCES_META: Pick<CurriculumSection, 'kind' | 'id' | 'week' | 'title' | 'description'> = {
  kind: 'resources',
  id: 'resources',
  week: 'Resources',
  title: 'Resources & additional lessons',
  description: 'Standalone lessons and resources outside the course — available to everyone, not gated.',
};

/** A row from the `modules` table (only the columns the runtime curriculum needs). */
interface ModuleRow {
  cell_id: string;
  // Custom and course lessons are stage-less (stage = null) — P5.4-1 / U1.
  stage: Stage | null;
  status: ModuleStatus;
  origin: ModuleOrigin;
  visibility: ModuleVisibility;
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
  'cell_id, stage, status, origin, visibility, title, type, dimension, evidence_type, self_report_validity, body_md, video_url, tutor_reference_md, archived_at, mastery_anchor, emergent_anchor, quiz_json, lab_config_json, sorter_config_json';

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
  requireString('visibility');
  if (!['draft', 'in_review', 'published'].includes(r.status as string)) {
    throw new Error(`modules row has unknown status "${String(r.status)}" — schema drift?`);
  }
  if (!['matrix', 'custom', 'course'].includes(r.origin as string)) {
    throw new Error(`modules row has unknown origin "${String(r.origin)}" — schema drift?`);
  }
  if (!['public', 'program'].includes(r.visibility as string)) {
    throw new Error(`modules row has unknown visibility "${String(r.visibility)}" — schema drift?`);
  }
  // Matrix cells carry a valid stage; custom and course lessons are stage-less
  // (stage = null) — U1. The draft working copy is admin-only and re-validated
  // on write, so the read side only needs to guard the live stage discriminator
  // here (P5.4-1).
  if (r.origin === 'custom' || r.origin === 'course') {
    if (r.stage !== null && r.stage !== undefined) {
      throw new Error(`${r.origin} module has a non-null stage "${String(r.stage)}" — schema drift?`);
    }
  } else if (!STAGES.includes(r.stage as Stage)) {
    throw new Error(`modules row has unknown stage "${String(r.stage)}" — schema drift?`);
  }
  if (!Array.isArray(r.dimension)) {
    throw new Error('modules row field "dimension" is not an array — schema drift?');
  }
}

/**
 * Maps a DB row to the existing Module shape (cell_id -> id+cellId, body_md ->
 * content). `phaseId` is stamped by groupCurriculum (a module's section is a
 * function of week membership, not of the row alone).
 */
export function mapRowToModule(row: ModuleRow): Module {
  const origin: ModuleOrigin = row.origin ?? 'matrix';
  return {
    id: row.cell_id,
    cellId: row.cell_id,
    title: row.title,
    type: row.type,
    content: row.body_md ?? '',
    videoUrl: row.video_url ?? undefined,
    tutorReference: row.tutor_reference_md ?? undefined,
    // Assigned during grouping (U2) — '' means "not yet placed in a section".
    phaseId: '',
    origin,
    stage: row.stage,
    visibility: row.visibility,
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

/** The course/week structure rows groupCurriculum consumes (already RLS-filtered). */
export interface CourseStructure {
  courses: Course[];
  weeks: CourseWeek[];
  memberships: CourseWeekModule[];
}

/**
 * Groups learner-visible modules (already ordered by sort_order and filtered by
 * the per-origin status rule) into the U2 section order:
 *
 *  1. Course weeks, in course + week sort order. A week is visible to learners
 *     only when it has ≥1 PUBLISHED member the viewer can see; a visible week
 *     renders ALL of its viewer-visible members (matrix drafts keep their D10
 *     badge) in membership sort order. Empty/draft-only weeks are hidden.
 *  2. "Supplemental coursework": matrix modules not in any visible week, in
 *     their existing sort order (no sub-groups).
 *  3. "Resources & additional lessons": custom lessons not in any visible week.
 *
 * A module assigned to a visible week renders under the week and leaves its
 * origin bucket (Key Decisions). Course-origin modules with no visible week
 * membership render nowhere for learners (staff/CMS-only until assigned).
 * Sections with no modules are omitted entirely.
 */
export function groupCurriculum(modules: Module[], structure: CourseStructure): CurriculumSection[] {
  const moduleById = new Map(modules.map((m) => [m.id, m]));
  const courseById = new Map(structure.courses.map((c) => [c.id, c]));

  // Memberships per week, in membership sort order (fetch order).
  const membersByWeek = new Map<string, Module[]>();
  for (const membership of structure.memberships) {
    const module = moduleById.get(membership.cellId);
    if (!module) continue; // references a row this viewer can't see
    const members = membersByWeek.get(membership.weekId) ?? [];
    members.push(module);
    membersByWeek.set(membership.weekId, members);
  }

  // Courses in sort order, each course's weeks in sort order (fetch order).
  const sections: CurriculumSection[] = [];
  const assignedIds = new Set<string>();
  for (const course of structure.courses) {
    for (const week of structure.weeks) {
      if (week.courseId !== course.id) continue;
      const members = membersByWeek.get(week.id) ?? [];
      // A week appears only once it has a published member (draft-only and
      // empty weeks are hidden from learners; staff/CMS always see them there).
      if (!members.some((m) => m.status === 'published')) continue;
      const sectionId = `week-${week.id}`;
      sections.push({
        kind: 'week',
        id: sectionId,
        week: week.title,
        title: week.subtitle ?? week.title,
        description: '',
        courseId: course.id,
        courseTitle: courseById.get(course.id)?.title ?? '',
        modules: members.map((m) => ({ ...m, phaseId: sectionId })),
      });
      for (const m of members) assignedIds.add(m.id);
    }
  }

  const supplemental = modules
    .filter((m) => m.origin === 'matrix' && !assignedIds.has(m.id))
    .map((m) => ({ ...m, phaseId: SUPPLEMENTAL_META.id }));
  if (supplemental.length > 0) {
    sections.push({ ...SUPPLEMENTAL_META, modules: supplemental });
  }

  const resources = modules
    .filter((m) => m.origin === 'custom' && !assignedIds.has(m.id))
    .map((m) => ({ ...m, phaseId: RESOURCES_META.id }));
  if (resources.length > 0) {
    sections.push({ ...RESOURCES_META, modules: resources });
  }

  return sections;
}

/**
 * Whether a cell has authored content (vs. a "Coming soon" stub) — drives the
 * "Soon" badge in the nav. Derived from the content itself so editing a stub
 * row into a real lesson flips it live with no code change (content-as-data).
 */
export function isModuleLive(module: Module): boolean {
  return module.content.length > 0 && !module.content.includes('*Coming soon.*');
}

/** Runtime guard for a structure row: fail loudly on drift, like assertModuleRow. */
function assertStructureRow(
  table: string,
  row: unknown,
  stringKeys: string[],
): asserts row is Record<string, unknown> {
  if (typeof row !== 'object' || row === null) {
    throw new Error(`${table} row is not an object — schema drift?`);
  }
  const r = row as Record<string, unknown>;
  for (const key of stringKeys) {
    if (typeof r[key] !== 'string') {
      throw new Error(`${table} row is missing string field "${key}" — schema drift?`);
    }
  }
}

/**
 * Fetches the full curriculum — modules plus the course/week structure — and
 * returns the grouped sections and the raw module-row count (the FE-02
 * empty-state discriminator: the error state keys on ZERO ROWS RETURNED, never
 * on group shape, so an unenrolled learner receiving only public rows renders
 * normally). Reads under the tables' SELECT policies (modules are shared,
 * read-only content). Throws on error so the loader can surface a clear
 * failure state.
 */
export async function fetchCurriculum(): Promise<Curriculum> {
  const supabase = getSupabaseClient();
  const [modulesRes, coursesRes, weeksRes, membershipsRes] = await Promise.all([
    supabase
      .from('modules')
      .select(MODULE_COLUMNS)
      // Soft-deleted lessons are hidden from learners (R6); restore brings them back.
      .is('archived_at', null)
      .order('sort_order', { ascending: true }),
    supabase.from('courses').select('id, slug, title, description, sort_order').order('sort_order', { ascending: true }),
    supabase.from('course_weeks').select('id, course_id, title, subtitle, sort_order').order('sort_order', { ascending: true }),
    supabase.from('course_week_modules').select('week_id, cell_id, sort_order').order('sort_order', { ascending: true }),
  ]);
  for (const res of [modulesRes, coursesRes, weeksRes, membershipsRes]) {
    if (res.error) throw res.error;
  }

  // Validate each row's shape before mapping so schema drift fails loudly.
  const rows = modulesRes.data ?? [];
  const modules = rows
    .map((row) => {
      assertModuleRow(row);
      return mapRowToModule(row);
    })
    // Custom and course lessons are invisible to learners until published;
    // matrix cells are always shown (their D10 "draft — under review" badge is
    // driven by status). Learners always read the LIVE columns (R3).
    .filter((m) => m.origin === 'matrix' || m.status === 'published');

  const courses: Course[] = (coursesRes.data ?? []).map((row) => {
    assertStructureRow('courses', row, ['id', 'slug', 'title']);
    return {
      id: row.id as string,
      slug: row.slug as string,
      title: row.title as string,
      description: (row.description as string | null) ?? null,
      sortOrder: (row.sort_order as number) ?? 0,
    };
  });
  const weeks: CourseWeek[] = (weeksRes.data ?? []).map((row) => {
    assertStructureRow('course_weeks', row, ['id', 'course_id', 'title']);
    return {
      id: row.id as string,
      courseId: row.course_id as string,
      title: row.title as string,
      subtitle: (row.subtitle as string | null) ?? null,
      sortOrder: (row.sort_order as number) ?? 0,
    };
  });
  const memberships: CourseWeekModule[] = (membershipsRes.data ?? []).map((row) => {
    assertStructureRow('course_week_modules', row, ['week_id', 'cell_id']);
    return {
      weekId: row.week_id as string,
      cellId: row.cell_id as string,
      sortOrder: (row.sort_order as number) ?? 0,
    };
  });

  return {
    sections: groupCurriculum(modules, { courses, weeks, memberships }),
    moduleRowCount: rows.length,
  };
}

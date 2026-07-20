import type { ModuleOrigin, ModuleStatus } from '../types';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

// Admin course-authoring client (cohort-restructure U3). Writes go through the
// `admin-courses` service_role Edge Function (the structure tables have no
// client-write RLS); reads use the staff SELECT policies already on courses/
// course_weeks/course_week_modules (is_staff — admins see every week, empty or
// not) plus the modules read the CMS already relies on. The service_role key
// never reaches the browser — the client only holds the user's session token,
// which the function verifies as an admin. Mirrors src/lib/adminCohorts.ts.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// --- Write path: invoke the Edge Function -----------------------------------

// Mirrors the Edge Function contract (admin-courses-core.ts). Assignment is
// server-validated (published, non-archived, not already in another week —
// unique(cell_id)); delete_week is 409-guarded to empty weeks; the reorder
// actions take the FULL ordered id list and only ever permute sort_order.
export type CourseAction =
  | { action: 'create_week'; courseId: string; title: string; subtitle: string | null }
  | { action: 'update_week'; weekId: string; title: string; subtitle: string | null }
  | { action: 'reorder_weeks'; courseId: string; weekIds: string[] }
  | { action: 'delete_week'; weekId: string }
  | { action: 'assign_module'; weekId: string; cellId: string }
  | { action: 'unassign_module'; cellId: string }
  | { action: 'reorder_week_modules'; weekId: string; cellIds: string[] };

/** POSTs one action to the admin-courses function; throws Error(body.error) on failure. */
export async function invokeAdminCourses(action: CourseAction): Promise<void> {
  if (!isSupabaseConfigured || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase is not configured.');
  }
  let accessToken = SUPABASE_ANON_KEY;
  const { data } = await getSupabaseClient().auth.getSession();
  if (data.session?.access_token) accessToken = data.session.access_token;

  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/admin-courses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(action),
    });
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }

  let body: { ok?: boolean; error?: string } = {};
  try {
    body = await res.json();
  } catch {
    // fall through to the status-based error below
  }
  if (!res.ok || !body.ok) {
    throw new Error(body.error ?? `Request failed (${res.status}).`);
  }
}

// Thin typed creators (keep call sites readable).
export const createWeek = (courseId: string, title: string, subtitle: string | null) =>
  invokeAdminCourses({ action: 'create_week', courseId, title, subtitle });
export const updateWeek = (weekId: string, title: string, subtitle: string | null) =>
  invokeAdminCourses({ action: 'update_week', weekId, title, subtitle });
export const reorderWeeks = (courseId: string, weekIds: string[]) =>
  invokeAdminCourses({ action: 'reorder_weeks', courseId, weekIds });
export const deleteWeek = (weekId: string) =>
  invokeAdminCourses({ action: 'delete_week', weekId });
export const assignModule = (weekId: string, cellId: string) =>
  invokeAdminCourses({ action: 'assign_module', weekId, cellId });
export const unassignModule = (cellId: string) =>
  invokeAdminCourses({ action: 'unassign_module', cellId });
export const reorderWeekModules = (weekId: string, cellIds: string[]) =>
  invokeAdminCourses({ action: 'reorder_week_modules', weekId, cellIds });

// --- Read path: current structure for the authoring UI -----------------------

/** A module as the authoring UI needs it (member rows + the assign picker). */
export interface AuthoringModule {
  cellId: string;
  title: string;
  status: ModuleStatus;
  origin: ModuleOrigin;
  archived: boolean;
}
export interface AuthoringWeek {
  id: string;
  title: string;
  subtitle: string | null;
  /** Ordered members (membership sort order). */
  members: AuthoringModule[];
}
export interface AuthoringCourse {
  id: string;
  slug: string;
  title: string;
  /** Ordered weeks (week sort order) — ALL weeks, including empty ones (staff view). */
  weeks: AuthoringWeek[];
}
export interface CourseAuthoringData {
  courses: AuthoringCourse[];
  /**
   * Modules offerable in the assign picker: PUBLISHED, non-archived, and not
   * already in any week (unique(cell_id) — a module belongs to at most one week).
   */
  assignable: AuthoringModule[];
}

// Raw row shapes.
export interface CourseRow {
  id: string;
  slug: string;
  title: string;
  sort_order: number;
}
export interface WeekRow {
  id: string;
  course_id: string;
  title: string;
  subtitle: string | null;
  sort_order: number;
}
export interface MembershipRow {
  week_id: string;
  cell_id: string;
  sort_order: number;
}
export interface ModuleInfoRow {
  cell_id: string;
  title: string;
  status: ModuleStatus;
  origin: ModuleOrigin;
  archived_at: string | null;
}

function toAuthoringModule(m: ModuleInfoRow): AuthoringModule {
  return {
    cellId: m.cell_id,
    title: m.title,
    status: m.status,
    origin: m.origin,
    archived: m.archived_at != null,
  };
}

/**
 * Pure: fold the four reads into per-course ordered weeks with ordered members,
 * plus the assignable-module list for the picker (published, non-archived, not
 * already assigned anywhere). Rows arrive sorted by sort_order (fetch order);
 * membership rows referencing an unknown module are skipped (shouldn't happen
 * under staff RLS).
 */
export function buildCourseAuthoring(
  courses: CourseRow[],
  weeks: WeekRow[],
  memberships: MembershipRow[],
  modules: ModuleInfoRow[],
): CourseAuthoringData {
  const moduleById = new Map(modules.map((m) => [m.cell_id, toAuthoringModule(m)]));

  const membersByWeek = new Map<string, AuthoringModule[]>();
  const assignedIds = new Set<string>();
  for (const membership of memberships) {
    assignedIds.add(membership.cell_id);
    const module = moduleById.get(membership.cell_id);
    if (!module) continue;
    const list = membersByWeek.get(membership.week_id) ?? [];
    list.push(module);
    membersByWeek.set(membership.week_id, list);
  }

  const authoringCourses: AuthoringCourse[] = courses.map((c) => ({
    id: c.id,
    slug: c.slug,
    title: c.title,
    weeks: weeks
      .filter((w) => w.course_id === c.id)
      .map((w) => ({
        id: w.id,
        title: w.title,
        subtitle: w.subtitle,
        members: membersByWeek.get(w.id) ?? [],
      })),
  }));

  const assignable = modules
    .filter((m) => m.status === 'published' && m.archived_at == null && !assignedIds.has(m.cell_id))
    .map(toAuthoringModule);

  return { courses: authoringCourses, assignable };
}

/** Reads the current course structure visible to the admin (staff RLS sees all). */
export async function fetchCourseAuthoring(): Promise<CourseAuthoringData> {
  const sb = getSupabaseClient();
  const [coursesRes, weeksRes, membershipsRes, modulesRes] = await Promise.all([
    sb.from('courses').select('id, slug, title, sort_order').order('sort_order', { ascending: true }),
    sb
      .from('course_weeks')
      .select('id, course_id, title, subtitle, sort_order')
      .order('sort_order', { ascending: true }),
    sb
      .from('course_week_modules')
      .select('week_id, cell_id, sort_order')
      .order('sort_order', { ascending: true }),
    sb
      .from('modules')
      .select('cell_id, title, status, origin, archived_at')
      .order('sort_order', { ascending: true }),
  ]);
  if (coursesRes.error) throw coursesRes.error;
  if (weeksRes.error) throw weeksRes.error;
  if (membershipsRes.error) throw membershipsRes.error;
  if (modulesRes.error) throw modulesRes.error;

  return buildCourseAuthoring(
    (coursesRes.data ?? []) as CourseRow[],
    (weeksRes.data ?? []) as WeekRow[],
    (membershipsRes.data ?? []) as MembershipRow[],
    (modulesRes.data ?? []) as ModuleInfoRow[],
  );
}

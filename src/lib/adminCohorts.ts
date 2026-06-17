import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

// Admin cohort-management client (P5.5a). Writes go through the `admin-cohorts`
// service_role Edge Function (the cohort tables have no client-write RLS); reads
// use the admin RLS already on cohorts/profiles/enrollments + the new admin read
// on cohort_champions. The service_role key never reaches the browser — the client
// only holds the user's session token, which the function verifies as an admin.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// --- Write path: invoke the Edge Function -----------------------------------

export type CohortAction =
  | { action: 'create_cohort'; name: string }
  | { action: 'rename_cohort'; cohortId: string; name: string }
  | { action: 'delete_cohort'; cohortId: string }
  | { action: 'enroll_learner'; cohortId: string; userId: string }
  | { action: 'unenroll_learner'; userId: string }
  | { action: 'assign_champion'; cohortId: string; userId: string }
  | { action: 'unassign_champion'; cohortId: string; userId: string };

/** POSTs one action to the admin-cohorts function; throws Error(body.error) on failure. */
export async function invokeAdminCohorts(action: CohortAction): Promise<void> {
  if (!isSupabaseConfigured || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase is not configured.');
  }
  let accessToken = SUPABASE_ANON_KEY;
  const { data } = await getSupabaseClient().auth.getSession();
  if (data.session?.access_token) accessToken = data.session.access_token;

  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/admin-cohorts`, {
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
export const createCohort = (name: string) => invokeAdminCohorts({ action: 'create_cohort', name });
export const renameCohort = (cohortId: string, name: string) =>
  invokeAdminCohorts({ action: 'rename_cohort', cohortId, name });
export const deleteCohort = (cohortId: string) =>
  invokeAdminCohorts({ action: 'delete_cohort', cohortId });
export const enrollLearner = (cohortId: string, userId: string) =>
  invokeAdminCohorts({ action: 'enroll_learner', cohortId, userId });
export const unenrollLearner = (userId: string) =>
  invokeAdminCohorts({ action: 'unenroll_learner', userId });
export const assignChampion = (cohortId: string, userId: string) =>
  invokeAdminCohorts({ action: 'assign_champion', cohortId, userId });
export const unassignChampion = (cohortId: string, userId: string) =>
  invokeAdminCohorts({ action: 'unassign_champion', cohortId, userId });

// --- Read path: current state for the management UI -------------------------

export interface ManagedUser {
  id: string;
  name: string; // full_name, else email, else short id
  email: string | null;
  role: string;
}
export interface ManagedCohort {
  id: string;
  name: string;
  members: ManagedUser[];
  champions: ManagedUser[];
}
export interface CohortManagementData {
  cohorts: ManagedCohort[];
  /** Every user the admin can see (for enroll / assign pickers). */
  users: ManagedUser[];
}

// Raw row shapes.
export interface CohortRow {
  id: string;
  name: string;
}
export interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
}
export interface EnrollmentRow {
  user_id: string;
  cohort_id: string;
}
export interface ChampionRow {
  user_id: string;
  cohort_id: string;
}

function toManagedUser(p: ProfileRow): ManagedUser {
  const name = p.full_name?.trim() || p.email || `User ${p.id.slice(0, 8)}`;
  return { id: p.id, name, email: p.email, role: p.role ?? 'learner' };
}

/**
 * Pure: fold the four reads into per-cohort members + champions, plus the full
 * user list for pickers. Cohorts and users are sorted by name for stable display.
 */
export function buildCohortManagement(
  cohorts: CohortRow[],
  profiles: ProfileRow[],
  enrollments: EnrollmentRow[],
  champions: ChampionRow[],
): CohortManagementData {
  const userById = new Map(profiles.map((p) => [p.id, toManagedUser(p)]));
  const membersByCohort = new Map<string, ManagedUser[]>();
  for (const e of enrollments) {
    const u = userById.get(e.user_id);
    if (!u) continue; // a user the admin can't resolve (shouldn't happen under admin RLS)
    const list = membersByCohort.get(e.cohort_id) ?? [];
    list.push(u);
    membersByCohort.set(e.cohort_id, list);
  }
  const championsByCohort = new Map<string, ManagedUser[]>();
  for (const c of champions) {
    const u = userById.get(c.user_id);
    if (!u) continue;
    const list = championsByCohort.get(c.cohort_id) ?? [];
    list.push(u);
    championsByCohort.set(c.cohort_id, list);
  }

  const byName = (a: ManagedUser, b: ManagedUser) => a.name.localeCompare(b.name);
  const managedCohorts: ManagedCohort[] = cohorts
    .map((c) => ({
      id: c.id,
      name: c.name,
      members: (membersByCohort.get(c.id) ?? []).sort(byName),
      champions: (championsByCohort.get(c.id) ?? []).sort(byName),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    cohorts: managedCohorts,
    users: [...userById.values()].sort(byName),
  };
}

/** Reads the current cohort state visible to the admin (admin RLS scopes the reads). */
export async function fetchCohortManagement(): Promise<CohortManagementData> {
  const sb = getSupabaseClient();
  const [cohortsRes, profilesRes, enrollRes, champRes] = await Promise.all([
    sb.from('cohorts').select('id, name'),
    sb.from('profiles').select('id, full_name, email, role'),
    sb.from('enrollments').select('user_id, cohort_id'),
    sb.from('cohort_champions').select('user_id, cohort_id'),
  ]);
  if (cohortsRes.error) throw cohortsRes.error;
  if (profilesRes.error) throw profilesRes.error;
  if (enrollRes.error) throw enrollRes.error;
  if (champRes.error) throw champRes.error;

  return buildCohortManagement(
    (cohortsRes.data ?? []) as CohortRow[],
    (profilesRes.data ?? []) as ProfileRow[],
    (enrollRes.data ?? []) as EnrollmentRow[],
    (champRes.data ?? []) as ChampionRow[],
  );
}

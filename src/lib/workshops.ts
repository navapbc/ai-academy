import { getSupabaseClient } from './supabaseClient';

// Learner-side (read-only) data-access + pure shaping for workshops (X.3 Unit 4).
// A workshop is admin-authored orchestration only: an ordered list of module
// cell_ids (step_cell_ids) over the content-as-data curriculum. It stores NO
// completion state — a learner's workshop progress is DERIVED from their existing
// module_progress (R5). Writes are server-authoritative (admin-workshops Edge
// Function, Unit 2); this file never writes. Read runs under the authenticated
// SELECT RLS policy from Unit 1 (workshops are non-sensitive, visible to all).

/** A workshop definition as the learner view needs it (subset of the row). */
export interface Workshop {
  id: string;
  title: string;
  intro: string | null;
  /** Ordered list of module cell_ids; the array order IS the step order. */
  stepCellIds: string[];
}

/** Derived progress for a workshop, computed against the learner's completions. */
export interface WorkshopProgress {
  completed: number;
  total: number;
}

/** The columns the learner workshop view reads. */
const WORKSHOP_COLUMNS = 'id, title, intro, step_cell_ids';

/** A row from the `workshops` table (only the learner-read columns). */
interface WorkshopRow {
  id: string;
  title: string;
  intro: string | null;
  step_cell_ids: string[] | null;
}

/** Maps a DB row to the app-facing Workshop shape. */
export function mapRowToWorkshop(row: WorkshopRow): Workshop {
  return {
    id: row.id,
    title: row.title,
    intro: row.intro ?? null,
    stepCellIds: row.step_cell_ids ?? [],
  };
}

/**
 * Pure progress derivation (R5): given a workshop's ordered step cell ids and the
 * set of module ids the learner has completed, count how many of the workshop's
 * steps are complete. Duplicate step ids are counted once (a workshop is a path,
 * not a tally). An empty workshop is 0/0 — a defined, non-crashing state.
 */
export function workshopProgress(
  stepCellIds: string[],
  completedModuleIds: Iterable<string>,
): WorkshopProgress {
  const completed = completedModuleIds instanceof Set
    ? completedModuleIds
    : new Set(completedModuleIds);
  const uniqueSteps = Array.from(new Set(stepCellIds));
  const done = uniqueSteps.filter((id) => completed.has(id)).length;
  return { completed: done, total: uniqueSteps.length };
}

/**
 * Fetches all workshops (ordered newest-first) under the authenticated SELECT
 * policy. Throws on error so the hook can surface a clear failure state.
 */
export async function fetchWorkshops(): Promise<Workshop[]> {
  const { data, error } = await getSupabaseClient()
    .from('workshops')
    .select(WORKSHOP_COLUMNS)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => mapRowToWorkshop(row as WorkshopRow));
}

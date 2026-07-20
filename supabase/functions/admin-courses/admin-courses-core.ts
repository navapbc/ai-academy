// Pure, runtime-agnostic logic for the `admin-courses` Edge Function (no Deno,
// no network), unit-tested under vitest. The Deno-only glue (auth, service_role
// client, the DB referential checks on modules/memberships, DB writes, the
// in-memory limiter) lives in index.ts and calls here. Helpers are self-contained
// copies so the function bundles independently (the same posture as
// admin-cohorts — keep in sync if those change).

// --- Action model -----------------------------------------------------------

export const COURSE_ACTIONS = [
  'create_week',
  'update_week',
  'reorder_weeks',
  'delete_week',
  'assign_module',
  'unassign_module',
  'reorder_week_modules',
] as const;
export type CourseActionType = (typeof COURSE_ACTIONS)[number];

// U3 authoring contract: weeks are created/renamed/reordered under a course;
// module membership is a join row (course_week_modules, unique(cell_id) — a
// module belongs to at most ONE week), so assign validates the target module
// server-side (published, non-archived, unassigned — the findUnpublishedSteps
// posture) and unassign needs only the cell id. delete_week is guarded to empty
// weeks (409 otherwise — see deleteWeekBlockedReason).
export type CourseAction =
  | { action: 'create_week'; courseId: string; title: string; subtitle: string | null }
  | { action: 'update_week'; weekId: string; title: string; subtitle: string | null }
  | { action: 'reorder_weeks'; courseId: string; weekIds: string[] }
  | { action: 'delete_week'; weekId: string }
  | { action: 'assign_module'; weekId: string; cellId: string }
  | { action: 'unassign_module'; cellId: string }
  | { action: 'reorder_week_modules'; weekId: string; cellIds: string[] };

export type ParseResult =
  | { ok: true; value: CourseAction }
  | { ok: false; error: string };

const TITLE_MAX = 200;
const SUBTITLE_MAX = 200;
const CELL_ID_MAX_LEN = 100;
const LIST_MAX = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

/** A non-empty, length-bounded week title (trimmed). */
function parseTitle(v: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof v !== 'string' || v.trim() === '') {
    return { ok: false, error: '`title` must be a non-empty string.' };
  }
  const title = v.trim();
  if (title.length > TITLE_MAX) {
    return { ok: false, error: `\`title\` must be at most ${TITLE_MAX} characters.` };
  }
  return { ok: true, value: title };
}

/** Optional subtitle: absent/null/'' → null; a string is trimmed + length-bounded. */
function parseSubtitle(
  v: unknown,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (v === undefined || v === null) return { ok: true, value: null };
  if (typeof v !== 'string') {
    return { ok: false, error: '`subtitle` must be a string when provided.' };
  }
  const subtitle = v.trim();
  if (subtitle === '') return { ok: true, value: null };
  if (subtitle.length > SUBTITLE_MAX) {
    return { ok: false, error: `\`subtitle\` must be at most ${SUBTITLE_MAX} characters.` };
  }
  return { ok: true, value: subtitle };
}

/** A single module cell id: non-empty, trimmed, length-bounded string. */
function parseCellId(v: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof v !== 'string' || v.trim() === '') {
    return { ok: false, error: '`cellId` must be a non-empty string.' };
  }
  const id = v.trim();
  if (id.length > CELL_ID_MAX_LEN) {
    return { ok: false, error: `\`cellId\` must be at most ${CELL_ID_MAX_LEN} characters.` };
  }
  return { ok: true, value: id };
}

/**
 * An ordered id list for the reorder actions: array-shape validation only (the
 * "matches the current set exactly" check needs the DB and lives in index.ts via
 * reorderMismatchReason). No duplicates, bounded, each element validated by
 * `each`. An empty array is allowed (it trivially matches an empty set).
 */
function parseIdList(
  v: unknown,
  field: string,
  each: (item: unknown) => boolean,
  elementError: string,
): { ok: true; value: string[] } | { ok: false; error: string } {
  if (!Array.isArray(v)) {
    return { ok: false, error: `\`${field}\` must be an array of strings.` };
  }
  if (v.length > LIST_MAX) {
    return { ok: false, error: `\`${field}\` must have at most ${LIST_MAX} entries.` };
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of v) {
    if (!each(raw)) return { ok: false, error: `\`${field}\` ${elementError}` };
    const id = (raw as string).trim();
    if (seen.has(id)) {
      return { ok: false, error: `\`${field}\` must not contain duplicates (\`${id}\`).` };
    }
    seen.add(id);
    out.push(id);
  }
  return { ok: true, value: out };
}

const isBoundedCellId = (v: unknown): boolean =>
  typeof v === 'string' && v.trim() !== '' && v.trim().length <= CELL_ID_MAX_LEN;

/** Validates + normalizes the action request body. */
export function parseCourseAction(body: unknown): ParseResult {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }
  const b = body as Record<string, unknown>;
  const action = b.action;
  if (typeof action !== 'string' || !(COURSE_ACTIONS as readonly string[]).includes(action)) {
    return { ok: false, error: `\`action\` must be one of: ${COURSE_ACTIONS.join(', ')}.` };
  }

  const needCourse = (): { ok: false; error: string } | null =>
    isUuid(b.courseId) ? null : { ok: false, error: '`courseId` must be a valid uuid.' };
  const needWeek = (): { ok: false; error: string } | null =>
    isUuid(b.weekId) ? null : { ok: false, error: '`weekId` must be a valid uuid.' };

  switch (action as CourseActionType) {
    case 'create_week': {
      const c = needCourse();
      if (c) return c;
      const t = parseTitle(b.title);
      if (!t.ok) return t;
      const s = parseSubtitle(b.subtitle);
      if (!s.ok) return s;
      return {
        ok: true,
        value: { action, courseId: b.courseId as string, title: t.value, subtitle: s.value },
      };
    }
    case 'update_week': {
      const w = needWeek();
      if (w) return w;
      const t = parseTitle(b.title);
      if (!t.ok) return t;
      const s = parseSubtitle(b.subtitle);
      if (!s.ok) return s;
      return {
        ok: true,
        value: { action, weekId: b.weekId as string, title: t.value, subtitle: s.value },
      };
    }
    case 'reorder_weeks': {
      const c = needCourse();
      if (c) return c;
      const ids = parseIdList(b.weekIds, 'weekIds', isUuid, 'must contain only valid uuids.');
      if (!ids.ok) return ids;
      return { ok: true, value: { action, courseId: b.courseId as string, weekIds: ids.value } };
    }
    case 'delete_week': {
      const w = needWeek();
      return w ?? { ok: true, value: { action, weekId: b.weekId as string } };
    }
    case 'assign_module': {
      const w = needWeek();
      if (w) return w;
      const id = parseCellId(b.cellId);
      if (!id.ok) return id;
      return { ok: true, value: { action, weekId: b.weekId as string, cellId: id.value } };
    }
    case 'unassign_module': {
      const id = parseCellId(b.cellId);
      if (!id.ok) return id;
      return { ok: true, value: { action, cellId: id.value } };
    }
    case 'reorder_week_modules': {
      const w = needWeek();
      if (w) return w;
      const ids = parseIdList(
        b.cellIds,
        'cellIds',
        isBoundedCellId,
        'must contain only non-empty strings.',
      );
      if (!ids.ok) return ids;
      return { ok: true, value: { action, weekId: b.weekId as string, cellIds: ids.value } };
    }
  }
}

// --- Referential guards (U3) --------------------------------------------------
// Pure deciders so the policy is node-testable; index.ts performs the lookups and
// returns the 4xx. Both directions are guarded: assignment requires a published,
// non-archived, not-already-assigned module (this side), and admin-content's
// archive action refuses while a week membership exists (that side —
// archiveBlockedReason in admin-content-core.ts).

/** What index.ts looks up about the assignment target before deciding. */
export interface AssignTargetInfo {
  status: string;
  archivedAt: string | null;
  /** Title of the week the module already belongs to, or null when unassigned. */
  assignedWeekTitle: string | null;
}

/**
 * Returns the 400 rejection message for an invalid assignment, else null.
 * Unknown and unpublished (or archived) modules share one named-offender
 * message so the response doesn't
 * leak whether an id exists; an already-assigned module names its week
 * (unique(cell_id): a module belongs to at most one week).
 */
export function assignmentBlockedReason(
  cellId: string,
  target: AssignTargetInfo | null,
): string | null {
  if (!target || target.status !== 'published' || target.archivedAt !== null) {
    return `\`${cellId}\` does not reference an existing published module.`;
  }
  if (target.assignedWeekTitle !== null) {
    return `\`${cellId}\` is already assigned to ${target.assignedWeekTitle}. Unassign it first.`;
  }
  return null;
}

/**
 * Returns the 409 rejection message when deleting a week is blocked, else null.
 * A week is deletable only when it has no assigned modules (mirrors
 * deleteCohortBlockedReason in admin-cohorts-core).
 */
export function deleteWeekBlockedReason(memberCount: number): string | null {
  if (memberCount <= 0) return null;
  const noun = memberCount === 1 ? 'module' : 'modules';
  return (
    `Cannot delete a week with ${memberCount} assigned ${noun}. ` +
    'Unassign them first, then delete the week.'
  );
}

/**
 * Returns the 400 rejection message when an ordered reorder list does not match
 * the current set exactly (same ids, no more, no fewer), else null. Prevents a
 * stale client from silently dropping or resurrecting rows via reorder — the
 * reorder actions ONLY permute sort_order. `what` names the set for the message
 * (e.g. "the course's current weeks").
 */
export function reorderMismatchReason(
  what: string,
  currentIds: readonly string[],
  orderedIds: readonly string[],
): string | null {
  const current = new Set(currentIds);
  const supplied = new Set(orderedIds);
  const matches =
    current.size === supplied.size && [...current].every((id) => supplied.has(id));
  if (matches) return null;
  return `The ordered list must contain exactly ${what}. Reload and try again.`;
}

// --- Allowlist / domain (mirrors admin-cohorts) --------------------------------

export function isAllowlistedAdmin(
  email: string | null | undefined,
  csv: string | undefined,
): boolean {
  if (!email) return false;
  const allow = (csv ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
  return allow.includes(email.toLowerCase());
}

export function emailDomainAllowed(email: string | undefined | null, domain: string): boolean {
  if (!email) return false;
  return email.split('@')[1]?.toLowerCase() === domain.toLowerCase();
}

// --- CORS allow-list (mirrors admin-cohorts) -----------------------------------
const CORS_BASE = {
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  vary: 'Origin',
};

export function buildCorsHeaders(
  origin: string | null,
  allowedOrigins: string[],
): Record<string, string> {
  if (origin && allowedOrigins.includes(origin)) {
    return { ...CORS_BASE, 'access-control-allow-origin': origin };
  }
  return { ...CORS_BASE };
}

// --- Rate limiting (mirrors admin-cohorts) -------------------------------------
export interface RateLimitState {
  count: number;
  windowStart: number;
}

export function fixedWindowAllow(
  store: Map<string, RateLimitState>,
  key: string,
  now: number,
  limit: number,
  windowMs: number,
): boolean {
  const entry = store.get(key);
  if (!entry || now - entry.windowStart >= windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}

// Pure, runtime-agnostic logic for the `admin-cohorts` Edge Function (no Deno, no
// network), unit-tested under vitest. The Deno-only glue (auth, service_role
// client, DB writes, the in-memory limiter) lives in index.ts and calls here.
// Helpers are self-contained copies so the function bundles independently (the
// same posture as admin-set-role/admin-core.ts — keep in sync if those change).

// --- Action model -----------------------------------------------------------

export const COHORT_ACTIONS = [
  'create_cohort',
  'rename_cohort',
  'delete_cohort',
  'enroll_learner',
  'unenroll_learner',
  'assign_champion',
  'unassign_champion',
] as const;
export type CohortActionType = (typeof COHORT_ACTIONS)[number];

export type CohortAction =
  | { action: 'create_cohort'; name: string }
  | { action: 'rename_cohort'; cohortId: string; name: string }
  | { action: 'delete_cohort'; cohortId: string }
  | { action: 'enroll_learner'; cohortId: string; userId: string }
  | { action: 'unenroll_learner'; userId: string }
  | { action: 'assign_champion'; cohortId: string; userId: string }
  | { action: 'unassign_champion'; cohortId: string; userId: string };

export type ParseResult =
  | { ok: true; value: CohortAction }
  | { ok: false; error: string };

const NAME_MAX = 120;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

/** A non-empty, length-bounded display name (trimmed). */
function parseName(v: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof v !== 'string' || v.trim() === '') {
    return { ok: false, error: '`name` must be a non-empty string.' };
  }
  const name = v.trim();
  if (name.length > NAME_MAX) {
    return { ok: false, error: `\`name\` must be at most ${NAME_MAX} characters.` };
  }
  return { ok: true, value: name };
}

/** Validates + normalizes the action request body. */
export function parseCohortAction(body: unknown): ParseResult {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }
  const b = body as Record<string, unknown>;
  const action = b.action;
  if (typeof action !== 'string' || !(COHORT_ACTIONS as readonly string[]).includes(action)) {
    return { ok: false, error: `\`action\` must be one of: ${COHORT_ACTIONS.join(', ')}.` };
  }

  const needCohort = (): { ok: false; error: string } | null =>
    isUuid(b.cohortId) ? null : { ok: false, error: '`cohortId` must be a valid uuid.' };
  const needUser = (): { ok: false; error: string } | null =>
    isUuid(b.userId) ? null : { ok: false, error: '`userId` must be a valid uuid.' };

  switch (action as CohortActionType) {
    case 'create_cohort': {
      const n = parseName(b.name);
      return n.ok ? { ok: true, value: { action, name: n.value } } : n;
    }
    case 'rename_cohort': {
      const c = needCohort();
      if (c) return c;
      const n = parseName(b.name);
      return n.ok ? { ok: true, value: { action, cohortId: b.cohortId as string, name: n.value } } : n;
    }
    case 'delete_cohort': {
      const c = needCohort();
      return c ?? { ok: true, value: { action, cohortId: b.cohortId as string } };
    }
    case 'enroll_learner': {
      const c = needCohort();
      if (c) return c;
      const u = needUser();
      return u ?? { ok: true, value: { action, cohortId: b.cohortId as string, userId: b.userId as string } };
    }
    case 'unenroll_learner': {
      const u = needUser();
      return u ?? { ok: true, value: { action, userId: b.userId as string } };
    }
    case 'assign_champion':
    case 'unassign_champion': {
      const c = needCohort();
      if (c) return c;
      const u = needUser();
      return u ?? { ok: true, value: { action, cohortId: b.cohortId as string, userId: b.userId as string } };
    }
  }
}

// --- Role transitions tied to champion (un)assignment ------------------------
// Champion has two facets: profiles.role (gates staff access, P5.1d) and
// cohort_champions rows (which cohorts they lead, P5.1c). Assigning a champion in
// the management UI should make that person an actual champion; unassigning their
// LAST cohort should hand the role back. These pure deciders keep that policy
// node-testable; index.ts performs the reads/writes.

/** On assign: a plain learner becomes a champion; champion/admin are left as-is. */
export function roleAfterAssign(currentRole: string | null): 'champion' | null {
  return currentRole === 'learner' ? 'champion' : null;
}

/**
 * On unassign: demote back to learner ONLY when the user is a champion AND this was
 * their last cohort (no remaining cohort_champions rows). A champion of other
 * cohorts keeps the role; an admin is never demoted.
 */
export function roleAfterUnassign(
  currentRole: string | null,
  remainingCohortCount: number,
): 'learner' | null {
  return currentRole === 'champion' && remainingCohortCount === 0 ? 'learner' : null;
}

// --- Allowlist / domain (mirrors admin-set-role/admin-core) ------------------

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

// --- CORS allow-list (mirrors admin-core) -----------------------------------
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

// --- Rate limiting (mirrors admin-core) -------------------------------------
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

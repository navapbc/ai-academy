// Pure, runtime-agnostic logic for the `admin-workshops` Edge Function (no Deno,
// no network), unit-tested under vitest. The Deno-only glue (auth, service_role
// client, the DB existence/published check on step cell_ids, DB writes, the
// in-memory limiter) lives in index.ts and calls here. Helpers are self-contained
// copies so the function bundles independently (the same posture as
// admin-cohorts/admin-cohorts-core.ts — keep in sync if those change).

// --- Action model -----------------------------------------------------------

export const WORKSHOP_ACTIONS = ['create', 'update', 'delete'] as const;
export type WorkshopActionType = (typeof WORKSHOP_ACTIONS)[number];

export type WorkshopAction =
  | { action: 'create'; title: string; intro: string | null; stepCellIds: string[] }
  | { action: 'update'; id: string; title: string; intro: string | null; stepCellIds: string[] }
  | { action: 'delete'; id: string };

export type ParseResult =
  | { ok: true; value: WorkshopAction }
  | { ok: false; error: string };

const TITLE_MAX = 200;
const INTRO_MAX = 2000;
const STEP_ID_MAX_LEN = 100;
const STEPS_MAX = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

/** A non-empty, length-bounded title (trimmed). */
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

/** Optional intro: absent/null/'' → null; a string is trimmed + length-bounded. */
function parseIntro(v: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (v === undefined || v === null) return { ok: true, value: null };
  if (typeof v !== 'string') {
    return { ok: false, error: '`intro` must be a string when provided.' };
  }
  const intro = v.trim();
  if (intro === '') return { ok: true, value: null };
  if (intro.length > INTRO_MAX) {
    return { ok: false, error: `\`intro\` must be at most ${INTRO_MAX} characters.` };
  }
  return { ok: true, value: intro };
}

/**
 * Array-shape validation only (the DB existence/published check lives in
 * index.ts): an array of non-empty, length-bounded, trimmed strings, no
 * duplicates, at most STEPS_MAX. An empty array is allowed (a workshop can be
 * seeded with no steps and filled in later).
 */
function parseStepCellIds(
  v: unknown,
): { ok: true; value: string[] } | { ok: false; error: string } {
  if (!Array.isArray(v)) {
    return { ok: false, error: '`stepCellIds` must be an array of strings.' };
  }
  if (v.length > STEPS_MAX) {
    return { ok: false, error: `\`stepCellIds\` must have at most ${STEPS_MAX} steps.` };
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of v) {
    if (typeof raw !== 'string' || raw.trim() === '') {
      return { ok: false, error: '`stepCellIds` must contain only non-empty strings.' };
    }
    const id = raw.trim();
    if (id.length > STEP_ID_MAX_LEN) {
      return {
        ok: false,
        error: `each step cell id must be at most ${STEP_ID_MAX_LEN} characters.`,
      };
    }
    if (seen.has(id)) {
      return { ok: false, error: `\`stepCellIds\` must not contain duplicates (\`${id}\`).` };
    }
    seen.add(id);
    out.push(id);
  }
  return { ok: true, value: out };
}

/** Validates + normalizes the action request body. */
export function parseWorkshopAction(body: unknown): ParseResult {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }
  const b = body as Record<string, unknown>;
  const action = b.action;
  if (typeof action !== 'string' || !(WORKSHOP_ACTIONS as readonly string[]).includes(action)) {
    return { ok: false, error: `\`action\` must be one of: ${WORKSHOP_ACTIONS.join(', ')}.` };
  }

  const needId = (): { ok: false; error: string } | null =>
    isUuid(b.id) ? null : { ok: false, error: '`id` must be a valid uuid.' };

  switch (action as WorkshopActionType) {
    case 'create': {
      const t = parseTitle(b.title);
      if (!t.ok) return t;
      const i = parseIntro(b.intro);
      if (!i.ok) return i;
      const s = parseStepCellIds(b.stepCellIds);
      if (!s.ok) return s;
      return { ok: true, value: { action, title: t.value, intro: i.value, stepCellIds: s.value } };
    }
    case 'update': {
      const idErr = needId();
      if (idErr) return idErr;
      const t = parseTitle(b.title);
      if (!t.ok) return t;
      const i = parseIntro(b.intro);
      if (!i.ok) return i;
      const s = parseStepCellIds(b.stepCellIds);
      if (!s.ok) return s;
      return {
        ok: true,
        value: { action, id: b.id as string, title: t.value, intro: i.value, stepCellIds: s.value },
      };
    }
    case 'delete': {
      const idErr = needId();
      return idErr ?? { ok: true, value: { action, id: b.id as string } };
    }
  }
}

// --- Allowlist / domain (mirrors admin-cohorts-core) -------------------------

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

// --- CORS allow-list (mirrors admin-cohorts-core) ---------------------------
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

// --- Rate limiting (mirrors admin-cohorts-core) -----------------------------
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

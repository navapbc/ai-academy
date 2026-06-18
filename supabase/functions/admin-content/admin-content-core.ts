// Pure, runtime-agnostic logic for the `admin-content` Edge Function (no Deno, no
// network), unit-tested under vitest. The Deno-only glue (auth, service_role
// client, DB reads/writes, the in-memory limiter) lives in index.ts and calls
// here. Helpers are self-contained copies so the function bundles independently
// (same posture as admin-cohorts-core.ts — keep in sync if those change).
//
// This is the CMS write contract: it parses + validates every mutation body, and
// owns the write-time JSON schema validation of quiz_json / lab_config_json /
// sorter_config_json that closes W2-7 / D-16 (server-authoritative; the client
// editors import the same validators for inline feedback). The per-kind lab
// validation is deepened in Chunks 4/5; the structural skeleton lives here.

// --- Action model -----------------------------------------------------------

export const CONTENT_ACTIONS = ['save-draft', 'publish', 'archive', 'restore'] as const;
export type ContentActionType = (typeof CONTENT_ACTIONS)[number];

/**
 * The admin working copy of a lesson's editable fields, keyed by LIVE column
 * name so publish is a straight copy. Every field is optional — Save posts the
 * full working copy the editor holds, but a partial body is still a valid draft.
 */
export interface DraftFields {
  title?: string;
  type?: string;
  body_md?: string | null;
  video_url?: string | null;
  tutor_reference_md?: string | null;
  quiz_json?: unknown;
  lab_config_json?: unknown;
  sorter_config_json?: unknown;
}

/** The editable-field column names, in publish-copy order. */
export const DRAFT_COLUMN_KEYS = [
  'title',
  'type',
  'body_md',
  'video_url',
  'tutor_reference_md',
  'quiz_json',
  'lab_config_json',
  'sorter_config_json',
] as const;

export type ContentAction =
  | { action: 'save-draft'; cellId: string; draft: DraftFields }
  | { action: 'publish'; cellId: string }
  | { action: 'archive'; cellId: string }
  | { action: 'restore'; cellId: string };

export type ParseResult =
  | { ok: true; value: ContentAction }
  | { ok: false; error: string };

type Ok<T> = { ok: true; value: T };
type Err = { ok: false; error: string };
type Result<T> = Ok<T> | Err;
const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
const err = (error: string): Err => ({ ok: false, error });

// modules.cell_id is the text PK ('1.4', '2.15', or 'custom-<slug>') — NOT a uuid.
const CELL_ID_RE = /^[a-z0-9][a-z0-9.\-]*$/i;
const CELL_ID_MAX = 80;
const TITLE_MAX = 300;
const TYPE_MAX = 40;

export function isValidCellId(v: unknown): v is string {
  return typeof v === 'string' && v.length <= CELL_ID_MAX && CELL_ID_RE.test(v);
}

// --- Field validators --------------------------------------------------------

/** An optional http(s) URL (empty/absent is allowed — video is optional). */
export function isValidVideoUrl(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return true;
  if (typeof v !== 'string') return false;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * quiz_json: a non-empty array of multiple-choice questions. Chunk 4 tightens
 * the option count to exactly 4; here we require a well-formed, gradeable shape
 * (≥2 options, an in-range correctIndex) so a malformed quiz is rejected at write.
 */
export function validateQuizJson(v: unknown): Result<unknown> {
  if (!Array.isArray(v)) return err('`quiz_json` must be an array of questions.');
  if (v.length < 1) return err('`quiz_json` must have at least one question.');
  for (let i = 0; i < v.length; i++) {
    const q = v[i] as Record<string, unknown>;
    if (typeof q !== 'object' || q === null) return err(`quiz_json[${i}] must be an object.`);
    if (typeof q.question !== 'string' || q.question.trim() === '') {
      return err(`quiz_json[${i}].question must be a non-empty string.`);
    }
    if (!Array.isArray(q.options) || q.options.length < 2) {
      return err(`quiz_json[${i}].options must be an array of at least 2 options.`);
    }
    if (!q.options.every((o) => typeof o === 'string' && o.trim() !== '')) {
      return err(`quiz_json[${i}].options must all be non-empty strings.`);
    }
    if (
      typeof q.correctIndex !== 'number' ||
      !Number.isInteger(q.correctIndex) ||
      q.correctIndex < 0 ||
      q.correctIndex >= q.options.length
    ) {
      return err(`quiz_json[${i}].correctIndex must be an integer within the options range.`);
    }
    if (typeof q.explanation !== 'string') {
      return err(`quiz_json[${i}].explanation must be a string.`);
    }
  }
  return ok(v);
}

/** The lab_config_json `kind` discriminators (mirrors the LabConfig union in types.ts). */
export const LAB_KINDS = [
  'prompt-construction',
  'data-classifier',
  'tool-triage',
  'failure-spotter',
  'disclosure-builder',
  'regulatory-check',
  'context-diagnostic',
  'reflection',
  'harm-rubric',
  'signoff-checklist',
  'critique',
  'synthesis',
  'output-audit',
  'calibration',
  'voice-edit',
  'prompt-eval',
  'iteration',
  'paired-calibration',
  'dashboard-critique',
  'use-case-portfolio',
  'failure-log',
  'glat',
] as const;

/**
 * lab_config_json: a discriminated config object whose `kind` must be a known
 * LabConfig member. Structural skeleton here (rejects non-objects + unknown
 * kinds with a named error — the W2-7/D-16 containment); Chunk 5 adds the
 * per-kind field validation.
 */
export function validateLabConfigJson(v: unknown): Result<unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    return err('`lab_config_json` must be an object.');
  }
  const kind = (v as Record<string, unknown>).kind;
  if (typeof kind !== 'string' || !(LAB_KINDS as readonly string[]).includes(kind)) {
    return err(`\`lab_config_json.kind\` must be one of the known lab kinds (got ${JSON.stringify(kind)}).`);
  }
  return ok(v);
}

/** A scenario-sorter category (mirrors SorterCategory in types.ts). */
export const SORTER_CATEGORIES = ['delegate', 'assist', 'human-only', 'refuse'] as const;

/** sorter_config_json: kind 'scenario-sort' + a non-empty, well-formed scenarios[]. */
export function validateSorterConfigJson(v: unknown): Result<unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    return err('`sorter_config_json` must be an object.');
  }
  const cfg = v as Record<string, unknown>;
  if (cfg.kind !== 'scenario-sort') {
    return err("`sorter_config_json.kind` must be 'scenario-sort'.");
  }
  if (!Array.isArray(cfg.scenarios) || cfg.scenarios.length < 1) {
    return err('`sorter_config_json.scenarios` must be a non-empty array.');
  }
  for (let i = 0; i < cfg.scenarios.length; i++) {
    const s = cfg.scenarios[i] as Record<string, unknown>;
    if (typeof s !== 'object' || s === null) return err(`sorter scenarios[${i}] must be an object.`);
    if (typeof s.id !== 'string' || s.id.trim() === '') return err(`sorter scenarios[${i}].id must be a non-empty string.`);
    if (typeof s.text !== 'string' || s.text.trim() === '') return err(`sorter scenarios[${i}].text must be a non-empty string.`);
    if (!(SORTER_CATEGORIES as readonly string[]).includes(s.correct as string)) {
      return err(`sorter scenarios[${i}].correct must be one of: ${SORTER_CATEGORIES.join(', ')}.`);
    }
    if (typeof s.rationale !== 'string') return err(`sorter scenarios[${i}].rationale must be a string.`);
  }
  return ok(v);
}

/**
 * Validates + normalizes the draft working copy: every supplied field is checked,
 * absent fields are left out (a partial draft is valid). Returns a clean object
 * keyed by live column name (publish-ready).
 */
export function validateDraft(raw: unknown): Result<DraftFields> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return err('`draft` must be an object.');
  }
  const b = raw as Record<string, unknown>;
  const draft: DraftFields = {};

  if ('title' in b) {
    if (typeof b.title !== 'string' || b.title.trim() === '') return err('`title` must be a non-empty string.');
    if (b.title.length > TITLE_MAX) return err(`\`title\` must be at most ${TITLE_MAX} characters.`);
    draft.title = b.title.trim();
  }
  if ('type' in b) {
    if (typeof b.type !== 'string' || b.type.trim() === '') return err('`type` must be a non-empty string.');
    if (b.type.length > TYPE_MAX) return err(`\`type\` must be at most ${TYPE_MAX} characters.`);
    draft.type = b.type.trim();
  }
  if ('body_md' in b) {
    if (b.body_md !== null && typeof b.body_md !== 'string') return err('`body_md` must be a string or null.');
    draft.body_md = b.body_md as string | null;
  }
  if ('video_url' in b) {
    if (!isValidVideoUrl(b.video_url)) return err('`video_url` must be an http(s) URL.');
    draft.video_url = (b.video_url === '' ? null : (b.video_url as string | null)) ?? null;
  }
  if ('tutor_reference_md' in b) {
    if (b.tutor_reference_md !== null && typeof b.tutor_reference_md !== 'string') {
      return err('`tutor_reference_md` must be a string or null.');
    }
    draft.tutor_reference_md = b.tutor_reference_md as string | null;
  }
  if ('quiz_json' in b && b.quiz_json !== null) {
    const r = validateQuizJson(b.quiz_json);
    if (!r.ok) return r;
    draft.quiz_json = b.quiz_json;
  } else if ('quiz_json' in b) {
    draft.quiz_json = null;
  }
  if ('lab_config_json' in b && b.lab_config_json !== null) {
    const r = validateLabConfigJson(b.lab_config_json);
    if (!r.ok) return r;
    draft.lab_config_json = b.lab_config_json;
  } else if ('lab_config_json' in b) {
    draft.lab_config_json = null;
  }
  if ('sorter_config_json' in b && b.sorter_config_json !== null) {
    const r = validateSorterConfigJson(b.sorter_config_json);
    if (!r.ok) return r;
    draft.sorter_config_json = b.sorter_config_json;
  } else if ('sorter_config_json' in b) {
    draft.sorter_config_json = null;
  }

  return ok(draft);
}

/** Validates + normalizes the action request body. */
export function parseContentAction(body: unknown): ParseResult {
  if (typeof body !== 'object' || body === null) {
    return err('Request body must be a JSON object.');
  }
  const b = body as Record<string, unknown>;
  const action = b.action;
  if (typeof action !== 'string' || !(CONTENT_ACTIONS as readonly string[]).includes(action)) {
    return err(`\`action\` must be one of: ${CONTENT_ACTIONS.join(', ')}.`);
  }
  if (!isValidCellId(b.cellId)) {
    return err('`cellId` must be a valid module id.');
  }
  const cellId = b.cellId;

  switch (action as ContentActionType) {
    case 'save-draft': {
      const d = validateDraft(b.draft);
      return d.ok ? ok({ action, cellId, draft: d.value }) : d;
    }
    case 'publish':
      return ok({ action, cellId });
    case 'archive':
      return ok({ action, cellId });
    case 'restore':
      return ok({ action, cellId });
  }
}

/**
 * Builds the single atomic UPDATE that promotes a draft to live on publish:
 * copies each present draft field onto its live column, sets status='published',
 * bumps version ABSOLUTELY (currentVersion + 1, never `version = version + 1` —
 * DATA-05), and nulls the draft. Caller guards that a draft exists.
 */
export function buildPublishUpdate(
  draft: Record<string, unknown>,
  currentVersion: number,
): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  for (const key of DRAFT_COLUMN_KEYS) {
    if (key in draft) update[key] = draft[key];
  }
  update.status = 'published';
  update.version = currentVersion + 1;
  update.draft = null;
  return update;
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

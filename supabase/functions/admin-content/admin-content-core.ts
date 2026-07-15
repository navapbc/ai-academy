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

export const CONTENT_ACTIONS = [
  'save-draft',
  'publish',
  'archive',
  'restore',
  'create-custom',
] as const;
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
  | { action: 'publish'; cellId: string; note: string | null }
  | { action: 'archive'; cellId: string }
  | { action: 'restore'; cellId: string }
  // origin (restructure U3): 'custom' (default — a public standalone lesson) or
  // 'course' (a program-visible Course lesson, assigned to a week separately via
  // the admin-courses function).
  | { action: 'create-custom'; title: string; type: string; origin: CreatableOrigin };

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
// The optional publish "what changed?" note is admin-only free text; cap it so a
// pasted document can't bloat the append-only content_versions history (X.2).
export const NOTE_MAX = 500;

export function isValidCellId(v: unknown): v is string {
  return typeof v === 'string' && v.length <= CELL_ID_MAX && CELL_ID_RE.test(v);
}

// --- Module origin (cohort-restructure U1) -----------------------------------
// Mirrors the DB `modules_origin_check` constraint and the ModuleOrigin union in
// src/types.ts — keep all three in lockstep. 'matrix' = one of the 28 fixed
// cells (has a stage); 'custom' and 'course' are stage-less (stage = null,
// enforced by modules_origin_stage_check). Wherever this function validates an
// origin (U3 adds the create-course variant), this is the allow-list.
export const MODULE_ORIGINS = ['matrix', 'custom', 'course'] as const;
export type ModuleOrigin = (typeof MODULE_ORIGINS)[number];

export function isValidOrigin(v: unknown): v is ModuleOrigin {
  return typeof v === 'string' && (MODULE_ORIGINS as readonly string[]).includes(v);
}

// --- Custom / course (free-form) lessons (P5.4-6 / restructure U3) -----------
// A CMS-created lesson gets a server-generated cell_id `<prefix><slug>`. The
// slug is derived deterministically from the title and collision-guarded
// against existing ids, so creating "Prompt basics" twice yields distinct ids.
// The same machinery mints both `custom-<slug>` (P5.4-6) and `course-<slug>`
// (U3) ids — the client never mints non-custom ids (Key Decisions).

/** The fixed prefix every custom lesson's cell_id carries. */
export const CUSTOM_ID_PREFIX = 'custom-';
/** The fixed prefix every CMS-created course lesson's cell_id carries (U3). */
export const COURSE_ID_PREFIX = 'course-';

/** The origins the create-custom action can mint (mirrors ContentAction). */
export const CREATABLE_ORIGINS = ['custom', 'course'] as const;
export type CreatableOrigin = (typeof CREATABLE_ORIGINS)[number];

/** lower-cases, collapses non-alphanumerics to single hyphens, trims hyphens. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Deterministic, collision-free `<prefix><slug>` cell_id for a new lesson. The
 * slug is truncated so the id always fits CELL_ID_MAX (incl. room for a
 * disambiguating `-N` suffix) and passes isValidCellId — otherwise the new
 * lesson would 400 on its first save-draft (which re-validates the cell_id).
 * An all-punctuation/empty title falls back to `<prefix>lesson`. On collision
 * with an existing id, appends `-2`, `-3`, …
 */
function mintCellId(prefix: string, title: string, existingIds: readonly string[]): string {
  // The slug must leave room for the prefix within the cell_id length cap.
  const slugMax = CELL_ID_MAX - prefix.length;
  const taken = new Set(existingIds);
  const base = slugify(title);
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? '' : `-${n}`;
    const room = slugMax - suffix.length;
    const trimmed = base.slice(0, room).replace(/-+$/g, '');
    const slug = trimmed === '' ? 'lesson' : trimmed;
    const id = `${prefix}${slug}${suffix}`;
    if (!taken.has(id)) return id;
  }
}

/** `custom-<slug>` id for a new custom lesson (P5.4-6). */
export function customCellId(title: string, existingIds: readonly string[]): string {
  return mintCellId(CUSTOM_ID_PREFIX, title, existingIds);
}

/** `course-<slug>` id for a new CMS-created course lesson (U3). */
export function courseCellId(title: string, existingIds: readonly string[]): string {
  return mintCellId(COURSE_ID_PREFIX, title, existingIds);
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

/** A multiple-choice quiz question carries exactly this many options. */
export const QUIZ_OPTION_COUNT = 4;

/**
 * quiz_json: a non-empty array of multiple-choice questions. Each question must
 * have exactly 4 options (matrix + GLAT content is uniformly 4-option; the quiz
 * UI renders a fixed 4-option block), a non-empty question + every option, an
 * in-range correctIndex, and a string explanation — so a malformed quiz is
 * rejected at write (R8 / closes W2-7/D-16 for quiz_json). The QuizEditor imports
 * the client mirror of this rule for inline feedback; this is authoritative.
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
    if (!Array.isArray(q.options) || q.options.length !== QUIZ_OPTION_COUNT) {
      return err(`quiz_json[${i}].options must be an array of exactly ${QUIZ_OPTION_COUNT} options.`);
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
  'chat-compare',
  'decision-scenario',
  'glat',
] as const;

// --- lab_config_json: per-kind validation (P5.4-5, R8 / closes W2-7/D-16) ----
// Small typed predicates + composable field checks keep each kind validator a
// short, explicit list (the house style — cf. validateSorterConfigJson above).
// A check returns an error string on failure, or null when the field is valid.

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNonEmptyStr = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/** A `{ label, bodyMd }` markdown block (artifact/source/sources). bodyMd may be empty. */
function checkMdBlock(v: unknown, path: string): string | null {
  if (!isObj(v)) return `\`${path}\` must be an object.`;
  if (!isNonEmptyStr(v.label)) return `\`${path}.label\` must be a non-empty string.`;
  if (typeof v.bodyMd !== 'string') return `\`${path}.bodyMd\` must be a string.`;
  return null;
}

/** The optional LLM-judge rubric: `{ anchors: {id,label,description}[] }`. */
function checkRubric(v: unknown, path: string): string | null {
  if (!isObj(v)) return `\`${path}\` must be an object.`;
  if (!Array.isArray(v.anchors) || v.anchors.length < 1) {
    return `\`${path}.anchors\` must be a non-empty array.`;
  }
  for (let i = 0; i < v.anchors.length; i++) {
    const a = v.anchors[i];
    if (!isObj(a)) return `\`${path}.anchors[${i}]\` must be an object.`;
    if (!isNonEmptyStr(a.id)) return `\`${path}.anchors[${i}].id\` must be a non-empty string.`;
    if (!isNonEmptyStr(a.label)) return `\`${path}.anchors[${i}].label\` must be a non-empty string.`;
    if (typeof a.description !== 'string') {
      return `\`${path}.anchors[${i}].description\` must be a string.`;
    }
  }
  return null;
}

/** A `{ instruction: string, constraints?: string[] }` brief. */
function checkInstructionBrief(v: unknown, path: string): string | null {
  if (!isObj(v)) return `\`${path}\` must be an object.`;
  if (!isNonEmptyStr(v.instruction)) return `\`${path}.instruction\` must be a non-empty string.`;
  if ('constraints' in v && v.constraints !== undefined) {
    if (!Array.isArray(v.constraints) || !v.constraints.every((c) => typeof c === 'string')) {
      return `\`${path}.constraints\` must be an array of strings.`;
    }
  }
  return null;
}

/** A non-empty array; runs `each` per element and returns the first error. */
function checkArray(
  v: unknown,
  path: string,
  each: (item: unknown, itemPath: string) => string | null,
): string | null {
  if (!Array.isArray(v) || v.length < 1) return `\`${path}\` must be a non-empty array.`;
  for (let i = 0; i < v.length; i++) {
    const e = each(v[i], `${path}[${i}]`);
    if (e) return e;
  }
  return null;
}

/** An `{ id, label }` option used by the classifier/triage tools list. */
function checkIdLabel(v: unknown, path: string): string | null {
  if (!isObj(v)) return `\`${path}\` must be an object.`;
  if (!isNonEmptyStr(v.id)) return `\`${path}.id\` must be a non-empty string.`;
  if (!isNonEmptyStr(v.label)) return `\`${path}.label\` must be a non-empty string.`;
  return null;
}

/** A multiple-choice block: non-empty options + an in-range integer correctIndex. */
function checkMcOptions(
  options: unknown,
  correctIndex: unknown,
  path: string,
  exactCount?: number,
): string | null {
  if (!Array.isArray(options) || options.length < 2) {
    return `\`${path}.options\` must be an array of at least 2 options.`;
  }
  if (exactCount !== undefined && options.length !== exactCount) {
    return `\`${path}.options\` must have exactly ${exactCount} options.`;
  }
  if (!options.every((o) => isNonEmptyStr(o))) {
    return `\`${path}.options\` must all be non-empty strings.`;
  }
  if (
    typeof correctIndex !== 'number' ||
    !Number.isInteger(correctIndex) ||
    correctIndex < 0 ||
    correctIndex >= options.length
  ) {
    return `\`${path}.correctIndex\` must be an integer within the options range.`;
  }
  return null;
}

/** Runs each check in order and returns the first error (or null = ok). */
function firstError(...checks: (string | null)[]): string | null {
  for (const c of checks) if (c) return c;
  return null;
}

/** The decision-scenario workflow phases (mirrors DecisionCheckpoint in types.ts). */
const DECISION_PHASES = ['delegate', 'ground', 'scope', 'verify'] as const;

/**
 * Per-kind validators. Each receives the config object (already confirmed to be
 * an object with a known `kind`) and returns the first field error, or null when
 * valid. Only the fields the learner-side exercise components dereference are
 * required — extra/optional fields pass through (admin-authored, re-validated on
 * the next edit). This is the W2-7/D-16 fix: a malformed lab is rejected at write,
 * so the renderer never dereferences a missing field (the white-screen class).
 */
const LAB_VALIDATORS: Record<string, (c: Obj) => string | null> = {
  'prompt-construction': (c) =>
    firstError(
      isObj(c.brief) && isNonEmptyStr((c.brief as Obj).task)
        ? Array.isArray((c.brief as Obj).constraints)
          ? null
          : '`brief.constraints` must be an array.'
        : '`brief.task` must be a non-empty string.',
      checkArray(c.scaffoldHints, 'scaffoldHints', (h, p) =>
        isObj(h) && isNonEmptyStr(h.label) && typeof h.hint === 'string'
          ? null
          : `\`${p}\` must be { label, hint }.`,
      ),
      'rubric' in c && c.rubric !== undefined ? checkRubric(c.rubric, 'rubric') : null,
    ),

  'data-classifier': (c) =>
    firstError(
      checkArray(c.tools, 'tools', checkIdLabel),
      Array.isArray(c.classes) && c.classes.length >= 1 && c.classes.every((x) => isNonEmptyStr(x))
        ? null
        : '`classes` must be a non-empty array of strings.',
      checkArray(c.items, 'items', (it, p) =>
        isObj(it) &&
        isNonEmptyStr(it.text) &&
        isNonEmptyStr(it.dataClass) &&
        isNonEmptyStr(it.tool) &&
        typeof it.why === 'string'
          ? null
          : `\`${p}\` must be { text, dataClass, tool, why }.`,
      ),
    ),

  'tool-triage': (c) =>
    firstError(
      checkArray(c.tools, 'tools', checkIdLabel),
      checkArray(c.cases, 'cases', (cs, p) =>
        isObj(cs) && isNonEmptyStr(cs.text) && isNonEmptyStr(cs.tool) && typeof cs.why === 'string'
          ? null
          : `\`${p}\` must be { text, tool, why }.`,
      ),
    ),

  'failure-spotter': (c) =>
    checkArray(c.items, 'items', (it, p) => {
      if (!isObj(it)) return `\`${p}\` must be an object.`;
      if (!isNonEmptyStr(it.id)) return `\`${p}.id\` must be a non-empty string.`;
      if (typeof it.artifactMd !== 'string') return `\`${p}.artifactMd\` must be a string.`;
      for (const q of ['issue', 'mitigation'] as const) {
        const qv = it[q];
        if (!isObj(qv)) return `\`${p}.${q}\` must be an object.`;
        if (!isNonEmptyStr(qv.prompt)) return `\`${p}.${q}.prompt\` must be a non-empty string.`;
        const mc = checkMcOptions(qv.options, qv.correctIndex, `${p}.${q}`);
        if (mc) return mc;
        if (typeof qv.why !== 'string') return `\`${p}.${q}.why\` must be a string.`;
      }
      return null;
    }),

  // disclosure-builder / regulatory-check / context-diagnostic share one shape.
  scenario: (c) =>
    firstError(
      checkArray(c.items, 'items', (it, p) =>
        isObj(it)
          ? firstError(
              isNonEmptyStr(it.prompt) ? null : `\`${p}.prompt\` must be a non-empty string.`,
              checkMcOptions(it.options, it.correctIndex, p, 4),
              typeof it.why === 'string' ? null : `\`${p}.why\` must be a string.`,
            )
          : `\`${p}\` must be an object.`,
      ),
      isObj(c.takeaway) && isNonEmptyStr(c.takeaway.title) && typeof c.takeaway.intro === 'string'
        ? null
        : '`takeaway` must be { title, intro }.',
    ),

  reflection: (c) =>
    firstError(
      isNonEmptyStr(c.prompt) ? null : '`prompt` must be a non-empty string.',
      isNonEmptyStr(c.guidance) ? null : '`guidance` must be a non-empty string.',
      typeof c.minWords === 'number' && Number.isInteger(c.minWords) && c.minWords >= 0
        ? null
        : '`minWords` must be a non-negative integer.',
    ),

  'harm-rubric': (c) => {
    const patternsErr = checkArray(c.patterns, 'patterns', (pt, p) =>
      isObj(pt) && isNonEmptyStr(pt.id) && isNonEmptyStr(pt.label) && typeof pt.desc === 'string'
        ? null
        : `\`${p}\` must be { id, label, desc }.`,
    );
    if (patternsErr) return patternsErr;
    const ids = new Set((c.patterns as Obj[]).map((p) => p.id));
    return checkArray(c.scenarios, 'scenarios', (s, p) => {
      if (!isObj(s)) return `\`${p}\` must be an object.`;
      if (!isNonEmptyStr(s.id)) return `\`${p}.id\` must be a non-empty string.`;
      if (!isNonEmptyStr(s.text)) return `\`${p}.text\` must be a non-empty string.`;
      if (!ids.has(s.correct)) return `\`${p}.correct\` must reference a pattern id.`;
      if (typeof s.why !== 'string') return `\`${p}.why\` must be a string.`;
      return null;
    });
  },

  'signoff-checklist': (c) =>
    firstError(
      checkArray(c.roles, 'roles', (r, p) =>
        isObj(r) && isNonEmptyStr(r.id) && isNonEmptyStr(r.label) && typeof r.desc === 'string'
          ? null
          : `\`${p}\` must be { id, label, desc }.`,
      ),
      checkArray(c.commitments, 'commitments', (cm, p) =>
        isObj(cm) && isNonEmptyStr(cm.id) && isNonEmptyStr(cm.text)
          ? null
          : `\`${p}\` must be { id, text }.`,
      ),
    ),

  critique: (c) =>
    firstError(
      checkInstructionBrief(c.brief, 'brief'),
      checkMdBlock(c.artifact, 'artifact'),
      checkRubric(c.rubric, 'rubric'),
    ),

  synthesis: (c) =>
    firstError(
      checkInstructionBrief(c.brief, 'brief'),
      checkMdBlock(c.sources, 'sources'),
      checkRubric(c.rubric, 'rubric'),
    ),

  'output-audit': (c) =>
    firstError(
      checkMdBlock(c.artifact, 'artifact'),
      checkArray(c.claims, 'claims', (cl, p) =>
        isObj(cl) &&
        isNonEmptyStr(cl.id) &&
        isNonEmptyStr(cl.text) &&
        (cl.status === 'supported' || cl.status === 'fabricated') &&
        typeof cl.why === 'string'
          ? null
          : `\`${p}\` must be { id, text, status: 'supported'|'fabricated', why }.`,
      ),
    ),

  calibration: (c) => {
    const scaleErr = checkArray(c.scale, 'scale', (s, p) =>
      isObj(s) && isNonEmptyStr(s.id) && isNonEmptyStr(s.label)
        ? null
        : `\`${p}\` must be { id, label }.`,
    );
    if (scaleErr) return scaleErr;
    const ids = new Set((c.scale as Obj[]).map((s) => s.id));
    return checkArray(c.items, 'items', (it, p) => {
      if (!isObj(it)) return `\`${p}\` must be an object.`;
      if (!isNonEmptyStr(it.id)) return `\`${p}.id\` must be a non-empty string.`;
      if (!isNonEmptyStr(it.task)) return `\`${p}.task\` must be a non-empty string.`;
      if (!ids.has(it.target)) return `\`${p}.target\` must reference a scale id.`;
      if (typeof it.why !== 'string') return `\`${p}.why\` must be a string.`;
      return null;
    });
  },

  'voice-edit': (c) =>
    firstError(
      checkMdBlock(c.source, 'source'),
      checkInstructionBrief(c.brief, 'brief'),
      checkRubric(c.rubric, 'rubric'),
    ),

  'prompt-eval': (c) =>
    firstError(
      checkInstructionBrief(c.brief, 'brief'),
      checkArray(c.testCases, 'testCases', (t, p) =>
        isObj(t) && isNonEmptyStr(t.id) && isNonEmptyStr(t.label) && typeof t.input === 'string'
          ? null
          : `\`${p}\` must be { id, label, input }.`,
      ),
      checkRubric(c.rubric, 'rubric'),
    ),

  iteration: (c) =>
    firstError(
      checkInstructionBrief(c.brief, 'brief'),
      typeof c.minTurns === 'number' && Number.isInteger(c.minTurns) && c.minTurns >= 1
        ? null
        : '`minTurns` must be an integer ≥ 1.',
      checkRubric(c.rubric, 'rubric'),
    ),

  'paired-calibration': (c) => {
    for (const t of ['offTask', 'onTask'] as const) {
      const tv = c[t];
      if (!isObj(tv) || !isNonEmptyStr(tv.label) || !isNonEmptyStr(tv.brief)) {
        return `\`${t}\` must be { label, brief }.`;
      }
    }
    return null;
  },

  'dashboard-critique': (c) =>
    firstError(
      isObj(c.dashboard) && isNonEmptyStr(c.dashboard.title)
        ? checkArray((c.dashboard as Obj).metrics, 'dashboard.metrics', (m, p) =>
            isObj(m) && isNonEmptyStr(m.label) && isNonEmptyStr(m.value)
              ? null
              : `\`${p}\` must be { label, value }.`,
          )
        : '`dashboard` must be { title, metrics[] }.',
      checkArray(c.signals, 'signals', (s, p) =>
        isObj(s) &&
        isNonEmptyStr(s.id) &&
        isNonEmptyStr(s.label) &&
        typeof s.hidden === 'boolean' &&
        typeof s.why === 'string'
          ? null
          : `\`${p}\` must be { id, label, hidden, why }.`,
      ),
    ),

  'use-case-portfolio': (c) => {
    const lib = c.library;
    if (
      !isObj(lib) ||
      !isNonEmptyStr(lib.title) ||
      !isNonEmptyStr(lib.helper) ||
      typeof lib.minEntries !== 'number' ||
      !Number.isInteger(lib.minEntries) ||
      lib.minEntries < 1
    ) {
      return '`library` must be { title, helper, minEntries≥1, … }.';
    }
    const dil = c.diligence;
    if (!isObj(dil) || !isNonEmptyStr(dil.title) || !isNonEmptyStr(dil.helper)) {
      return '`diligence` must be { title, helper, dimensions[], … }.';
    }
    if (typeof dil.minWords !== 'number' || !Number.isInteger(dil.minWords) || dil.minWords < 0) {
      return '`diligence.minWords` must be a non-negative integer.';
    }
    return checkArray(dil.dimensions, 'diligence.dimensions', (d, p) =>
      isObj(d) && isNonEmptyStr(d.id) && isNonEmptyStr(d.label) && isNonEmptyStr(d.prompt)
        ? null
        : `\`${p}\` must be { id, label, prompt }.`,
    );
  },

  'failure-log': (c) =>
    firstError(
      isNonEmptyStr(c.title) ? null : '`title` must be a non-empty string.',
      isNonEmptyStr(c.helper) ? null : '`helper` must be a non-empty string.',
      typeof c.minEntries === 'number' && Number.isInteger(c.minEntries) && c.minEntries >= 1
        ? null
        : '`minEntries` must be an integer ≥ 1.',
      typeof c.targetEntries === 'number' &&
      Number.isInteger(c.targetEntries) &&
      c.targetEntries >= 1
        ? null
        : '`targetEntries` must be an integer ≥ 1.',
    ),

  // chat-compare (restructure U6): 1–4 panes of all-optional string fields —
  // a bare pane is plain Claude; systemPromptMd rigs it; sourceMd grounds it.
  'chat-compare': (c) => {
    if (!Array.isArray(c.panes) || c.panes.length < 1 || c.panes.length > 4) {
      return '`panes` must be an array of 1–4 panes.';
    }
    for (let i = 0; i < c.panes.length; i++) {
      const pane = c.panes[i];
      if (!isObj(pane)) return `\`panes[${i}]\` must be an object.`;
      for (const f of ['label', 'systemPromptMd', 'sourceMd'] as const) {
        if (f in pane && pane[f] !== undefined && typeof pane[f] !== 'string') {
          return `\`panes[${i}].${f}\` must be a string.`;
        }
      }
    }
    if ('suggestedPrompts' in c && c.suggestedPrompts !== undefined) {
      if (!Array.isArray(c.suggestedPrompts) || !c.suggestedPrompts.every((s) => typeof s === 'string')) {
        return '`suggestedPrompts` must be an array of strings.';
      }
    }
    return null;
  },

  // decision-scenario (restructure U7): a LINEAR "Walk the Workflow" checkpoint
  // scenario — required introMd, ≥1 checkpoints of { id, phase∈(delegate|ground|
  // scope|verify), setupMd, prompt, options[≥2] of { text, feedbackMd } };
  // multiSelect and closingMd optional.
  'decision-scenario': (c) => {
    if (!isNonEmptyStr(c.introMd)) return '`introMd` must be a non-empty string.';
    if (!Array.isArray(c.checkpoints) || c.checkpoints.length < 1) {
      return '`checkpoints` must be a non-empty array.';
    }
    for (let i = 0; i < c.checkpoints.length; i++) {
      const cp = c.checkpoints[i];
      const p = `checkpoints[${i}]`;
      if (!isObj(cp)) return `\`${p}\` must be an object.`;
      if (!isNonEmptyStr(cp.id)) return `\`${p}.id\` must be a non-empty string.`;
      if (!(DECISION_PHASES as readonly string[]).includes(cp.phase as string)) {
        return `\`${p}.phase\` must be one of: ${DECISION_PHASES.join(', ')}.`;
      }
      if (!isNonEmptyStr(cp.setupMd)) return `\`${p}.setupMd\` must be a non-empty string.`;
      if (!isNonEmptyStr(cp.prompt)) return `\`${p}.prompt\` must be a non-empty string.`;
      if ('multiSelect' in cp && cp.multiSelect !== undefined && typeof cp.multiSelect !== 'boolean') {
        return `\`${p}.multiSelect\` must be a boolean.`;
      }
      if (!Array.isArray(cp.options) || cp.options.length < 2) {
        return `\`${p}.options\` must be an array of at least 2 options.`;
      }
      for (let j = 0; j < cp.options.length; j++) {
        const opt = cp.options[j];
        if (!isObj(opt) || !isNonEmptyStr(opt.text) || !isNonEmptyStr(opt.feedbackMd)) {
          return `\`${p}.options[${j}]\` must be { text, feedbackMd } (both non-empty strings).`;
        }
      }
    }
    if ('closingMd' in c && c.closingMd !== undefined && typeof c.closingMd !== 'string') {
      return '`closingMd` must be a string.';
    }
    return null;
  },

  glat: (c) => {
    // Number.isFinite rejects NaN/Infinity/non-numbers (a bare `typeof === number`
    // would let NaN through, since NaN <= 0 and NaN > 1 are both false).
    if (!Number.isFinite(c.passThreshold) || (c.passThreshold as number) <= 0 || (c.passThreshold as number) > 1) {
      return '`passThreshold` must be a number in (0, 1].';
    }
    const aErr = checkArray(c.sectionA, 'sectionA', (s, p) =>
      isObj(s) && isNonEmptyStr(s.id) && isNonEmptyStr(s.prompt)
        ? null
        : `\`${p}\` must be { id, prompt }.`,
    );
    if (aErr) return aErr;
    return checkArray(c.sectionBC, 'sectionBC', (s, p) => {
      if (!isObj(s)) return `\`${p}\` must be an object.`;
      if (!isNonEmptyStr(s.id)) return `\`${p}.id\` must be a non-empty string.`;
      if (!isNonEmptyStr(s.question)) return `\`${p}.question\` must be a non-empty string.`;
      const mc = checkMcOptions(s.options, s.correctIndex, p);
      if (mc) return mc;
      if (typeof s.rationale !== 'string') return `\`${p}.rationale\` must be a string.`;
      return null;
    });
  },
};

/**
 * lab_config_json: a discriminated config object whose `kind` must be a known
 * LabConfig member, validated per-kind (R8 / closes W2-7/D-16 for labs;
 * server-authoritative — the LabEditor imports the client mirror for inline
 * feedback). The three scenario kinds share one validator. Title/subtitle/intro
 * are optional everywhere and are not separately required here.
 */
export function validateLabConfigJson(v: unknown): Result<unknown> {
  if (!isObj(v)) {
    return err('`lab_config_json` must be an object.');
  }
  const kind = v.kind;
  if (typeof kind !== 'string' || !(LAB_KINDS as readonly string[]).includes(kind)) {
    return err(`\`lab_config_json.kind\` must be one of the known lab kinds (got ${JSON.stringify(kind)}).`);
  }
  const validatorKey =
    kind === 'disclosure-builder' || kind === 'regulatory-check' || kind === 'context-diagnostic'
      ? 'scenario'
      : kind;
  const fieldError = LAB_VALIDATORS[validatorKey]?.(v);
  if (fieldError) return err(fieldError);
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

  // create-custom is the one action with no incoming cellId — the server
  // generates `custom-<slug>` / `course-<slug>` — so it is validated before the
  // cellId gate.
  if (action === 'create-custom') {
    if (typeof b.title !== 'string' || b.title.trim() === '') {
      return err('`title` must be a non-empty string.');
    }
    if (b.title.length > TITLE_MAX) return err(`\`title\` must be at most ${TITLE_MAX} characters.`);
    if (typeof b.type !== 'string' || b.type.trim() === '') {
      return err('`type` must be a non-empty string.');
    }
    if (b.type.length > TYPE_MAX) return err(`\`type\` must be at most ${TYPE_MAX} characters.`);
    // Optional origin (U3): absent → 'custom' (the pre-U3 contract, unchanged).
    let origin: CreatableOrigin = 'custom';
    if (b.origin !== undefined && b.origin !== null) {
      if (!(CREATABLE_ORIGINS as readonly unknown[]).includes(b.origin)) {
        return err(`\`origin\` must be one of: ${CREATABLE_ORIGINS.join(', ')}.`);
      }
      origin = b.origin as CreatableOrigin;
    }
    return ok({ action, title: b.title.trim(), type: b.type.trim(), origin });
  }

  if (!isValidCellId(b.cellId)) {
    return err('`cellId` must be a valid module id.');
  }
  const cellId = b.cellId;

  switch (action as Exclude<ContentActionType, 'create-custom'>) {
    case 'save-draft': {
      const d = validateDraft(b.draft);
      return d.ok ? ok({ action, cellId, draft: d.value }) : d;
    }
    case 'publish': {
      const n = normalizePublishNote(b.note);
      return n.ok ? ok({ action, cellId, note: n.value }) : n;
    }
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

/**
 * Normalizes the optional publish note (X.2): trims it, maps an
 * empty/absent/whitespace-only value to `null`, and REJECTS an over-cap note
 * (> NOTE_MAX chars) via the Result pattern so parseContentAction 400s a huge
 * note rather than silently truncating history. A non-string (other than
 * undefined/null) is rejected too.
 */
export function normalizePublishNote(v: unknown): Result<string | null> {
  if (v === undefined || v === null) return ok(null);
  if (typeof v !== 'string') return err('`note` must be a string.');
  const trimmed = v.trim();
  if (trimmed === '') return ok(null);
  if (trimmed.length > NOTE_MAX) return err(`\`note\` must be at most ${NOTE_MAX} characters.`);
  return ok(trimmed);
}

/**
 * Builds the append-only content_versions insert payload written best-effort
 * after a successful publish (X.2 R1/R2). `snapshot` is the promoted live content
 * — the caller passes the same field set buildPublishUpdate copies draft→live, so
 * the snapshot equals exactly what was published. `note` is the already-normalized
 * optional note (trim/empty→null handled by normalizePublishNote / parse).
 */
export function buildContentVersionRow(input: {
  cellId: string;
  version: number;
  snapshot: Record<string, unknown>;
  authorId: string;
  note: string | null;
}): Record<string, unknown> {
  return {
    cell_id: input.cellId,
    version: input.version,
    snapshot_json: input.snapshot,
    author_id: input.authorId,
    note: input.note,
  };
}

/**
 * Builds the full row for a new free-form lesson (P5.4-6; origin variant U3).
 * It starts as a `draft` so it is invisible to learners until Publish (R3):
 * `stage=null` for both creatable origins (modules_origin_stage_check).
 * `origin='custom'` (default) puts it in the ungated "Resources & additional
 * lessons" group; `origin='course'` mints a `course-<slug>` id and sets
 * `visibility='program'` (enrolled + staff only once U4's policy is live) — week
 * assignment happens separately via admin-courses and never changes visibility
 * (Key Decisions). The title/type sit in the LIVE columns (the row is hidden by
 * status, so this is safe); the admin then stages body/quiz/lab edits into
 * `draft` via the reused editors and Publish promotes them. `sort_order` lands
 * after every existing row. The caller passes the existing ids (collision guard)
 * and the current max sort_order. The generated cell_id always satisfies
 * isValidCellId (the slug is length-capped) so later actions accept it.
 */
export function buildCustomInsert(
  title: string,
  type: string,
  existingIds: readonly string[],
  maxSortOrder: number,
  callerId: string,
  now: string,
  origin: CreatableOrigin = 'custom',
): Record<string, unknown> {
  return {
    cell_id:
      origin === 'course' ? courseCellId(title, existingIds) : customCellId(title, existingIds),
    origin,
    stage: null,
    status: 'draft',
    // Course lessons are program-visible; custom lessons keep the DB default
    // ('public') — stated explicitly so the write contract is visible here.
    visibility: origin === 'course' ? 'program' : 'public',
    title: title.trim(),
    type,
    // Free-form lessons sit outside the matrix's 4D/evidence framework; use
    // ungated-appropriate, schema-valid defaults (no self-report evidence).
    dimension: [],
    evidence_type: 'reflection',
    self_report_validity: 'na',
    body_md: null,
    version: 1,
    sort_order: maxSortOrder + 1,
    updated_by: callerId,
    updated_at: now,
  };
}

/**
 * Archive referential guard (restructure U3 — the admin-courses counterpart):
 * a lesson assigned to a course week cannot be archived, or learners would see
 * a week silently lose a member (and the membership row would dangle in the
 * CMS). Returns the 400 rejection message naming the week, else null; index.ts
 * looks up the membership + week title. Restore deliberately does NOT
 * auto-rejoin a week (an admin re-assigns explicitly via admin-courses).
 */
export function archiveBlockedReason(assignedWeekTitle: string | null | undefined): string | null {
  if (!assignedWeekTitle) return null;
  return (
    `This lesson is assigned to ${assignedWeekTitle}. ` +
    `Unassign it from ${assignedWeekTitle} first, then archive.`
  );
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

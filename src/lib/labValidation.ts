import type { LabConfig } from '../types';

// Client-side mirror of the server's lab_config_json validators
// (supabase/functions/admin-content/admin-content-core.ts → validateLabConfigJson)
// for the LabEditor's inline feedback (P5.4-5). The Edge Function re-validates on
// write and stays authoritative (R8 / W2-7/D-16) — this is UX only, so the admin
// sees a named error before saving rather than only on the 400. The tsconfig
// excludes `supabase/`, so the Deno core can't be imported here; this duplicate
// mirrors it field-for-field (the same house pattern as adminContent.validateQuizQuestions
// mirroring validateQuizJson — just larger, hence its own module). Keep the two in
// sync; admin-content-core.seed.test.ts proves the SERVER copy accepts all seeded
// content, and labValidation.test.ts pins this copy to representative cases.

/** The lab_config_json `kind` discriminators (mirrors the LabConfig union in types.ts). */
export const LAB_KINDS: LabConfig['kind'][] = [
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
  'prediction-sort',
  'glat',
];

/**
 * The three lab kinds the LabEditor exposes as structured forms (scalar-only, no
 * markdown body, no object arrays). Every other kind is edited as validated JSON.
 */
export const FORM_LAB_KINDS: LabConfig['kind'][] = ['reflection', 'failure-log', 'paired-calibration'];

/** Human labels for the kind picker. */
export const LAB_KIND_LABELS: Record<LabConfig['kind'], string> = {
  'prompt-construction': 'Prompt construction',
  'data-classifier': 'Data classifier',
  'tool-triage': 'Tool triage',
  'failure-spotter': 'Failure spotter',
  'disclosure-builder': 'Disclosure builder',
  'regulatory-check': 'Regulatory check',
  'context-diagnostic': 'Context diagnostic',
  reflection: 'Reflection',
  'harm-rubric': 'Harm rubric',
  'signoff-checklist': 'Sign-off checklist',
  critique: 'Critique',
  synthesis: 'Synthesis',
  'output-audit': 'Output audit',
  calibration: 'Calibration',
  'voice-edit': 'Voice edit',
  'prompt-eval': 'Prompt eval',
  iteration: 'Iteration',
  'paired-calibration': 'Paired calibration',
  'dashboard-critique': 'Dashboard critique',
  'use-case-portfolio': 'Use-case portfolio',
  'failure-log': 'Failure log',
  'chat-compare': 'Chat compare',
  'decision-scenario': 'Decision scenario',
  'prediction-sort': 'Prediction sort',
  glat: 'GLAT exam',
};

export type ValidationResult = { ok: true } | { ok: false; error: string };

// --- typed predicates + composable field checks (mirror the Deno core) -------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNonEmptyStr = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

function checkMdBlock(v: unknown, path: string): string | null {
  if (!isObj(v)) return `\`${path}\` must be an object.`;
  if (!isNonEmptyStr(v.label)) return `\`${path}.label\` must be a non-empty string.`;
  if (typeof v.bodyMd !== 'string') return `\`${path}.bodyMd\` must be a string.`;
  return null;
}

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

function checkIdLabel(v: unknown, path: string): string | null {
  if (!isObj(v)) return `\`${path}\` must be an object.`;
  if (!isNonEmptyStr(v.id)) return `\`${path}.id\` must be a non-empty string.`;
  if (!isNonEmptyStr(v.label)) return `\`${path}.label\` must be a non-empty string.`;
  return null;
}

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

function firstError(...checks: (string | null)[]): string | null {
  for (const c of checks) if (c) return c;
  return null;
}

/** The decision-scenario workflow phases (mirrors DecisionCheckpoint in types.ts). */
const DECISION_PHASES = ['delegate', 'ground', 'scope', 'verify'] as const;

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

  // prediction-sort (P?): a "lookup vs. predict" sorting exercise — required
  // introMd, bucketLabels{lookup,predict}, ≥1 items of { id, prompt, reveal },
  // and a uniform takeaway{title,body} payoff card.
  'prediction-sort': (c) =>
    firstError(
      isNonEmptyStr(c.introMd) ? null : '`introMd` must be a non-empty string.',
      isObj(c.bucketLabels) &&
      isNonEmptyStr((c.bucketLabels as Obj).lookup) &&
      isNonEmptyStr((c.bucketLabels as Obj).predict)
        ? null
        : '`bucketLabels` must be { lookup, predict } (both non-empty strings).',
      checkArray(c.items, 'items', (it, p) =>
        isObj(it) && isNonEmptyStr(it.id) && isNonEmptyStr(it.prompt) && isNonEmptyStr(it.reveal)
          ? null
          : `\`${p}\` must be { id, prompt, reveal } (all non-empty strings).`,
      ),
      isObj(c.takeaway) &&
      isNonEmptyStr((c.takeaway as Obj).title) &&
      isNonEmptyStr((c.takeaway as Obj).body)
        ? null
        : '`takeaway` must be { title, body } (both non-empty strings).',
    ),

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
 * Validates a parsed lab_config_json value against its `kind`. Mirrors the Deno
 * core `validateLabConfigJson`; the function re-validates on write (authoritative).
 */
export function validateLabConfig(v: unknown): ValidationResult {
  if (!isObj(v)) return { ok: false, error: '`lab_config_json` must be an object.' };
  const kind = v.kind;
  if (typeof kind !== 'string' || !(LAB_KINDS as readonly string[]).includes(kind)) {
    return {
      ok: false,
      error: `\`kind\` must be one of the known lab kinds (got ${JSON.stringify(kind)}).`,
    };
  }
  const key =
    kind === 'disclosure-builder' || kind === 'regulatory-check' || kind === 'context-diagnostic'
      ? 'scenario'
      : kind;
  const fieldError = LAB_VALIDATORS[key]?.(v);
  return fieldError ? { ok: false, error: fieldError } : { ok: true };
}

/**
 * Parses a JSON string then validates it as a lab_config_json of the expected kind.
 * Used by the LabEditor's JSON-fallback editor: a parse failure, a kind mismatch,
 * or a schema violation each yields a named error that blocks Save.
 */
export function parseAndValidateLabConfig(
  text: string,
  expectedKind: LabConfig['kind'],
): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}.` };
  }
  if (isObj(parsed) && parsed.kind !== expectedKind) {
    return {
      ok: false,
      error: `\`kind\` must stay "${expectedKind}" (got ${JSON.stringify(parsed.kind)}).`,
    };
  }
  return validateLabConfig(parsed);
}

// --- sorter_config_json (the scenario-sorter, a separate modules column) ------
// The scenario-sorter is the interactive exercise for cell 1.3; it lives in
// sorter_config_json, not lab_config_json, so the LabEditor edits it as a JSON
// kind that writes the other column. Mirrors the Deno core validateSorterConfigJson.

export const SORTER_KIND = 'scenario-sort' as const;
const SORTER_CATEGORIES = ['delegate', 'assist', 'human-only', 'refuse'] as const;

export function validateSorterConfig(v: unknown): ValidationResult {
  if (!isObj(v)) return { ok: false, error: '`sorter_config_json` must be an object.' };
  if (v.kind !== SORTER_KIND) {
    return { ok: false, error: "`sorter_config_json.kind` must be 'scenario-sort'." };
  }
  if (!Array.isArray(v.scenarios) || v.scenarios.length < 1) {
    return { ok: false, error: '`scenarios` must be a non-empty array.' };
  }
  for (let i = 0; i < v.scenarios.length; i++) {
    const s = v.scenarios[i];
    if (!isObj(s)) return { ok: false, error: `scenarios[${i}] must be an object.` };
    if (!isNonEmptyStr(s.id)) return { ok: false, error: `scenarios[${i}].id must be a non-empty string.` };
    if (!isNonEmptyStr(s.text)) return { ok: false, error: `scenarios[${i}].text must be a non-empty string.` };
    if (!(SORTER_CATEGORIES as readonly string[]).includes(s.correct as string)) {
      return { ok: false, error: `scenarios[${i}].correct must be one of: ${SORTER_CATEGORIES.join(', ')}.` };
    }
    if (typeof s.rationale !== 'string') return { ok: false, error: `scenarios[${i}].rationale must be a string.` };
  }
  return { ok: true };
}

/** Parses + validates a sorter_config_json string for the LabEditor's JSON editor. */
export function parseAndValidateSorterConfig(text: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}.` };
  }
  return validateSorterConfig(parsed);
}

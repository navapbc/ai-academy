// Pure grading-verdict logic for the `grade` Edge Function. No Deno APIs, so it
// runs under vitest like chat/chat-core.ts. The Edge Function (index.ts) calls
// Claude and feeds the raw model text to parseVerdict.

// --- Provider + model config (P6.1) -----------------------------------------
// Mirrors chat-core.ts. Duplicated (NOT imported) so this function bundles
// independently under Deno — see the index.ts header. A vitest parity test
// (verdict.test.ts) asserts these stay identical to chat-core's.
export interface ModelDescriptor {
  id: string;
  provider: 'anthropic';
}

export const MODELS: ModelDescriptor[] = [
  { id: 'claude-haiku-4-5', provider: 'anthropic' },
  { id: 'claude-sonnet-4-6', provider: 'anthropic' },
];

export const MODEL_ALLOWLIST: string[] = MODELS.map((m) => m.id);

export const FALLBACK_MODEL = 'claude-haiku-4-5';

export const ANTHROPIC_API = {
  url: 'https://api.anthropic.com/v1/messages',
  version: '2023-06-01',
} as const;

/**
 * Resolves the operator-configured default model: the env value if it's on the
 * allow-list, else the safe fallback. `grade` never accepts a client-supplied
 * model (the judge model is server-fixed) — this only validates the env default.
 */
export function resolveDefaultModel(envModel: string | undefined): string {
  return envModel && MODEL_ALLOWLIST.includes(envModel) ? envModel : FALLBACK_MODEL;
}

export interface RubricAnchor { id: string; label: string; description: string }
export interface GradingRubric { anchors: RubricAnchor[] }
/** One labelled block of the work the judge reads (P4.3b). */
export interface GradeSection { label: string; text: string }
/** A submission is a brief plus an ordered list of labelled sections. The prompt-
 * construction lab passes [prompt, response]; a critique passes [artifact, critique]. */
export interface GradeSubmission { brief: string; sections: GradeSection[] }
export interface AnchorScore { id: string; label: string; score: number; max: number; rationale: string }
export interface Verdict { perAnchor: AnchorScore[]; overall: number; maxOverall: number }

export const ANCHOR_MAX = 2;

export const GRADE_SYSTEM_PROMPT =
  'You are a strict, fair grader for an AI-literacy training lab. Score the ' +
  "learner's work against the rubric. For EACH anchor assign an integer score: " +
  '0 (not met), 1 (partially met), or 2 (fully met), with a one-sentence ' +
  'rationale grounded in the work. Respond with STRICT JSON only — no prose, no ' +
  'markdown fences — of the exact form ' +
  '{"scores":[{"id":"<anchorId>","score":<0|1|2>,"rationale":"<text>"}]}. ' +
  'Include every anchor id exactly once.';

export function buildGradeUserMessage(rubric: GradingRubric, submission: GradeSubmission): string {
  const anchors = rubric.anchors.map((a) => `- ${a.id} (${a.label}): ${a.description}`).join('\n');
  return [
    'RUBRIC ANCHORS:',
    anchors,
    '',
    'THE BRIEF THE LEARNER WAS GIVEN:',
    submission.brief,
    // Each section renders as a blank line, its label (verbatim), then its text.
    // Callers control the labels, so 2.1 passes its two original headers and the
    // output stays byte-identical to the pre-P4.3b template.
    ...submission.sections.flatMap((s) => ['', `${s.label}:`, s.text]),
    '',
    'Score each anchor now as strict JSON.',
  ].join('\n');
}

type ParseResult = { ok: true; value: Verdict } | { ok: false; error: string };

export function parseVerdict(modelText: string, rubric: GradingRubric): ParseResult {
  const start = modelText.indexOf('{');
  const end = modelText.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    return { ok: false, error: 'Grader did not return JSON.' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(modelText.slice(start, end + 1));
  } catch {
    return { ok: false, error: 'Grader returned malformed JSON.' };
  }
  const scores = (parsed as { scores?: unknown }).scores;
  if (!Array.isArray(scores)) {
    return { ok: false, error: 'Grader JSON is missing a scores array.' };
  }
  const byId = new Map<string, { score: number; rationale: string }>();
  for (const s of scores) {
    const id = (s as { id?: unknown }).id;
    const score = (s as { score?: unknown }).score;
    const rationale = (s as { rationale?: unknown }).rationale;
    if (typeof id !== 'string') continue;
    if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > ANCHOR_MAX) {
      return { ok: false, error: `Score for "${id}" is out of range.` };
    }
    byId.set(id, { score, rationale: typeof rationale === 'string' ? rationale : '' });
  }
  const perAnchor: AnchorScore[] = [];
  for (const a of rubric.anchors) {
    const got = byId.get(a.id);
    if (!got) return { ok: false, error: `Grader omitted anchor "${a.id}".` };
    perAnchor.push({ id: a.id, label: a.label, score: got.score, max: ANCHOR_MAX, rationale: got.rationale });
  }
  const overall = perAnchor.reduce((sum, p) => sum + p.score, 0);
  return { ok: true, value: { perAnchor, overall, maxOverall: rubric.anchors.length * ANCHOR_MAX } };
}

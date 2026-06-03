
export type ModuleType = 'content' | 'lab' | 'simulator' | 'use-case' | 'quiz' | 'glossary' | 'sorter';

// --- Nava AI Literacy Matrix metadata (P3.1) ---
// These describe where a module sits in the matrix and how mastery is evidenced.
// Read later by content-as-data, the GLAT bank, the admin dashboard, and the
// procurement cross-walk.

/** The 4D framework dimensions a cell exercises. */
export type Dimension = 'Delegation' | 'Description' | 'Discernment' | 'Diligence';

/** The matrix's "primary evidence" type for a cell. */
export type EvidenceType =
  | 'quiz'
  | 'performance-task'
  | 'work-sample'
  | 'portfolio'
  | 'reflection'
  | 'observation';

/** How trustworthy learner self-report is for a cell ('na' = not self-reported). */
export type SelfReportValidity = 'low' | 'medium' | 'high' | 'na';

/** Matrix stage a cell belongs to. */
export type Stage = '1a' | '1b' | '2';

export interface Module {
  id: string;
  title: string;
  type: ModuleType;
  content: string;
  phaseId: string;
  videoUrl?: string; // Placeholder for future video walkthroughs
  resources?: { title: string; url: string }[];
  // --- Matrix metadata (P3.1) ---
  cellId: string; // matrix cell id (== id for matrix cells, e.g. '1.4')
  stage: Stage;
  dimension: Dimension[]; // 4D tag(s)
  evidenceType: EvidenceType; // matrix "primary evidence"
  selfReportValidity: SelfReportValidity;
  masteryAnchor?: string; // authored later with content (P3.3/P3.4/P4.11) — leave unset
  emergentAnchor?: string; // ditto
  quiz?: QuizQuestion[]; // scored questions, read from the DB quiz_json column (P3.2.3a)
  labConfig?: LabConfig; // interactive-lab config, read from the DB lab_config_json column (P3.2.3b)
  sorterConfig?: SorterConfig; // scenario-sorter config, from the DB sorter_config_json column (P3.5)
}

export interface Phase {
  id: string;
  title: string;
  description: string;
  week: string;
  modules: Module[];
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

/**
 * Config for an interactive lab/exercise, read from the module's
 * lab_config_json column (content-as-data, P3.2.3b). `kind` is the discriminator
 * so each exercise type carries its own config shape. New kinds are added as
 * additional members of the LabConfig union (P3.5/P3.6) — keep them additive so
 * the ModuleRenderer switch and parallel PRs merge cleanly.
 */
/** Anchor rubric used by the grading engine (P4.2). Carried on a lab's config. */
export interface GradingRubric {
  anchors: { id: string; label: string; description: string }[];
}

export interface PromptConstructionConfig {
  kind: 'prompt-construction';
  title?: string; // lab header; generic fallback if absent (P4.1)
  subtitle?: string; // lab subhead; generic fallback if absent (P4.1)
  /** The realistic task + target-output constraints shown in the brief. */
  brief: { task: string; constraints: string[] };
  /** Collapsible scaffolding tips — the parts of a strong prompt. */
  scaffoldHints: { label: string; hint: string }[];
  rubric?: GradingRubric; // LLM-as-judge anchors (P4.2); optional
}

/** Scenario-sorter categories: how AI should (or shouldn't) be involved in a task. */
export type SorterCategory = 'delegate' | 'assist' | 'human-only' | 'refuse';

export interface SorterScenario {
  id: string;
  text: string;
  correct: SorterCategory;
  rationale: string;
}

export interface SorterConfig {
  kind: 'scenario-sort';
  intro?: string;
  scenarios: SorterScenario[];
}

/** A selectable approved-tool option, shared by the classifier/triage exercises. */
export interface ExerciseTool {
  id: string;
  label: string;
}

/**
 * 1.4 data-classifier (P3.6): for each item the learner picks a data class AND
 * the right tool; both are auto-graded against the item's answer.
 */
export interface DataClassifierConfig {
  kind: 'data-classifier';
  tools: ExerciseTool[];
  classes: string[];
  items: { text: string; dataClass: string; tool: string; why: string }[];
}

/**
 * 1.5 tool-triage (P3.6): for each case the learner picks the best tool, graded
 * against the case's answer.
 */
export interface ToolTriageConfig {
  kind: 'tool-triage';
  tools: ExerciseTool[];
  cases: { text: string; tool: string; why: string }[];
}

/** A single multiple-choice question used inside the failure-spotter exercise. */
export interface FailureSpotterQuestion {
  prompt: string;
  options: string[];
  correctIndex: number;
  why: string;
}

/**
 * 1.7 failure-spotter (P3.7): for each item the learner reads a flawed AI
 * artifact (rendered as markdown) and answers two graded MCs — what's wrong
 * (issue) and what to do about it (mitigation).
 */
export interface FailureSpotterConfig {
  kind: 'failure-spotter';
  items: {
    id: string;
    artifactMd: string;
    issue: FailureSpotterQuestion;
    mitigation: FailureSpotterQuestion;
  }[];
}

/**
 * 1.9 disclosure-builder / 1.10 regulatory-check (P3.8): both are single-select
 * scenario exercises that share ONE component (ScenarioExercise). For each item
 * the learner reads a prompt, picks one of four options, and is graded against
 * `correctIndex`. After grading, the component compiles the CORRECT option text
 * of every item into a keepable `takeaway` panel — a cheat-sheet (1.9) or model
 * client response (1.10) the learner walks away with. The two `kind`s differ
 * only in their seeded content, not their shape.
 */
export interface ScenarioExerciseConfig {
  kind: 'disclosure-builder' | 'regulatory-check';
  items: {
    prompt: string;
    options: string[]; // exactly 4
    correctIndex: number;
    why: string;
  }[];
  takeaway: { title: string; intro: string };
}

/**
 * 1.8 / 1.11 reflection (P3.10): an UNGRADED written reflection (no right
 * answer). The learner reads a prompt + guidance and writes a free-text
 * response; `minWords` is a soft target shown in a live word counter. On submit
 * the text is stored as a lab_submissions row tagged `kind:'reflection'` for a
 * Champion to review later — there is no grading and no completion gate (the
 * inline quiz remains the gate). This differs from the graded exercise kinds
 * above only in shape and intent.
 */
export interface ReflectionConfig {
  kind: 'reflection';
  prompt: string;
  guidance: string;
  minWords: number;
}

/**
 * 1.12 harm-rubric (P3.9): classify each civic-tech scenario into one of the
 * four harm patterns. `correct` is a pattern id; `patterns` are shown as the
 * rubric reference and as the MC options.
 */
export interface HarmRubricConfig {
  kind: 'harm-rubric';
  patterns: { id: string; label: string; desc: string }[];
  scenarios: { id: string; text: string; correct: string; why: string }[];
}

/**
 * 1.13 sign-off (P3.9): ungraded. The learner picks the role that best fits how
 * they're involved with AI, then checks every commitment to sign off. Records
 * the role + acknowledged commitment ids; no right/wrong.
 */
export interface SignoffConfig {
  kind: 'signoff-checklist';
  intro?: string;
  roles: { id: string; label: string; desc: string }[];
  commitments: { id: string; text: string }[];
}

/**
 * 2.2 / 2.3 critique (P4.3b): the learner reads a polished, realistic
 * AI-generated artifact and writes a structured critique/validation of it. The
 * critique is graded by the P4.2 LLM-judge against `rubric` and the anchor-scored
 * result renders in place. Like the other Stage-1b/2 exercises this is graded
 * PRACTICE that records a lab_submissions row (`transcript.kind:'critique'`) — it
 * does NOT gate completion (the inline quiz does), so the component takes no
 * onComplete prop.
 */
export interface CritiqueConfig {
  kind: 'critique';
  title?: string; // exercise header; generic fallback if absent
  subtitle?: string;
  /** What the learner must do. */
  brief: { instruction: string };
  /** The polished AI output under review, rendered as markdown. */
  artifact: { label: string; bodyMd: string };
  /** P4.2 anchors: what a good critique catches. */
  rubric: GradingRubric;
}

/** A learner's per-claim verdict in the output-audit exercise; also the answer-key value. */
export type AuditStatus = 'supported' | 'fabricated';

/**
 * 1.2 output-audit (P4.3a): a "spot the confabulation" exercise. The learner
 * reads a polished, realistic AI-generated artifact (rendered as markdown) and
 * audits it claim-by-claim, marking each as `supported` (verifiable / correctly
 * stated) or `fabricated` (confabulated / unverifiable — don't trust). It is
 * AUTO-GRADED against the answer key (no LLM call) — the deterministic sibling
 * of 2.2/2.3's `critique`. Like the other Stage-1b/2 exercises this is graded
 * PRACTICE that records a lab_submissions row (`transcript.kind:'output-audit'`)
 * — it does NOT gate completion (the inline quiz does), so the component takes
 * no onComplete prop.
 */
export interface OutputAuditConfig {
  kind: 'output-audit';
  intro?: string;
  /** The polished AI artifact under audit, rendered as markdown. */
  artifact: { label: string; bodyMd: string };
  claims: {
    id: string;
    text: string; // a discrete, checkable claim drawn from the artifact
    status: AuditStatus; // the answer key ('fabricated' = confabulated/unverifiable)
    why: string; // shown after grading
  }[];
}

/**
 * 2.8 calibration (P4.3c): a confidence-calibration exercise. The learner sees
 * several outputs from the SAME AI tool across different task types/stakes and,
 * for each, picks the right VERIFICATION POSTURE on an ordered `scale`. It is
 * AUTO-GRADED against the answer key (no LLM call) — the deterministic sibling
 * of 1.2's `output-audit` — and reports an OVER-/UNDER-reliance summary (where
 * the learner trusted high-risk output too readily vs. over-verified safe
 * output). Like the other Stage-1b/2 exercises this is graded PRACTICE that
 * records a lab_submissions row (`transcript.kind:'calibration'`) — it does NOT
 * gate completion (the inline quiz does), so the component takes no onComplete
 * prop. (Distinct from the P3.5 scenario-sorter, which decides WHETHER to
 * involve AI; this decides HOW MUCH to trust an output already received.)
 */
export interface CalibrationConfig {
  kind: 'calibration';
  intro?: string;
  /**
   * Verification postures, ORDERED from most-trusting (index 0) to
   * least-trusting (last). The order is load-bearing: it defines the over/under
   * axis — picking a lower index than the target is over-reliance (too
   * trusting), a higher index is under-reliance (too skeptical).
   */
  scale: { id: string; label: string; description?: string }[];
  items: {
    id: string;
    task: string; // what the SAME tool was asked to do
    output?: string; // optional: the output, or a short description of it
    target: string; // answer-key scale id = the calibrated posture
    why: string; // shown after grading
  }[];
}

export type LabConfig =
  | PromptConstructionConfig
  | DataClassifierConfig
  | ToolTriageConfig
  | FailureSpotterConfig
  | ScenarioExerciseConfig
  | ReflectionConfig
  | HarmRubricConfig
  | SignoffConfig
  | CritiqueConfig
  | OutputAuditConfig
  | CalibrationConfig;

export interface UserProgress {
  completedModuleIds: string[];
  currentModuleId: string;
}

export type AIPersona = 'analyst' | 'empathy' | 'technical' | 'default';

export interface PersonaConfig {
  id: AIPersona;
  label: string;
  description: string;
  promptPrefix: string;
}

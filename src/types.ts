
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
 * 1.9 disclosure-builder / 1.10 regulatory-check (P3.8) / 2.5 context-diagnostic
 * (P4.5a): single-select scenario exercises that share ONE component
 * (ScenarioExercise). For each item the learner reads a prompt, picks one of four
 * options, and is graded against `correctIndex`. After grading, the component
 * compiles the CORRECT option text of every item into a keepable `takeaway`
 * panel — a disclosure cheat-sheet (1.9), a model client response (1.10), or a
 * "working with the context window" quick reference (2.5) the learner walks away
 * with. The `kind`s differ only in their seeded content + intro copy, not shape.
 */
export interface ScenarioExerciseConfig {
  kind: 'disclosure-builder' | 'regulatory-check' | 'context-diagnostic';
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

/**
 * 2.7 synthesis (P4.4a): the learner reads a set of source excerpts (synthetic
 * user-interview notes) in which most participants agree but one or two dissent,
 * and writes a synthesis that PRESERVES the minority view instead of flattening
 * it into a tidy false consensus. Graded by the P4.2 LLM-judge against `rubric`;
 * the anchor-scored result renders in place. Structurally the critique's sibling
 * (brief + one sourced markdown block + free-text + judge → GradeResultCard) and
 * built on the same shared component. Graded PRACTICE that records a
 * lab_submissions row (`transcript.kind:'synthesis'`) — it does NOT gate
 * completion (the inline quiz does), so the component takes no onComplete prop.
 */
export interface SynthesisConfig {
  kind: 'synthesis';
  title?: string; // exercise header; generic fallback if absent
  subtitle?: string;
  /** What the learner must do. */
  brief: { instruction: string };
  /** The excerpts to synthesize (e.g. interview notes), rendered as markdown. */
  sources: { label: string; bodyMd: string };
  /** P4.2 anchors: what a good synthesis preserves. */
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

/**
 * 2.6 voice-edit (P4.4b): the learner reads a dense source + a writing brief,
 * generates an AI FIRST DRAFT live (streamChat), then revises it "AI off" in
 * their own voice — restoring specifics the draft dropped/generalized and fixing
 * reading level + tone. The revision is graded by the P4.2 LLM-judge against
 * `rubric` (sections: Source + AI first draft + the revision); the anchor-scored
 * result renders in place. This teaches cell 2.6's point: writing is the
 * highest-volume AI use and the value is in what you do with the draft, since AI
 * first drafts tend to flatten specifics into a generic voice. Like the other
 * Stage-1b/2 exercises this is graded PRACTICE that records a lab_submissions row
 * (`transcript.kind:'voice-edit'`) — it does NOT gate completion (the inline quiz
 * does), so the component takes no onComplete prop.
 */
export interface VoiceEditConfig {
  kind: 'voice-edit';
  title?: string; // exercise header; generic fallback if absent
  subtitle?: string;
  /** The dense source to rewrite — contains the must-preserve specifics. */
  source: { label: string; bodyMd: string };
  /**
   * The writing task + constraints (reading level, length, tone, "preserve every
   * specific", one next step). Both seed the brief shown to the learner and the
   * `streamChat` draft prompt.
   */
  brief: { instruction: string; constraints?: string[] };
  /** P4.2 anchors: what a good revision preserves/fixes. */
  rubric: GradingRubric;
}

/**
 * 2.10 prompt-eval (P4.5b): a test-driven / constraint-first prompting exercise.
 * The learner reads a RECURRING task + the constraints to encode + a small seeded
 * test set (2 complete records + 1 edge case = a record with a missing field), then
 * writes ONE reusable, constraint-first prompt and RUNS it live (`streamChat`, one
 * call per case) against each test input, collecting the outputs. On submit the
 * prompt + its per-case outputs go to the P4.2 LLM-judge ({brief, sections}) — one
 * section for the prompt plus one per case — and the anchor-scored result renders in
 * place via GradeResultCard. This teaches cell 2.10's point: constraint-first
 * prompting states the rules (length/format, must-include, must-exclude) before the
 * ask, and test-driven prompting judges each result against those rules across
 * cases, including an edge case a good prompt FLAGS rather than inventing data for.
 * Reuses the VoiceEdit (#52) streaming pattern + the #48 judge + GradeResultCard.
 * Like the other Stage-1b/2 exercises this is graded PRACTICE that records a
 * lab_submissions row (`transcript.kind:'prompt-eval'`) — it does NOT gate
 * completion (the inline quiz does), so the component takes no onComplete prop.
 */
export interface PromptEvalConfig {
  kind: 'prompt-eval';
  title?: string; // exercise header; generic fallback if absent
  subtitle?: string;
  /** The recurring task + the constraints to encode (shown in the brief). */
  brief: { instruction: string; constraints?: string[] };
  /**
   * The seeded test set: 2 normal records + 1 edge case. `isEdge` marks the edge
   * case (a record with a missing field) so the UI + the learner can see which
   * input genuinely stresses the prompt; `note` is an optional per-case hint.
   */
  testCases: { id: string; label: string; input: string; note?: string; isEdge?: boolean }[];
  /** P4.2 anchors: what a good reusable, constraint-first prompt does (judge-scored 0/1/2). */
  rubric: GradingRubric;
}

/**
 * 2.4 iteration (P4.5c): a multi-turn refinement exercise. The learner conducts a
 * real back-and-forth conversation with Claude toward a constrained goal — each turn
 * sends the GROWING messages[] array to `streamChat`, accumulating
 * [user, assistant, user, assistant, …]. Once they've taken at least `minTurns`
 * turns, they submit the whole conversation and the P4.2 LLM-judge ({brief,
 * sections}) scores the QUALITY OF THE LEARNER'S ITERATION — their steering turns
 * (specificity, building across turns, stress-testing/catching a weakness, knowing
 * when it's done) — NOT the non-deterministic final output. This teaches cell 2.4's
 * point: iteration is treating an AI conversation as a loop, not a vending machine,
 * and it's the behavioral marker present in ~86% of effective conversations. Reuses
 * streamChat (which already takes a messages[] array) + the VoiceEdit/PromptEval
 * streaming pattern + the #48 judge + GradeResultCard. Like the other Stage-1b/2
 * exercises this is graded PRACTICE that records a lab_submissions row
 * (`transcript.kind:'iteration'`) — it does NOT gate completion (the inline quiz
 * does), so the component takes no onComplete prop.
 */
export interface IterationConfig {
  kind: 'iteration';
  title?: string; // exercise header; generic fallback if absent
  subtitle?: string;
  /** The goal + the constraints the first output tends to miss (so iteration is needed). */
  brief: { instruction: string; constraints?: string[] };
  /** Optional seeded first-prompt hint shown above the input. */
  starter?: string;
  /** Minimum learner turns before Submit is enabled (e.g. 3). */
  minTurns: number;
  /** P4.2 anchors — written about the learner's ITERATION (judge-scored 0/1/2). */
  rubric: GradingRubric;
}

/**
 * 2.15 paired AI-on/AI-off calibration (P4.6): the learner does two comparable
 * tasks in-app — one without AI, one with Claude — each app-timed. `offTask` is
 * done WITHOUT AI; `onTask` (comparable, not identical) is done WITH Claude.
 */
export interface PairedCalibrationConfig {
  kind: 'paired-calibration';
  intro?: string;
  offTask: { label: string; brief: string };
  onTask: { label: string; brief: string };
}

/**
 * 2.13 dashboard-critique (P4.7): the learner reads one realistic, speed-only
 * productivity dashboard and a checklist of candidate dimensions, then marks
 * which signals the dashboard HIDES. It is AUTO-GRADED against the answer key
 * (no LLM call) — the deterministic sibling of 1.2's `output-audit` and 2.8's
 * `calibration`. A `signal` with `hidden:true` is a quality/rework dimension the
 * dashboard omits (the learner SHOULD flag it as missing); `hidden:false` is a
 * decoy already visible on the dashboard (the learner should NOT flag it).
 * Reports correctly-named / missed / false-flag buckets. Like the other
 * Stage-1b/2 exercises this is graded PRACTICE that records a lab_submissions
 * row (`transcript.kind:'dashboard-critique'`) — it does NOT gate completion
 * (the inline quiz does), so the component takes no onComplete prop. (Distinct
 * from the free-text `critique` exercise for cells 2.2/2.3, which is LLM-judged.)
 */
export interface DashboardCritiqueConfig {
  kind: 'dashboard-critique';
  intro?: string;
  /** The speed-only productivity dashboard under review. */
  dashboard: {
    title: string;
    /** Visible metric cards, e.g. { label: 'Drafts/day', value: '12', trend: '▲30%' }. */
    metrics: { label: string; value: string; trend?: string }[];
  };
  /**
   * Candidate dimensions shown as a checklist. `hidden:true` = a quality/rework
   * signal the dashboard OMITS (answer key — learner SHOULD flag as missing).
   * `hidden:false` = a decoy already visible on the dashboard (should NOT flag).
   */
  signals: { id: string; label: string; hidden: boolean; why: string }[];
}

/**
 * P4.8 / cell 2.11 — a personal AI use-case library + a 4D Diligence Statement.
 * Like the other Stage-2 exercises this is PRACTICE that records a lab_submissions
 * row (`transcript.kind:'use-case-portfolio'`) and does NOT gate completion (the
 * inline quiz does), so the component takes no onComplete prop. It is an exit
 * artifact captured (not LLM-graded) with a completeness gate — the learner logs
 * where AI helps / doesn't, then writes one high-stakes Diligence Statement across
 * Anthropic's 4D AI Fluency (Delegation, Description, Discernment, Diligence).
 */
export interface UseCasePortfolioConfig {
  kind: 'use-case-portfolio';
  intro?: string;
  /** The use-case library builder section. */
  library: {
    title: string;
    helper: string;
    /** Minimum complete entries to submit; ≥1 must be a "Doesn't help" entry. */
    minEntries: number;
    taskPlaceholder: string;
    approachPlaceholder: string;
    watchPlaceholder: string;
  };
  /** The 4D Diligence Statement section. */
  diligence: {
    title: string;
    helper: string;
    /** One labelled prompt per 4D dimension, in order (Delegation … Diligence). */
    dimensions: { id: string; label: string; prompt: string }[];
    /** Combined soft target (shown) and hard floor (gates submit) across the 4 fields. */
    targetWords: number;
    minWords: number;
  };
}

/**
 * P4.9 / cell 2.9 — a personal failure-mode log. Like the other Stage-2 portfolio
 * exercises this is PRACTICE that records a lab_submissions row
 * (`transcript.kind:'failure-log'`) and does NOT gate completion (the inline quiz
 * does), so the component takes no onComplete prop. Captured (not LLM-graded): the
 * learner logs dated entries — the task, what went wrong, how they caught it, and
 * the tell to watch next time — behind a completeness gate. `targetEntries` (the
 * "≥6 over time" goal) is shown; `minEntries` is the hard floor to record.
 */
export interface FailureLogConfig {
  kind: 'failure-log';
  intro?: string;
  title: string;
  helper: string;
  /** Hard floor of complete entries to record (e.g. 3). */
  minEntries: number;
  /** Soft portfolio goal shown in the counter (e.g. 6, the "≥6 over time" target). */
  targetEntries: number;
  taskPlaceholder: string;
  errorPlaceholder: string;
  caughtPlaceholder: string;
  tellPlaceholder: string;
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
  | SynthesisConfig
  | OutputAuditConfig
  | CalibrationConfig
  | VoiceEditConfig
  | PromptEvalConfig
  | IterationConfig
  | PairedCalibrationConfig
  | DashboardCritiqueConfig
  | UseCasePortfolioConfig
  | FailureLogConfig;

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

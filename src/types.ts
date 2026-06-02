
export type ModuleType = 'content' | 'lab' | 'simulator' | 'use-case' | 'quiz' | 'glossary';

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
export interface PromptConstructionConfig {
  kind: 'prompt-construction';
  /** The realistic task + target-output constraints shown in the brief. */
  brief: { task: string; constraints: string[] };
  /** Collapsible scaffolding tips — the parts of a strong prompt. */
  scaffoldHints: { label: string; hint: string }[];
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

export type LabConfig =
  | PromptConstructionConfig
  | DataClassifierConfig
  | ToolTriageConfig
  | FailureSpotterConfig;

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


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

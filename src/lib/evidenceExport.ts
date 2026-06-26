// P5.6a — Per-learner, per-module evidence rows for compliance export.
// Produces EvidenceRow[] ready for CSV (P5.6b) or PDF (P5.6c) consumers.
// No new migration or RLS: rides on P5.1c champion/admin SELECT + P5.2a view.

import type { AnchorScore } from './grading';

// ---------------------------------------------------------------------------
// Compliance crosswalk types
// ---------------------------------------------------------------------------

export interface ComplianceClaims {
  /** DOL AI workforce competency references. */
  dol: string[];
  /** EU AI Act Article 4 AI-literacy dimension references. */
  euAiAct: string[];
  /** OMB Memorandum M-25-21 section references. */
  m2521: string[];
}

// ---------------------------------------------------------------------------
// Evidence row — one row per (learner × published module)
// ---------------------------------------------------------------------------

export interface EvidenceRow {
  // Learner identity
  learnerId: string;
  learnerName: string;
  learnerEmail: string | null;
  cohortId: string | null;
  cohortName: string | null;

  // Matrix cell metadata
  cellId: string;
  cellTitle: string;
  stage: string | null;       // '1a' | '1b' | '2' | null (custom lessons)
  dimensions: string[];        // e.g. ['Delegation', 'Discernment']
  evidenceType: string;        // 'quiz' | 'performance-task' | 'work-sample' | ...

  // Completion
  completed: boolean;
  completedAt: string | null;  // module_progress.completed_at (ISO)

  // Quiz (null fields when learner never attempted)
  quizScore: number | null;       // best attempt: score/max_score as 0..1 fraction
  quizPassed: boolean | null;
  quizAttemptCount: number;
  lastQuizAttemptedAt: string | null; // quiz_attempts.attempted_at (best attempt row)

  // Lab submission (null fields when no submission)
  labStatus: string | null;        // 'reviewable' | 'reviewed' | 'returned'
  labSubmittedAt: string | null;   // lab_submissions.created_at (ISO)
  labReviewedAt: string | null;    // lab_submissions.reviewed_at (ISO)
  labReviewerEmail: string | null; // email of the champion/admin who reviewed
  labOverallScore: number | null;  // rubric_scores.overall / rubric_scores.maxOverall (0..1)
  labAnchorScores: AnchorScore[] | null; // rubric_scores.perAnchor

  // Compliance crosswalk
  dolClaims: string[];
  euAiActClaims: string[];
  m2521Claims: string[];
}

/** Top-level export payload. */
export interface EvidenceExportData {
  rows: EvidenceRow[];
  /** ISO timestamp of when the export was generated (set by the caller, not the fetcher). */
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Matrix cell IDs — the 28 fixed cells in stage order
// ---------------------------------------------------------------------------

export const MATRIX_CELL_IDS: readonly string[] = [
  '1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.8',
  '1.9', '1.10', '1.11', '1.12', '1.13',
  '2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7', '2.8',
  '2.9', '2.10', '2.11', '2.12', '2.13', '2.14', '2.15',
] as const;

// ---------------------------------------------------------------------------
// Compliance crosswalk — per-cell claim strings.
// Each string is a short, human-readable reference identifying the specific
// framework requirement this cell's evidence satisfies.
// Note: claim strings are intentionally prose references so they render
// meaningfully in CSV/PDF without a separate legend. SME can refine these
// strings via a single-file update with no code change elsewhere.
// ---------------------------------------------------------------------------

export const CELL_CROSSWALK: Record<string, ComplianceClaims> = {
  '1.1': {
    dol: [
      'DOL: AI Literacy Foundation Competencies',
      'DOL: Understanding AI Systems and Capabilities',
    ],
    euAiAct: [
      'EU AI Act Art. 4: General AI Literacy',
    ],
    m2521: [
      'M-25-21 §4: AI Literacy — Foundation Skills',
    ],
  },
  '1.2': {
    dol: [
      'DOL: AI Literacy Foundation Competencies',
      'DOL: Identifying AI Limitations and Confabulation',
    ],
    euAiAct: [
      'EU AI Act Art. 4: General AI Literacy',
      'EU AI Act Art. 4: AI Risk and Societal Impact Awareness',
    ],
    m2521: [
      'M-25-21 §4: AI Literacy — Foundation Skills',
      'M-25-21 §4: AI Literacy — Risk Assessment',
    ],
  },
  '1.3': {
    dol: [
      'DOL: AI Literacy Foundation Competencies',
      'DOL: Human-AI Decision Boundaries and Escalation',
    ],
    euAiAct: [
      'EU AI Act Art. 4: General AI Literacy',
      'EU AI Act Art. 4: Human Oversight Capabilities',
    ],
    m2521: [
      'M-25-21 §4: AI Literacy — Foundation Skills',
      'M-25-21 §4: AI Literacy — Governance Awareness',
    ],
  },
  '1.4': {
    dol: [
      'DOL: AI Literacy Foundation Competencies',
      'DOL: AI Tool Selection and Data Handling Practices',
    ],
    euAiAct: [
      'EU AI Act Art. 4: General AI Literacy',
      'EU AI Act Art. 4: Technical Knowledge of AI Systems',
      'EU AI Act Art. 4: AI Risk and Societal Impact Awareness',
    ],
    m2521: [
      'M-25-21 §4: AI Literacy — Foundation Skills',
      'M-25-21 §4: AI Literacy — Risk Assessment',
    ],
  },
  '1.5': {
    dol: [
      'DOL: AI Literacy Foundation Competencies',
      'DOL: AI Tool Selection and Data Handling Practices',
    ],
    euAiAct: [
      'EU AI Act Art. 4: General AI Literacy',
      'EU AI Act Art. 4: Technical Knowledge of AI Systems',
    ],
    m2521: [
      'M-25-21 §4: AI Literacy — Foundation Skills',
    ],
  },
  '1.6': {
    dol: [
      'DOL: AI Literacy Foundation Competencies',
    ],
    euAiAct: [
      'EU AI Act Art. 4: General AI Literacy',
    ],
    m2521: [
      'M-25-21 §4: AI Literacy — Foundation Skills',
    ],
  },
  '1.7': {
    dol: [
      'DOL: AI Literacy Foundation Competencies',
      'DOL: Algorithmic Bias and Equity Assessment',
    ],
    euAiAct: [
      'EU AI Act Art. 4: General AI Literacy',
      'EU AI Act Art. 4: Fundamental Rights and Non-Discrimination',
      'EU AI Act Art. 4: AI Risk and Societal Impact Awareness',
    ],
    m2521: [
      'M-25-21 §4: AI Literacy — Foundation Skills',
      'M-25-21 §4: AI Literacy — Risk Assessment',
    ],
  },
  '1.8': {
    dol: [
      'DOL: AI Literacy Foundation Competencies',
      'DOL: AI Professional Self-Assessment',
    ],
    euAiAct: [
      'EU AI Act Art. 4: General AI Literacy',
    ],
    m2521: [
      'M-25-21 §4: AI Literacy — Foundation Skills',
    ],
  },
  '1.9': {
    dol: [
      'DOL: AI Literacy Foundation Competencies',
      'DOL: AI Regulatory Compliance Awareness',
    ],
    euAiAct: [
      'EU AI Act Art. 4: General AI Literacy',
      'EU AI Act Art. 4: Transparency and Disclosure',
      'EU AI Act Art. 4: AI Risk and Societal Impact Awareness',
    ],
    m2521: [
      'M-25-21 §4: AI Literacy — Foundation Skills',
      'M-25-21 §4: AI Literacy — Governance Awareness',
      'M-25-21 §4: AI Literacy — Regulatory Compliance',
    ],
  },
  '1.10': {
    dol: [
      'DOL: AI Literacy Foundation Competencies',
      'DOL: AI Regulatory Compliance Awareness',
    ],
    euAiAct: [
      'EU AI Act Art. 4: General AI Literacy',
      'EU AI Act Art. 4: AI Risk and Societal Impact Awareness',
      'EU AI Act Art. 4: Fundamental Rights and Non-Discrimination',
    ],
    m2521: [
      'M-25-21 §4: AI Literacy — Foundation Skills',
      'M-25-21 §4: AI Literacy — Regulatory Compliance',
    ],
  },
  '1.11': {
    dol: [
      'DOL: AI Literacy Foundation Competencies',
      'DOL: AI Professional Self-Assessment',
    ],
    euAiAct: [
      'EU AI Act Art. 4: General AI Literacy',
    ],
    m2521: [
      'M-25-21 §4: AI Literacy — Foundation Skills',
    ],
  },
  '1.12': {
    dol: [
      'DOL: AI Literacy Foundation Competencies',
      'DOL: AI Risk Assessment and Harm Identification',
    ],
    euAiAct: [
      'EU AI Act Art. 4: General AI Literacy',
      'EU AI Act Art. 4: AI Risk and Societal Impact Awareness',
      'EU AI Act Art. 4: Fundamental Rights and Non-Discrimination',
    ],
    m2521: [
      'M-25-21 §4: AI Literacy — Foundation Skills',
      'M-25-21 §4: AI Literacy — Risk Assessment',
    ],
  },
  '1.13': {
    dol: [
      'DOL: AI Literacy Foundation Competencies',
      'DOL: AI Professional Accountability and Sign-Off',
    ],
    euAiAct: [
      'EU AI Act Art. 4: General AI Literacy',
      'EU AI Act Art. 4: Human Oversight Capabilities',
    ],
    m2521: [
      'M-25-21 §4: AI Literacy — Foundation Skills',
      'M-25-21 §4: AI Literacy — Governance Awareness',
    ],
  },
  '2.1': {
    dol: [
      'DOL: AI Applied Competencies',
      'DOL: AI Prompt Engineering and Task Specification',
    ],
    euAiAct: [
      'EU AI Act Art. 4: Technical Knowledge of AI Systems',
      'EU AI Act Art. 4: General AI Literacy',
    ],
    m2521: [
      'M-25-21 §4: AI Literacy — Applied Skills',
    ],
  },
  '2.2': {
    dol: [
      'DOL: AI Applied Competencies',
      'DOL: AI Output Quality Review and Critical Evaluation',
    ],
    euAiAct: [
      'EU AI Act Art. 4: Technical Knowledge of AI Systems',
      'EU AI Act Art. 4: Human Oversight Capabilities',
    ],
    m2521: [
      'M-25-21 §4: AI Literacy — Applied Skills',
    ],
  },
  '2.3': {
    dol: [
      'DOL: AI Applied Competencies',
      'DOL: AI Output Quality Review and Critical Evaluation',
    ],
    euAiAct: [
      'EU AI Act Art. 4: Technical Knowledge of AI Systems',
      'EU AI Act Art. 4: Human Oversight Capabilities',
    ],
    m2521: [
      'M-25-21 §4: AI Literacy — Applied Skills',
    ],
  },
  '2.4': {
    dol: [
      'DOL: AI Applied Competencies',
      'DOL: AI Prompt Iteration and Refinement',
    ],
    euAiAct: [
      'EU AI Act Art. 4: Technical Knowledge of AI Systems',
      'EU AI Act Art. 4: General AI Literacy',
    ],
    m2521: [
      'M-25-21 §4: AI Literacy — Applied Skills',
    ],
  },
  '2.5': {
    dol: [
      'DOL: AI Applied Competencies',
      'DOL: AI Context Management and Diagnostic Skills',
    ],
    euAiAct: [
      'EU AI Act Art. 4: Technical Knowledge of AI Systems',
      'EU AI Act Art. 4: General AI Literacy',
    ],
    m2521: [
      'M-25-21 §4: AI Literacy — Applied Skills',
    ],
  },
  '2.6': {
    dol: [
      'DOL: AI Applied Competencies',
      'DOL: AI-Assisted Writing and Voice Preservation',
    ],
    euAiAct: [
      'EU AI Act Art. 4: Technical Knowledge of AI Systems',
      'EU AI Act Art. 4: Human Oversight Capabilities',
    ],
    m2521: [
      'M-25-21 §4: AI Literacy — Applied Skills',
    ],
  },
  '2.7': {
    dol: [
      'DOL: AI Applied Competencies',
      'DOL: AI-Assisted Synthesis and Minority-Voice Representation',
    ],
    euAiAct: [
      'EU AI Act Art. 4: Technical Knowledge of AI Systems',
      'EU AI Act Art. 4: Human Oversight Capabilities',
    ],
    m2521: [
      'M-25-21 §4: AI Literacy — Applied Skills',
    ],
  },
  '2.8': {
    dol: [
      'DOL: AI Applied Competencies',
      'DOL: AI Output Verification and Confidence Calibration',
    ],
    euAiAct: [
      'EU AI Act Art. 4: Technical Knowledge of AI Systems',
      'EU AI Act Art. 4: AI Risk and Societal Impact Awareness',
      'EU AI Act Art. 4: Human Oversight Capabilities',
    ],
    m2521: [
      'M-25-21 §4: AI Literacy — Applied Skills',
      'M-25-21 §4: AI Literacy — Risk Assessment',
    ],
  },
  '2.9': {
    dol: [
      'DOL: AI Applied Competencies',
      'DOL: AI Failure Mode Identification and Professional Accountability',
    ],
    euAiAct: [
      'EU AI Act Art. 4: Technical Knowledge of AI Systems',
      'EU AI Act Art. 4: AI Risk and Societal Impact Awareness',
    ],
    m2521: [
      'M-25-21 §4: AI Literacy — Applied Skills',
      'M-25-21 §4: AI Literacy — Risk Assessment',
    ],
  },
  '2.10': {
    dol: [
      'DOL: AI Applied Competencies',
      'DOL: Reusable AI Prompt Design and Evaluation',
    ],
    euAiAct: [
      'EU AI Act Art. 4: Technical Knowledge of AI Systems',
      'EU AI Act Art. 4: General AI Literacy',
    ],
    m2521: [
      'M-25-21 §4: AI Literacy — Applied Skills',
    ],
  },
  '2.11': {
    dol: [
      'DOL: AI Applied Competencies',
      'DOL: AI Workforce Integration Portfolio',
      'DOL: AI Use-Case Assessment and 4D Diligence',
    ],
    euAiAct: [
      'EU AI Act Art. 4: Technical Knowledge of AI Systems',
      'EU AI Act Art. 4: General AI Literacy',
      'EU AI Act Art. 4: Human Oversight Capabilities',
    ],
    m2521: [
      'M-25-21 §4: AI Literacy — Applied Skills',
      'M-25-21 §4: AI Literacy — Governance Awareness',
    ],
  },
  '2.12': {
    dol: [
      'DOL: AI Applied Competencies',
      'DOL: AI Tool and Model Selection Skills',
    ],
    euAiAct: [
      'EU AI Act Art. 4: Technical Knowledge of AI Systems',
      'EU AI Act Art. 4: General AI Literacy',
    ],
    m2521: [
      'M-25-21 §4: AI Literacy — Applied Skills',
    ],
  },
  '2.13': {
    dol: [
      'DOL: AI Applied Competencies',
      'DOL: AI Output Quality Review and Critical Evaluation',
      'DOL: AI Productivity and Rework Signal Identification',
    ],
    euAiAct: [
      'EU AI Act Art. 4: Technical Knowledge of AI Systems',
      'EU AI Act Art. 4: AI Risk and Societal Impact Awareness',
      'EU AI Act Art. 4: Human Oversight Capabilities',
    ],
    m2521: [
      'M-25-21 §4: AI Literacy — Applied Skills',
      'M-25-21 §4: AI Literacy — Governance Awareness',
    ],
  },
  '2.14': {
    dol: [
      'DOL: AI Applied Competencies',
      'DOL: Comprehensive AI Literacy Assessment — Foundation and Applied',
    ],
    euAiAct: [
      'EU AI Act Art. 4: Comprehensive AI Literacy',
    ],
    m2521: [
      'M-25-21 §4: AI Literacy — Comprehensive Assessment',
    ],
  },
  '2.15': {
    dol: [
      'DOL: AI Applied Competencies',
      'DOL: AI Productivity Calibration and Time/Quality Analysis',
    ],
    euAiAct: [
      'EU AI Act Art. 4: Technical Knowledge of AI Systems',
      'EU AI Act Art. 4: Human Oversight Capabilities',
    ],
    m2521: [
      'M-25-21 §4: AI Literacy — Applied Skills',
      'M-25-21 §4: AI Literacy — Risk Assessment',
    ],
  },
};

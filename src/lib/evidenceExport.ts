// P5.6a — Per-learner, per-module evidence rows for compliance export.
// Produces EvidenceRow[] ready for CSV (P5.6b) or PDF (P5.6c) consumers.
// No new migration or RLS: rides on P5.1c champion/admin SELECT + P5.2a view.

import type { AnchorScore } from './grading';
import { getSupabaseClient } from './supabaseClient';

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

// ---------------------------------------------------------------------------
// Raw PostgREST row shapes (mirrors the DB column names).
// `numeric` columns come back as strings from PostgREST.
// ---------------------------------------------------------------------------

/** One row from `learner_progress_summary`. */
export interface EvidenceLearnerRow {
  user_id: string;
  cohort_id: string | null;
  completion_pct: number | string | null;
  avg_quiz_pct: number | string | null;
  glat_passed: boolean;
  reviewable_labs: number;
}

/** One row from `modules` (published, with matrix metadata). */
export interface EvidenceModuleRow {
  cell_id: string;
  title: string;
  stage: string | null;
  dimension: string[];
  evidence_type: string;
}

/** One row from `module_progress` (scoped to visible learners). */
export interface EvidenceProgressRow {
  user_id: string;
  module_id: string;
  status: string;
  completed_at: string | null;
}

/** One row from `quiz_attempts` (scoped to visible learners). */
export interface EvidenceQuizRow {
  user_id: string;
  module_id: string;
  score: number | null;
  max_score: number | null;
  passed: boolean | null;
  attempted_at: string;
}

/** One row from `lab_submissions` (scoped to visible learners). */
export interface EvidenceLabRow {
  id: string;
  user_id: string;
  lab_id: string;
  status: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null; // uuid of reviewer
  rubric_scores: {
    grader: string;
    perAnchor: AnchorScore[];
    overall: number;
    maxOverall: number;
  } | null;
}

/** One row from `profiles` (for learner names and reviewer names). */
export interface EvidenceProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
}

/** One row from `cohorts` (for cohort names). */
export interface EvidenceCohortRow {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function displayName(profile: EvidenceProfileRow | undefined): string {
  if (!profile) return 'Unknown';
  return profile.full_name?.trim() || profile.email || 'Unknown';
}

// ---------------------------------------------------------------------------
// Pure builder
// ---------------------------------------------------------------------------

export interface BuildEvidenceRowsInput {
  learners: EvidenceLearnerRow[];
  profiles: EvidenceProfileRow[];
  cohortNames: EvidenceCohortRow[];
  modules: EvidenceModuleRow[];
  progress: EvidenceProgressRow[];
  quizzes: EvidenceQuizRow[];
  labs: EvidenceLabRow[];
  reviewerProfiles: EvidenceProfileRow[];
}

/**
 * Pure: joins all fetched data into one EvidenceRow per (learner × module).
 * Modules are iterated in the order they appear in `modules` (sort_order from
 * the DB); learners are iterated in the order they appear in `learners`
 * (alphabetical from buildLearnerRoster).
 *
 * - Best quiz attempt: highest score/max_score fraction per learner per module.
 * - Latest lab submission: newest created_at per learner per lab_id.
 * - Crosswalk claims: from CELL_CROSSWALK by cell_id; empty arrays for custom lessons.
 */
export function buildEvidenceRows({
  learners,
  profiles,
  cohortNames,
  modules,
  progress,
  quizzes,
  labs,
  reviewerProfiles,
}: BuildEvidenceRowsInput): EvidenceRow[] {
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const cohortById = new Map(cohortNames.map((c) => [c.id, c]));
  const reviewerById = new Map(reviewerProfiles.map((p) => [p.id, p]));

  // Index progress: (userId, moduleId) → row
  const progressKey = (userId: string, moduleId: string) => `${userId}::${moduleId}`;
  const progressMap = new Map<string, EvidenceProgressRow>();
  for (const p of progress) {
    progressMap.set(progressKey(p.user_id, p.module_id), p);
  }

  // Index quizzes: (userId, moduleId) → best attempt
  interface BestQuiz {
    pct: number;
    passed: boolean | null;
    attemptedAt: string;
    count: number;
  }
  const bestQuiz = new Map<string, BestQuiz>();
  const quizCountMap = new Map<string, number>();
  for (const q of quizzes) {
    const key = progressKey(q.user_id, q.module_id);
    quizCountMap.set(key, (quizCountMap.get(key) ?? 0) + 1);
    if (q.score === null || q.max_score === null || q.max_score <= 0) continue;
    const pct = q.score / q.max_score;
    const prior = bestQuiz.get(key);
    if (!prior || pct > prior.pct) {
      bestQuiz.set(key, { pct, passed: q.passed, attemptedAt: q.attempted_at, count: 0 });
    }
  }
  // Attach counts to best-quiz entries
  for (const [key, bq] of bestQuiz) {
    bq.count = quizCountMap.get(key) ?? 1;
  }

  // Index labs: (userId, labId) → latest submission (newest created_at)
  const latestLab = new Map<string, EvidenceLabRow>();
  for (const lab of labs) {
    const key = progressKey(lab.user_id, lab.lab_id);
    const prior = latestLab.get(key);
    if (!prior || lab.created_at > prior.created_at) {
      latestLab.set(key, lab);
    }
  }

  const rows: EvidenceRow[] = [];

  for (const learner of learners) {
    const profile = profileById.get(learner.user_id);
    const cohort = learner.cohort_id ? cohortById.get(learner.cohort_id) : undefined;

    for (const mod of modules) {
      const pKey = progressKey(learner.user_id, mod.cell_id);
      const prog = progressMap.get(pKey);
      const bq = bestQuiz.get(pKey);
      const lab = latestLab.get(pKey);
      const quizCount = quizCountMap.get(pKey) ?? 0;
      const cw = CELL_CROSSWALK[mod.cell_id] ?? { dol: [], euAiAct: [], m2521: [] };

      // Lab overall score as 0..1 fraction
      let labOverallScore: number | null = null;
      if (lab?.rubric_scores) {
        const { overall, maxOverall } = lab.rubric_scores;
        labOverallScore = maxOverall > 0 ? overall / maxOverall : null;
      }

      rows.push({
        learnerId: learner.user_id,
        learnerName: displayName(profile),
        learnerEmail: profile?.email ?? null,
        cohortId: learner.cohort_id,
        cohortName: cohort?.name ?? null,

        cellId: mod.cell_id,
        cellTitle: mod.title,
        stage: mod.stage,
        dimensions: mod.dimension,
        evidenceType: mod.evidence_type,

        completed: prog?.status === 'completed',
        completedAt: prog?.completed_at ?? null,

        quizScore: bq ? bq.pct : null,
        quizPassed: bq ? bq.passed : null,
        quizAttemptCount: quizCount,
        lastQuizAttemptedAt: bq ? bq.attemptedAt : null,

        labStatus: lab?.status ?? null,
        labSubmittedAt: lab?.created_at ?? null,
        labReviewedAt: lab?.reviewed_at ?? null,
        labReviewerEmail: lab?.reviewed_by
          ? (reviewerById.get(lab.reviewed_by)?.email ?? null)
          : null,
        labOverallScore,
        labAnchorScores: lab?.rubric_scores?.perAnchor ?? null,

        dolClaims: cw.dol,
        euAiActClaims: cw.euAiAct,
        m2521Claims: cw.m2521,
      });
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Async fetcher (P5.6a)
// ---------------------------------------------------------------------------

const LEARNER_COLS =
  'user_id, cohort_id, completion_pct, avg_quiz_pct, glat_passed, reviewable_labs';

const MODULE_COLS =
  'cell_id, title, stage, dimension, evidence_type';

const PROGRESS_COLS = 'user_id, module_id, status, completed_at';

const QUIZ_COLS = 'user_id, module_id, score, max_score, passed, attempted_at';

const LAB_COLS =
  'id, user_id, lab_id, status, created_at, reviewed_at, reviewed_by, rubric_scores';

/**
 * Async: fetches all data needed for evidence export in 3 sequential rounds
 * (to honour the RLS pattern: scope visible learners first, then look up names
 * only for the IDs surfaced by the view).
 *
 * Round 1: `learner_progress_summary` — scoped by caller's role (P5.1c).
 * Round 2 (parallel): profile names, cohort names, published modules,
 *   module_progress, quiz_attempts, lab_submissions — all filtered to the
 *   user_ids from round 1.
 * Round 3: reviewer profile names — filtered to the reviewed_by uuids from
 *   the lab_submissions result.
 *
 * Returns an empty array when no learners are visible to the caller.
 */
export async function fetchCohortEvidence(): Promise<EvidenceRow[]> {
  const sb = getSupabaseClient();

  // Round 1 — scope
  const { data: learnerData, error: learnerErr } = await sb
    .from('learner_progress_summary')
    .select(LEARNER_COLS);
  if (learnerErr) throw learnerErr;

  const learners = (learnerData ?? []) as EvidenceLearnerRow[];
  if (learners.length === 0) return [];

  const userIds = learners.map((l) => l.user_id);
  const cohortIds = [...new Set(learners.map((l) => l.cohort_id).filter(Boolean))] as string[];

  // Round 2 — parallel bulk reads
  const [
    profilesRes,
    cohortNamesRes,
    modulesRes,
    progressRes,
    quizRes,
    labRes,
  ] = await Promise.all([
    sb.from('profiles').select('id, full_name, email').in('id', userIds),
    cohortIds.length > 0
      ? sb.from('cohorts').select('id, name').in('id', cohortIds)
      : Promise.resolve({ data: [], error: null }),
    sb
      .from('modules')
      .select(MODULE_COLS)
      .eq('status', 'published')
      .order('sort_order', { ascending: true }),
    sb.from('module_progress').select(PROGRESS_COLS).in('user_id', userIds),
    sb.from('quiz_attempts').select(QUIZ_COLS).in('user_id', userIds),
    sb.from('lab_submissions').select(LAB_COLS).in('user_id', userIds),
  ]);

  if (profilesRes.error) throw profilesRes.error;
  if (cohortNamesRes.error) throw cohortNamesRes.error;
  if (modulesRes.error) throw modulesRes.error;
  if (progressRes.error) throw progressRes.error;
  if (quizRes.error) throw quizRes.error;
  if (labRes.error) throw labRes.error;

  // Round 3 — reviewer names (IDs come from lab results)
  const labs = (labRes.data ?? []) as EvidenceLabRow[];
  const reviewerIds = [
    ...new Set(labs.map((l) => l.reviewed_by).filter(Boolean)),
  ] as string[];

  let reviewerProfiles: EvidenceProfileRow[] = [];
  if (reviewerIds.length > 0) {
    const { data: revData, error: revErr } = await sb
      .from('profiles')
      .select('id, full_name, email')
      .in('id', reviewerIds);
    if (revErr) throw revErr;
    reviewerProfiles = (revData ?? []) as EvidenceProfileRow[];
  }

  return buildEvidenceRows({
    learners,
    profiles: (profilesRes.data ?? []) as EvidenceProfileRow[],
    cohortNames: (cohortNamesRes.data ?? []) as EvidenceCohortRow[],
    modules: (modulesRes.data ?? []) as EvidenceModuleRow[],
    progress: (progressRes.data ?? []) as EvidenceProgressRow[],
    quizzes: (quizRes.data ?? []) as EvidenceQuizRow[],
    labs,
    reviewerProfiles,
  });
}

import { Dimension, EvidenceType, Module, Phase, SelfReportValidity, Stage } from '../types';
import contentP14 from '../content/1.4.md?raw';
import contentP21 from '../content/2.1.md?raw';

// P2.1 — Matrix-aligned curriculum shell.
// The curriculum now mirrors the Nava AI Literacy Matrix: three stages listing
// all 28 universal cells as modules so the full scope is visible in the nav.
// Every module is a STUB for now — real lessons, labs, quizzes, and stage-gating
// arrive in later tasks (P2.2 / P2.3 / P3 / P4).

interface CellSpec {
  id: string;
  title: string;
  /** Cells default to a content lesson; a few graduate to interactive types. */
  type?: Module['type'];
  // --- Nava AI Literacy Matrix metadata (P3.1) ---
  // The 4D dimension(s), primary evidence type, and self-report validity the
  // matrix assigns to this cell. The app's current MC quiz on 1.4 is a starter;
  // evidenceType reflects the matrix's *intended* primary evidence.
  dimension: Dimension[];
  evidenceType: EvidenceType;
  selfReportValidity: SelfReportValidity;
}

// Real lessons land here as cells graduate from stub to full content (P2.2+).
// A cell present in this map renders its authored lesson instead of the
// "Coming soon" placeholder.
const REAL_CONTENT: Record<string, string> = {
  '1.4': contentP14,
  '2.1': contentP21,
};

// Cells with authored content are "live"; everything else is still a stub and
// wears the "Soon" badge in the nav. Derived from REAL_CONTENT so the two never
// drift apart.
export const LIVE_MODULE_IDS = new Set(Object.keys(REAL_CONTENT));

/** Build a content module for a matrix cell — real lesson if authored, else a stub. */
function stub(phaseId: string, stage: Stage, stageName: string, cell: CellSpec): Module {
  return {
    id: cell.id,
    phaseId,
    title: cell.title,
    type: cell.type ?? 'content',
    content: REAL_CONTENT[cell.id] ?? `## ${cell.title}\n\n*Coming soon.* Part of ${stageName}.`,
    // --- Matrix metadata (P3.1) ---
    cellId: cell.id, // == id for matrix cells
    stage,
    dimension: cell.dimension,
    evidenceType: cell.evidenceType,
    selfReportValidity: cell.selfReportValidity,
    // masteryAnchor / emergentAnchor authored later with content (P3.3/P3.4/P4.11)
  };
}

const STAGE_1A: CellSpec[] = [
  { id: '1.3', title: 'Recognizing when AI is appropriate vs. when human judgment is essential', dimension: ['Delegation'], evidenceType: 'performance-task', selfReportValidity: 'medium' },
  { id: '1.4', title: 'Data classification and privacy hygiene for prompts', dimension: ['Diligence'], evidenceType: 'performance-task', selfReportValidity: 'low' },
  { id: '1.5', title: 'Approved-tool literacy', dimension: ['Delegation'], evidenceType: 'performance-task', selfReportValidity: 'medium' },
  { id: '1.6', title: 'Setup and access', dimension: ['Description'], evidenceType: 'observation', selfReportValidity: 'high' },
  { id: '1.9', title: 'Disclosure norms and practices', dimension: ['Diligence'], evidenceType: 'performance-task', selfReportValidity: 'medium' },
  { id: '1.10', title: 'Regulatory floor awareness', dimension: ['Diligence'], evidenceType: 'performance-task', selfReportValidity: 'medium' },
  { id: '1.13', title: 'Non-practitioner-involved-in-AI literacy', dimension: ['Delegation', 'Diligence'], evidenceType: 'portfolio', selfReportValidity: 'medium' },
];

const STAGE_1B: CellSpec[] = [
  { id: '1.1', title: 'Mechanical mental model of how LLMs work', dimension: ['Discernment'], evidenceType: 'quiz', selfReportValidity: 'low' },
  { id: '1.2', title: 'Hallucination as a structural feature, not a bug', dimension: ['Discernment'], evidenceType: 'quiz', selfReportValidity: 'low' },
  { id: '1.7', title: 'Recognizing AI bias, fairness, and accessibility blind spots', dimension: ['Discernment'], evidenceType: 'performance-task', selfReportValidity: 'low' },
  { id: '1.8', title: 'Energy, environmental, and sovereignty conversation', dimension: ['Diligence'], evidenceType: 'reflection', selfReportValidity: 'low' },
  { id: '1.11', title: 'Honest framing of job-shape change', dimension: ['Delegation'], evidenceType: 'reflection', selfReportValidity: 'low' },
  { id: '1.12', title: 'Civic-tech-specific AI harm patterns', dimension: ['Discernment', 'Diligence'], evidenceType: 'performance-task', selfReportValidity: 'low' },
];

const STAGE_2: CellSpec[] = [
  { id: '2.1', title: 'Prompt construction as a craft', type: 'lab', dimension: ['Description'], evidenceType: 'work-sample', selfReportValidity: 'low' },
  { id: '2.2', title: 'Output validation as a verifiable skill', dimension: ['Discernment'], evidenceType: 'work-sample', selfReportValidity: 'low' },
  { id: '2.3', title: 'Counteracting the polished-output trap', dimension: ['Discernment'], evidenceType: 'work-sample', selfReportValidity: 'low' },
  { id: '2.4', title: 'Iteration as the literate behavior', dimension: ['Description'], evidenceType: 'work-sample', selfReportValidity: 'low' },
  { id: '2.5', title: 'Working with the context window', dimension: ['Description'], evidenceType: 'performance-task', selfReportValidity: 'medium' },
  { id: '2.6', title: 'AI for writing tasks', dimension: ['Description'], evidenceType: 'work-sample', selfReportValidity: 'medium' },
  { id: '2.7', title: 'AI for synthesis', dimension: ['Discernment'], evidenceType: 'work-sample', selfReportValidity: 'low' },
  { id: '2.8', title: 'Calibrated trust (avoiding over- and under-reliance)', dimension: ['Discernment'], evidenceType: 'performance-task', selfReportValidity: 'low' },
  { id: '2.9', title: 'Recognizing AI failure modes specific to your work', dimension: ['Discernment'], evidenceType: 'portfolio', selfReportValidity: 'medium' },
  { id: '2.10', title: 'Test-driven and constraint-first prompting', dimension: ['Description'], evidenceType: 'work-sample', selfReportValidity: 'medium' },
  { id: '2.11', title: 'Personal AI use-case library + Diligence Statement', dimension: ['Delegation', 'Diligence'], evidenceType: 'portfolio', selfReportValidity: 'high' },
  { id: '2.12', title: 'Recognizing when to switch tools, models, or modes', dimension: ['Delegation'], evidenceType: 'performance-task', selfReportValidity: 'medium' },
  { id: '2.13', title: 'Resisting metric and productivity illusions', dimension: ['Discernment'], evidenceType: 'performance-task', selfReportValidity: 'low' },
  { id: '2.14', title: 'GLAT-style objective gate', dimension: ['Discernment'], evidenceType: 'quiz', selfReportValidity: 'na' },
  { id: '2.15', title: 'Paired AI-on / AI-off calibration', dimension: ['Delegation', 'Discernment'], evidenceType: 'performance-task', selfReportValidity: 'na' },
];

export const PHASES: Phase[] = [
  {
    id: 'stage-1a',
    week: 'Stage 1a',
    title: 'Rules & Access',
    description: 'The gate: the rules, tools, and access every practitioner needs before using AI.',
    modules: STAGE_1A.map(cell => stub('stage-1a', '1a', 'Stage 1a · Rules & Access', cell)),
  },
  {
    id: 'stage-1b',
    week: 'Stage 1b',
    title: 'Orienting Frames',
    description: 'The mental models and framings that shape how to think about AI.',
    modules: STAGE_1B.map(cell => stub('stage-1b', '1b', 'Stage 1b · Orienting Frames', cell)),
  },
  {
    id: 'stage-2',
    week: 'Stage 2',
    title: 'Active Practitioner',
    description: 'The hands-on craft of working with AI as a literate practitioner.',
    modules: STAGE_2.map(cell => stub('stage-2', '2', 'Stage 2 · Active Practitioner', cell)),
  },
];

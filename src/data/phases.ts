import { Module, Phase } from '../types';
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
function stub(phaseId: string, stageName: string, cell: CellSpec): Module {
  return {
    id: cell.id,
    phaseId,
    title: cell.title,
    type: cell.type ?? 'content',
    content: REAL_CONTENT[cell.id] ?? `## ${cell.title}\n\n*Coming soon.* Part of ${stageName}.`,
  };
}

const STAGE_1A: CellSpec[] = [
  { id: '1.3', title: 'Recognizing when AI is appropriate vs. when human judgment is essential' },
  { id: '1.4', title: 'Data classification and privacy hygiene for prompts' },
  { id: '1.5', title: 'Approved-tool literacy' },
  { id: '1.6', title: 'Setup and access' },
  { id: '1.9', title: 'Disclosure norms and practices' },
  { id: '1.10', title: 'Regulatory floor awareness' },
  { id: '1.13', title: 'Non-practitioner-involved-in-AI literacy' },
];

const STAGE_1B: CellSpec[] = [
  { id: '1.1', title: 'Mechanical mental model of how LLMs work' },
  { id: '1.2', title: 'Hallucination as a structural feature, not a bug' },
  { id: '1.7', title: 'Recognizing AI bias, fairness, and accessibility blind spots' },
  { id: '1.8', title: 'Energy, environmental, and sovereignty conversation' },
  { id: '1.11', title: 'Honest framing of job-shape change' },
  { id: '1.12', title: 'Civic-tech-specific AI harm patterns' },
];

const STAGE_2: CellSpec[] = [
  { id: '2.1', title: 'Prompt construction as a craft', type: 'lab' },
  { id: '2.2', title: 'Output validation as a verifiable skill' },
  { id: '2.3', title: 'Counteracting the polished-output trap' },
  { id: '2.4', title: 'Iteration as the literate behavior' },
  { id: '2.5', title: 'Working with the context window' },
  { id: '2.6', title: 'AI for writing tasks' },
  { id: '2.7', title: 'AI for synthesis' },
  { id: '2.8', title: 'Calibrated trust (avoiding over- and under-reliance)' },
  { id: '2.9', title: 'Recognizing AI failure modes specific to your work' },
  { id: '2.10', title: 'Test-driven and constraint-first prompting' },
  { id: '2.11', title: 'Personal AI use-case library + Diligence Statement' },
  { id: '2.12', title: 'Recognizing when to switch tools, models, or modes' },
  { id: '2.13', title: 'Resisting metric and productivity illusions' },
  { id: '2.14', title: 'GLAT-style objective gate' },
  { id: '2.15', title: 'Paired AI-on / AI-off calibration' },
];

export const PHASES: Phase[] = [
  {
    id: 'stage-1a',
    week: 'Stage 1a',
    title: 'Rules & Access',
    description: 'The gate: the rules, tools, and access every practitioner needs before using AI.',
    modules: STAGE_1A.map(cell => stub('stage-1a', 'Stage 1a · Rules & Access', cell)),
  },
  {
    id: 'stage-1b',
    week: 'Stage 1b',
    title: 'Orienting Frames',
    description: 'The mental models and framings that shape how to think about AI.',
    modules: STAGE_1B.map(cell => stub('stage-1b', 'Stage 1b · Orienting Frames', cell)),
  },
  {
    id: 'stage-2',
    week: 'Stage 2',
    title: 'Active Practitioner',
    description: 'The hands-on craft of working with AI as a literate practitioner.',
    modules: STAGE_2.map(cell => stub('stage-2', 'Stage 2 · Active Practitioner', cell)),
  },
];

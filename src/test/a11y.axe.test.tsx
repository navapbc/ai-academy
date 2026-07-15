// @vitest-environment jsdom
//
// P6.4 (Unit 2) — automated axe assertions over a representative, high-value set
// of surfaces. This is the runtime a11y floor that complements the static
// jsx-a11y lint (Unit 1): axe catches name/role/value, contrast-in-DOM, list
// structure, label association, and duplicate-id issues that a static linter
// can't. It is COMPONENT-LEVEL (jsdom), not e2e — e2e isn't in CI (see
// CLAUDE.md), so this is the CI-enforceable choice.
//
// Coverage is deliberately a curated set of key screens (see CASES below), NOT
// every component. jsdom has no layout engine, so axe's colour-contrast check is
// effectively disabled here (documented limitation — contrast goes on the manual
// list in the audit doc). Data/network deps are mocked the same way the existing
// component tests mock them.
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import type { RunOptions } from 'axe-core';
import type { ReactElement } from 'react';

import Login from '../components/Login';
import PiiNotice from '../components/PiiNotice';
import UsageMonitoring from '../components/staff/UsageMonitoring';
import CohortDashboard from '../components/staff/CohortDashboard';
import ModuleRenderer from '../components/ModuleRenderer';
import Lab from '../components/Lab';
import Critique from '../components/exercises/Critique';
import HarmRubric from '../components/exercises/HarmRubric';
import GlatExam from '../components/exercises/GlatExam';
import ScenarioSorter from '../components/ScenarioSorter';
import LearnerDashboard from '../components/LearnerDashboard';
import LocalTutorFAB from '../components/LocalTutorFAB';
import type {
  CritiqueConfig,
  GlatConfig,
  HarmRubricConfig,
  LabConfig,
  Module,
  Phase,
  SorterConfig,
} from '../types';
import type { UsageByUser } from '../lib/usageMonitoring';
import type { CohortSummary, ScoreDistribution } from '../lib/dashboard';
import type { LearnerDetailData } from '../lib/learnerDetail';

// --- Shared mocks (mirror the existing component tests) -----------------------
// A signed-in user so the auth-gated widgets render their real content.
vi.mock('../lib/auth', async (orig) => {
  const actual = await orig<typeof import('../lib/auth')>();
  return { ...actual, useAuth: () => ({ user: { id: 'u1' }, signInWithGoogle: vi.fn(), signIn: vi.fn(), authError: null }) };
});
// Progress data-access: quiz read-back + lab writes are stubbed so nothing
// touches Supabase. fetchQuizSummary resolves empty (no prior attempts).
vi.mock('../lib/progress', () => ({
  fetchQuizSummary: vi.fn(async () => ({ best: null, latest: null })),
  recordQuizAttempt: vi.fn(async () => {}),
  recordLabSubmission: vi.fn(async () => 'sub-1'),
  saveGrade: vi.fn(async () => {}),
}));
vi.mock('../lib/grading', () => ({ requestLlmGrade: vi.fn(async () => ({ grader: 'llm', perAnchor: [], overall: 0, maxOverall: 0 })) }));
vi.mock('../lib/llm', () => ({ streamChat: vi.fn(async () => {}) }));

// Staff dashboards: mock their fetchers + realtime (as CohortDashboard.test does).
const { fetchUsageByUser, fetchCohortSummaries, fetchScoreDistribution, fetchCohortLearners } = vi.hoisted(() => ({
  fetchUsageByUser: vi.fn(),
  fetchCohortSummaries: vi.fn(),
  fetchScoreDistribution: vi.fn(),
  fetchCohortLearners: vi.fn(),
}));
vi.mock('../lib/usageMonitoring', async (orig) => {
  const actual = await orig<typeof import('../lib/usageMonitoring')>();
  return { ...actual, fetchUsageByUser };
});
vi.mock('../lib/dashboard', () => ({ fetchCohortSummaries, fetchScoreDistribution }));
vi.mock('../lib/dashboardRealtime', () => ({ subscribeToDashboardChanges: () => () => {} }));

// LearnerDashboard (self-view) + staff learner roster both read learnerDetail;
// the learner self-view also embeds LearnerPortfolio, which fetches separately.
const { fetchLearnerDetail, fetchLearnerPortfolio } = vi.hoisted(() => ({
  fetchLearnerDetail: vi.fn(),
  fetchLearnerPortfolio: vi.fn(),
}));
vi.mock('../lib/learnerDetail', () => ({ fetchCohortLearners, fetchLearnerDetail }));
vi.mock('../lib/learnerPortfolio', () => ({ fetchLearnerPortfolio }));

const noop = () => {};

// --- Fixtures -----------------------------------------------------------------
const USAGE_ROWS: UsageByUser[] = [
  { userId: 'u-1', name: 'Ada Lovelace', callCount: 3, inputTokens: 300, outputTokens: 150, totalTokens: 450, overThreshold: false },
  { userId: 'u-2', name: 'Grace Hopper', callCount: 40, inputTokens: 900_000, outputTokens: 200_000, totalTokens: 1_100_000, overThreshold: true },
];
const COHORTS: CohortSummary[] = [
  { cohortId: 'c-a', cohortName: 'Alpha cohort', archived: false, learnerCount: 3, avgCompletionPct: 0.5, glatPassRate: 0, avgQuizPct: 0.7, reviewableTotal: 2 },
];
const DIST = new Map<string, ScoreDistribution>([['c-a', { lt60: 1, '60to79': 1, '80to100': 1 }]]);

const baseModule: Module = {
  id: '1.1',
  cellId: '1.1',
  origin: 'matrix',
  visibility: 'public',
  title: 'What is AI literacy?',
  type: 'content',
  content: '# What is AI literacy?\n\nA short lesson with a [link](https://example.gov) and a list:\n\n- one\n- two',
  phaseId: 'stage-1a',
  stage: '1a',
  status: 'published',
  dimension: ['Diligence'],
  evidenceType: 'quiz',
  selfReportValidity: 'medium',
  progressResetAt: null,
};

const quizModule: Module = {
  ...baseModule,
  id: '1.2',
  cellId: '1.2',
  title: 'Concept check',
  type: 'quiz',
  quiz: [
    { question: 'Which is a good prompt?', options: ['A vague one', 'A specific one'], correctIndex: 1, explanation: 'Specific prompts win.' },
  ],
};

const labConfig: LabConfig = {
  kind: 'prompt-construction',
  brief: {
    task: 'Summarize the SNAP notice for the client.',
    constraints: ['Sixth-grade reading level.', 'Keep all dollar amounts and dates exact.'],
  },
  scaffoldHints: [{ label: 'Role', hint: 'Say who the assistant is.' }],
  rubric: { anchors: [{ id: 'role-context', label: 'Role & context', description: 'Establishes role and context.' }] },
};

const critiqueConfig: CritiqueConfig = {
  kind: 'critique',
  title: 'Critique the summary',
  brief: { instruction: 'Write a short critique of this eligibility summary.' },
  artifact: { label: 'AI-generated eligibility summary', bodyMd: 'This household is **income-eligible** under 7 CFR 273.10.' },
  rubric: { anchors: [{ id: 'a', label: 'Verify the citation', description: 'Flags the cite to verify.' }] },
};

const harmRubricConfig: HarmRubricConfig = {
  kind: 'harm-rubric',
  patterns: [
    { id: 'opacity', label: 'Opacity', desc: 'No way to see how a decision was made.' },
    { id: 'exclusion', label: 'Exclusion', desc: 'A group is shut out of the service.' },
  ],
  scenarios: [
    { id: 's1', text: 'The portal denies claims with no stated reason.', correct: 'opacity', why: 'Applicants cannot see why.' },
    { id: 's2', text: 'The form only works in English.', correct: 'exclusion', why: 'Non-English speakers are shut out.' },
  ],
};

const glatConfig: GlatConfig = {
  kind: 'glat',
  passThreshold: 0.8,
  sectionA: [{ id: 'A1', prompt: 'How confident are you?', scaleLabels: ['Not at all', 'Very'] }],
  sectionBC: [
    { id: 'B1', question: 'What gates cell 2.1?', options: ['The quiz', 'The lab'], correctIndex: 1, rationale: 'D8: the lab gates.' },
    { id: 'B2', question: 'Where does the API key live?', options: ['The browser', 'The Edge Function'], correctIndex: 1, rationale: 'Only in Deno runtime.' },
  ],
};

const sorterConfig: SorterConfig = {
  kind: 'scenario-sort',
  intro: 'Sort each task by the right level of AI involvement.',
  scenarios: [
    { id: 's1', text: 'Draft a first-pass summary of a public policy memo.', correct: 'assist', rationale: 'A person directs and checks.' },
    { id: 's2', text: 'Decide whether to deny a benefits application.', correct: 'human-only', rationale: 'A person must own the call.' },
  ],
};

const learnerDetail: LearnerDetailData = {
  modules: [
    { cellId: '1.1', title: 'Intro to AI literacy', stage: '1a', completed: true, bestQuizPct: 1, quizPassed: true },
    { cellId: '2.1', title: 'Prompt construction', stage: '2', completed: false, bestQuizPct: null, quizPassed: null },
  ],
  labs: [{ id: 'lab-a', labId: 'lab-2.1', status: 'reviewable', createdAt: '2026-01-01T00:00:00Z' }],
};

const tutorPhases: Phase[] = [
  {
    id: 'stage-1a',
    title: 'Stage 1a',
    description: 'Foundations of AI literacy.',
    week: 'Week 1',
    modules: [baseModule],
  },
];

// --- Covered surfaces (explicit + auditable) ----------------------------------
// Each case renders a real key surface with light mocks. `setup` primes any
// fetcher mocks the surface calls on mount.
interface Case {
  name: string;
  element: ReactElement;
  setup?: () => void;
  // Async-loaded surfaces mount a loading spinner, then fetch → setState → render
  // their real content. axe must scan the LOADED markup (the table/list/roster),
  // not the spinner — a single microtask flush isn't enough ticks. `awaitReady`
  // waits for known post-load content before axe runs. Sync surfaces omit it.
  awaitReady?: () => Promise<unknown>;
  // Per-case axe options. Used only to scope out rules that are about full-page
  // document structure and can't be judged on a component fragment rendered in
  // isolation (the app shell, not the component, supplies the surrounding h1/h2
  // and landmarks). This is a test-harness concession, not an app a11y waiver.
  axeOptions?: RunOptions;
}

// The module's own <h1>/<h2> title lives in the Academy shell that wraps
// ModuleRenderer at runtime — it isn't part of the fragment we render here.
// So the quiz card's first heading (an <h3>) trips `heading-order` only in
// isolation; the content-lesson case (whose markdown starts at <h1>) proves the
// heading hierarchy is otherwise sound.
const IGNORE_PAGE_HEADING_ORDER: RunOptions = { rules: { 'heading-order': { enabled: false } } };

const CASES: Case[] = [
  { name: 'Login', element: <Login /> },
  { name: 'PiiNotice (P6.3)', element: <PiiNotice /> },
  {
    name: 'UsageMonitoring (P6.2)',
    element: <UsageMonitoring onBack={noop} />,
    setup: () => fetchUsageByUser.mockResolvedValue(USAGE_ROWS),
    // Wait for the populated table (a user row), not the loading spinner.
    awaitReady: () => screen.findByText('Ada Lovelace'),
  },
  {
    name: 'CohortDashboard (staff)',
    element: <CohortDashboard onSelectLearner={noop} />,
    setup: () => {
      fetchCohortSummaries.mockResolvedValue(COHORTS);
      fetchScoreDistribution.mockResolvedValue(DIST);
      fetchCohortLearners.mockResolvedValue([]);
    },
    // Wait for the rendered cohort block, not the loading spinner.
    awaitReady: () => screen.findByText('Alpha cohort'),
  },
  {
    name: 'ModuleRenderer — content lesson',
    element: (
      <ModuleRenderer
        module={baseModule}
        selectedPersona="default"
        isCompleted={false}
        onComplete={noop}
      />
    ),
  },
  {
    name: 'ModuleRenderer — quiz module',
    element: (
      <ModuleRenderer
        module={quizModule}
        selectedPersona="default"
        isCompleted={false}
        onComplete={noop}
      />
    ),
    axeOptions: IGNORE_PAGE_HEADING_ORDER,
  },
  {
    // U9: the completed footer state ("Completed ✓") is a status region.
    name: 'ModuleRenderer — completed module footer',
    element: (
      <ModuleRenderer
        module={baseModule}
        selectedPersona="default"
        isCompleted={true}
        onComplete={noop}
      />
    ),
  },
  {
    name: 'Lab (prompt-construction)',
    element: <Lab onComplete={noop} labId="2.1" config={labConfig} />,
  },
  {
    name: 'Critique exercise (SourcedFreeTextLab)',
    element: <Critique config={critiqueConfig} labId="2.2" />,
  },
  {
    name: 'HarmRubric exercise',
    element: <HarmRubric config={harmRubricConfig} labId="1.12" />,
  },
  {
    // GLAT exit exam (cell 2.14) — the highest-stakes objective gate. Sync render.
    name: 'GlatExam (2.14 exit gate)',
    element: <GlatExam config={glatConfig} labId="2.14" onComplete={noop} />,
    // The exam card's first heading is an <h3> (page h1/h2 live in the shell).
    axeOptions: IGNORE_PAGE_HEADING_ORDER,
  },
  {
    // Scenario sorter (cell 1.3) — known drag-drop a11y risk. Sync render.
    name: 'ScenarioSorter (1.3)',
    element: <ScenarioSorter config={sorterConfig} onComplete={noop} />,
    // The sorter card's first heading is an <h3> (page h1/h2 live in the shell).
    axeOptions: IGNORE_PAGE_HEADING_ORDER,
  },
  {
    // Learner self-view dashboard (P5.3a). Async: detail + portfolio both fetch.
    name: 'LearnerDashboard (self-view)',
    element: <LearnerDashboard userId="me" />,
    setup: () => {
      fetchLearnerDetail.mockResolvedValue(learnerDetail);
      fetchLearnerPortfolio.mockResolvedValue({
        pairedCalibration: null,
        confidenceCalibration: null,
        failureLog: null,
        useCasePortfolio: null,
      });
    },
    // Wait for a loaded module row, not the spinner.
    awaitReady: () => screen.findByText('Prompt construction'),
  },
  {
    // Tutor chat FAB — the chat dialog is the high-value interactive surface, so
    // open it before scanning (the closed FAB is just one button). awaitReady both
    // triggers the open and waits for the dialog markup axe should scan.
    name: 'LocalTutorFAB (open dialog)',
    element: <LocalTutorFAB selectedPersona="default" currentModule={baseModule} phases={tutorPhases} />,
    awaitReady: async () => {
      await userEvent.click(screen.getByRole('button', { name: /open study buddy/i }));
      return screen.findByRole('dialog', { name: /study buddy/i });
    },
  },
];

describe('a11y (axe) — key surfaces have zero violations', () => {
  test.each(CASES)('$name', async ({ element, setup, awaitReady, axeOptions }) => {
    setup?.();
    const { container } = render(element);
    // For async-loaded surfaces, wait for their real (non-spinner) content so axe
    // scans the populated markup. Sync surfaces flush one microtask as before.
    if (awaitReady) {
      await awaitReady();
    } else {
      await Promise.resolve();
    }
    expect(await axe(container, axeOptions)).toHaveNoViolations();
  });
});

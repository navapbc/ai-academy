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
import { render } from '@testing-library/react';
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
import type {
  CritiqueConfig,
  HarmRubricConfig,
  LabConfig,
  Module,
} from '../types';
import type { UsageByUser } from '../lib/usageMonitoring';
import type { CohortSummary, ScoreDistribution } from '../lib/dashboard';

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
vi.mock('../lib/learnerDetail', () => ({ fetchCohortLearners }));
vi.mock('../lib/dashboardRealtime', () => ({ subscribeToDashboardChanges: () => () => {} }));

const noop = () => {};

// --- Fixtures -----------------------------------------------------------------
const USAGE_ROWS: UsageByUser[] = [
  { userId: 'u-1', name: 'Ada Lovelace', callCount: 3, inputTokens: 300, outputTokens: 150, totalTokens: 450, overThreshold: false },
  { userId: 'u-2', name: 'Grace Hopper', callCount: 40, inputTokens: 900_000, outputTokens: 200_000, totalTokens: 1_100_000, overThreshold: true },
];
const COHORTS: CohortSummary[] = [
  { cohortId: 'c-a', cohortName: 'Alpha cohort', learnerCount: 3, avgCompletionPct: 0.5, glatPassRate: 0, avgQuizPct: 0.7, reviewableTotal: 2 },
];
const DIST = new Map<string, ScoreDistribution>([['c-a', { lt60: 1, '60to79': 1, '80to100': 1 }]]);

const baseModule: Module = {
  id: '1.1',
  cellId: '1.1',
  origin: 'matrix',
  title: 'What is AI literacy?',
  type: 'content',
  content: '# What is AI literacy?\n\nA short lesson with a [link](https://example.gov) and a list:\n\n- one\n- two',
  phaseId: 'stage-1a',
  stage: '1a',
  status: 'published',
  dimension: ['Diligence'],
  evidenceType: 'quiz',
  selfReportValidity: 'medium',
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

// --- Covered surfaces (explicit + auditable) ----------------------------------
// Each case renders a real key surface with light mocks. `setup` primes any
// fetcher mocks the surface calls on mount.
interface Case {
  name: string;
  element: ReactElement;
  setup?: () => void;
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
  },
  {
    name: 'CohortDashboard (staff)',
    element: <CohortDashboard onSelectLearner={noop} />,
    setup: () => {
      fetchCohortSummaries.mockResolvedValue(COHORTS);
      fetchScoreDistribution.mockResolvedValue(DIST);
      fetchCohortLearners.mockResolvedValue([]);
    },
  },
  {
    name: 'ModuleRenderer — content lesson',
    element: <ModuleRenderer module={baseModule} selectedPersona="default" onComplete={noop} />,
  },
  {
    name: 'ModuleRenderer — quiz module',
    element: <ModuleRenderer module={quizModule} selectedPersona="default" onComplete={noop} />,
    axeOptions: IGNORE_PAGE_HEADING_ORDER,
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
];

describe('a11y (axe) — key surfaces have zero violations', () => {
  test.each(CASES)('$name', async ({ element, setup, axeOptions }) => {
    setup?.();
    const { container } = render(element);
    // Let any mount-time fetch resolve so the real (non-loading) UI is asserted.
    await Promise.resolve();
    expect(await axe(container, axeOptions)).toHaveNoViolations();
  });
});

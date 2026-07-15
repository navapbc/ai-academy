import { describe, it, expect, beforeEach } from 'vitest';
import {
  CELL_CROSSWALK, MATRIX_CELL_IDS,
  buildEvidenceRows, dedupLearnerRows,
} from './evidenceExport';
import type {
  EvidenceLearnerRow, EvidenceModuleRow, EvidenceProgressRow,
  EvidenceQuizRow, EvidenceLabRow, EvidenceProfileRow, EvidenceCohortRow,
} from './evidenceExport';

describe('CELL_CROSSWALK', () => {
  it('has an entry for every matrix cell', () => {
    for (const cellId of MATRIX_CELL_IDS) {
      expect(CELL_CROSSWALK[cellId], `missing crosswalk for cell ${cellId}`).toBeDefined();
    }
  });

  it('every entry has at least one claim in each framework', () => {
    for (const cellId of MATRIX_CELL_IDS) {
      const c = CELL_CROSSWALK[cellId];
      expect(c.dol.length, `cell ${cellId} missing DOL claims`).toBeGreaterThan(0);
      expect(c.euAiAct.length, `cell ${cellId} missing EU AI Act claims`).toBeGreaterThan(0);
      expect(c.m2521.length, `cell ${cellId} missing M-25-21 claims`).toBeGreaterThan(0);
    }
  });

  it('has exactly 28 matrix cells', () => {
    expect(MATRIX_CELL_IDS).toHaveLength(28);
  });
});

// Minimal fixtures that exercise the builder with a single learner + two modules.
const learners: EvidenceLearnerRow[] = [
  {
    user_id: 'u1',
    cohort_id: 'c1',
    completion_pct: '0.5',
    avg_quiz_pct: '0.75',
    glat_passed: false,
    reviewable_labs: 0,
  },
];

const profiles: EvidenceProfileRow[] = [
  { id: 'u1', full_name: 'Jane Doe', email: 'jane@navapbc.com' },
];

const cohortNames: EvidenceCohortRow[] = [
  { id: 'c1', name: 'Cohort Alpha' },
];

const modules: EvidenceModuleRow[] = [
  {
    cell_id: '1.4',
    title: 'Data Classification',
    stage: '1a',
    dimension: ['Discernment', 'Delegation'],
    evidence_type: 'quiz',
  },
  {
    cell_id: '2.1',
    title: 'Prompt Construction',
    stage: '2',
    dimension: ['Description'],
    evidence_type: 'performance-task',
  },
];

const progress: EvidenceProgressRow[] = [
  { user_id: 'u1', module_id: '1.4', status: 'completed', completed_at: '2026-06-01T10:00:00Z' },
];

const quizzes: EvidenceQuizRow[] = [
  {
    user_id: 'u1',
    module_id: '1.4',
    score: 3,
    max_score: 4,
    passed: true,
    attempted_at: '2026-06-01T09:55:00Z',
  },
  {
    user_id: 'u1',
    module_id: '1.4',
    score: 2,
    max_score: 4,
    passed: false,
    attempted_at: '2026-06-01T09:40:00Z',
  },
];

const labs: EvidenceLabRow[] = [
  {
    id: 'sub1',
    user_id: 'u1',
    lab_id: '2.1',
    status: 'reviewed',
    created_at: '2026-06-02T08:00:00Z',
    reviewed_at: '2026-06-03T12:00:00Z',
    reviewed_by: 'rev1',
    rubric_scores: {
      grader: 'llm',
      perAnchor: [{ id: 'a1', label: 'Clarity', score: 2, max: 2, rationale: 'Good' }],
      overall: 2,
      maxOverall: 2,
    },
  },
];

const reviewerProfiles: EvidenceProfileRow[] = [
  { id: 'rev1', full_name: 'Champion Chris', email: 'chris@navapbc.com' },
];

describe('buildEvidenceRows', () => {
  const rows = buildEvidenceRows({
    learners, profiles, cohortNames, modules, progress, quizzes, labs, reviewerProfiles,
  });

  it('produces one row per (learner × module)', () => {
    expect(rows).toHaveLength(2);
  });

  it('sets learner identity fields', () => {
    expect(rows[0].learnerId).toBe('u1');
    expect(rows[0].learnerName).toBe('Jane Doe');
    expect(rows[0].learnerEmail).toBe('jane@navapbc.com');
    expect(rows[0].cohortId).toBe('c1');
    expect(rows[0].cohortName).toBe('Cohort Alpha');
  });

  it('sets module metadata fields', () => {
    const row14 = rows.find((r) => r.cellId === '1.4')!;
    expect(row14.cellTitle).toBe('Data Classification');
    expect(row14.stage).toBe('1a');
    expect(row14.dimensions).toEqual(['Discernment', 'Delegation']);
    expect(row14.evidenceType).toBe('quiz');
  });

  it('marks completion from module_progress', () => {
    const row14 = rows.find((r) => r.cellId === '1.4')!;
    expect(row14.completed).toBe(true);
    expect(row14.completedAt).toBe('2026-06-01T10:00:00Z');

    const row21 = rows.find((r) => r.cellId === '2.1')!;
    expect(row21.completed).toBe(false);
    expect(row21.completedAt).toBeNull();
  });

  it('takes the best quiz attempt (highest score fraction)', () => {
    const row14 = rows.find((r) => r.cellId === '1.4')!;
    expect(row14.quizScore).toBeCloseTo(0.75);
    expect(row14.quizPassed).toBe(true);
    expect(row14.quizAttemptCount).toBe(2);
    expect(row14.bestQuizAttemptedAt).toBe('2026-06-01T09:55:00Z');
  });

  it('sets null quiz fields when no attempts', () => {
    const row21 = rows.find((r) => r.cellId === '2.1')!;
    expect(row21.quizScore).toBeNull();
    expect(row21.quizPassed).toBeNull();
    expect(row21.quizAttemptCount).toBe(0);
    expect(row21.bestQuizAttemptedAt).toBeNull();
  });

  it('sets lab evidence fields from the latest submission', () => {
    const row21 = rows.find((r) => r.cellId === '2.1')!;
    expect(row21.labStatus).toBe('reviewed');
    expect(row21.labSubmittedAt).toBe('2026-06-02T08:00:00Z');
    expect(row21.labReviewedAt).toBe('2026-06-03T12:00:00Z');
    expect(row21.labReviewerEmail).toBe('chris@navapbc.com');
    expect(row21.labOverallScore).toBe(1); // 2/2
    expect(row21.labAnchorScores).toHaveLength(1);
  });

  it('sets null lab fields when no submission', () => {
    const row14 = rows.find((r) => r.cellId === '1.4')!;
    expect(row14.labStatus).toBeNull();
    expect(row14.labSubmittedAt).toBeNull();
    expect(row14.labReviewedAt).toBeNull();
    expect(row14.labReviewerEmail).toBeNull();
    expect(row14.labOverallScore).toBeNull();
    expect(row14.labAnchorScores).toBeNull();
  });

  it('attaches crosswalk claims from CELL_CROSSWALK', () => {
    const row14 = rows.find((r) => r.cellId === '1.4')!;
    const cw = CELL_CROSSWALK['1.4'];
    expect(row14.dolClaims).toEqual(cw.dol);
    expect(row14.euAiActClaims).toEqual(cw.euAiAct);
    expect(row14.m2521Claims).toEqual(cw.m2521);
  });

  it('falls back gracefully for a cell not in CELL_CROSSWALK (custom lesson)', () => {
    const customModules: EvidenceModuleRow[] = [
      { cell_id: 'custom-my-lesson', title: 'My Lesson', stage: null, dimension: [], evidence_type: 'quiz' },
    ];
    const customRows = buildEvidenceRows({
      learners, profiles, cohortNames, modules: customModules,
      progress: [], quizzes: [], labs: [], reviewerProfiles: [],
    });
    expect(customRows[0].dolClaims).toEqual([]);
    expect(customRows[0].euAiActClaims).toEqual([]);
    expect(customRows[0].m2521Claims).toEqual([]);
  });

  it('uses email as learner name when full_name is absent', () => {
    const noNameProfiles: EvidenceProfileRow[] = [
      { id: 'u1', full_name: null, email: 'jane@navapbc.com' },
    ];
    const result = buildEvidenceRows({
      learners, profiles: noNameProfiles, cohortNames, modules,
      progress: [], quizzes: [], labs: [], reviewerProfiles: [],
    });
    expect(result[0].learnerName).toBe('jane@navapbc.com');
  });

  it('sorts rows: learner name asc, then module sort_order (module list order)', () => {
    // The module list comes in sort_order from the DB; rows should preserve that order.
    expect(rows[0].cellId).toBe('1.4');
    expect(rows[1].cellId).toBe('2.1');
  });
});

// ---------------------------------------------------------------------------
// U5 multi-enrollment: dedup + multi-cohort labels
// ---------------------------------------------------------------------------

describe('dedupLearnerRows (U5 multi-enrollment)', () => {
  const dualRows: EvidenceLearnerRow[] = [
    { user_id: 'u1', cohort_id: 'c1', completion_pct: '0.5', avg_quiz_pct: '0.75', glat_passed: false, reviewable_labs: 0 },
    { user_id: 'u1', cohort_id: 'c2', completion_pct: '0.5', avg_quiz_pct: '0.75', glat_passed: false, reviewable_labs: 0 },
    { user_id: 'u2', cohort_id: 'c2', completion_pct: '0.25', avg_quiz_pct: null, glat_passed: false, reviewable_labs: 1 },
  ];

  it('merges a dual-enrolled learner into one row carrying both cohort ids', () => {
    const out = dedupLearnerRows(dualRows);
    expect(out).toHaveLength(2);
    const u1 = out.find((l) => l.user_id === 'u1')!;
    expect(u1.cohort_ids).toEqual(['c1', 'c2']);
    expect(u1.completion_pct).toBe('0.5'); // user-scoped metrics preserved
    const u2 = out.find((l) => l.user_id === 'u2')!;
    expect(u2.cohort_ids).toEqual(['c2']);
  });

  it('is a no-op shape-wise for single-enrollment and unenrolled learners', () => {
    const single: EvidenceLearnerRow[] = [
      { user_id: 'u9', cohort_id: null, completion_pct: null, avg_quiz_pct: null, glat_passed: false, reviewable_labs: 0 },
    ];
    const out = dedupLearnerRows(single);
    expect(out).toHaveLength(1);
    expect(out[0].cohort_ids).toEqual([]);
  });

  it('builder emits one row per (learner × module) with joined cohort labels', () => {
    const deduped = dedupLearnerRows(dualRows.filter((l) => l.user_id === 'u1'));
    const out = buildEvidenceRows({
      learners: deduped,
      profiles,
      cohortNames: [
        { id: 'c1', name: 'Cohort Alpha' },
        { id: 'c2', name: 'Cohort Beta' },
      ],
      modules,
      progress: [],
      quizzes: [],
      labs: [],
      reviewerProfiles: [],
    });
    // 1 learner × 2 modules — NOT 2 cohorts × 2 modules.
    expect(out).toHaveLength(2);
    expect(out[0].cohortId).toBe('c1 | c2');
    expect(out[0].cohortName).toBe('Cohort Alpha | Cohort Beta');
  });
});

// ---------------------------------------------------------------------------
// fetchCohortEvidence — mocked Supabase tests
// ---------------------------------------------------------------------------

import { vi } from 'vitest';

vi.mock('./supabaseClient', () => ({
  getSupabaseClient: vi.fn(),
}));

import { getSupabaseClient } from './supabaseClient';
import { fetchCohortEvidence } from './evidenceExport';

function makeQuery(data: unknown[], error: null = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data, error }),
  };
  // Also make the chain itself thenable for queries that don't call order()
  (chain as unknown as { then: Promise<unknown>['then'] }).then = (resolve?, reject?) =>
    Promise.resolve({ data, error }).then(resolve, reject);
  return chain;
}

describe('fetchCohortEvidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty array when no learners are visible', async () => {
    const sb = { from: vi.fn().mockReturnValue(makeQuery([])) };
    vi.mocked(getSupabaseClient).mockReturnValue(sb as unknown as ReturnType<typeof getSupabaseClient>);

    const result = await fetchCohortEvidence('cohort-1');
    expect(result).toEqual([]);
    // Only one query should have run (learner_progress_summary — returned empty)
    expect(sb.from).toHaveBeenCalledWith('learner_progress_summary');
  });

  it('queries the correct tables with correct columns', async () => {
    const learnerRow = {
      user_id: 'u1', cohort_id: 'c1',
      completion_pct: '1', avg_quiz_pct: '1', glat_passed: true, reviewable_labs: 0,
    };
    const labRow = {
      id: 'sub1', user_id: 'u1', lab_id: '2.1', status: 'reviewed',
      created_at: '2026-06-01T00:00:00Z', reviewed_at: '2026-06-02T00:00:00Z',
      reviewed_by: 'rev1', rubric_scores: null,
    };

    const sb = {
      from: vi.fn((table: string) => {
        let data: unknown[] = [];
        if (table === 'learner_progress_summary') data = [learnerRow];
        if (table === 'lab_submissions') data = [labRow];
        return makeQuery(data);
      }),
    };
    vi.mocked(getSupabaseClient).mockReturnValue(sb as unknown as ReturnType<typeof getSupabaseClient>);

    await fetchCohortEvidence();

    const queriedTables = (sb.from as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: string[]) => c[0],
    );
    expect(queriedTables).toContain('learner_progress_summary');
    expect(queriedTables).toContain('profiles');
    expect(queriedTables).toContain('cohorts');
    expect(queriedTables).toContain('modules');
    expect(queriedTables).toContain('module_progress');
    expect(queriedTables).toContain('quiz_attempts');
    expect(queriedTables).toContain('lab_submissions');
  });

  it('labReviewerEmail is null on the champion path (reviewer profiles return empty due to RLS)', async () => {
    // The champion SELECT policy on profiles scopes to enrolled learners, so
    // reviewers (champions/admins) return zero rows for a champion caller.
    const learnerRow = {
      user_id: 'u1', cohort_id: 'c1',
      completion_pct: '1', avg_quiz_pct: '1', glat_passed: true, reviewable_labs: 0,
    };
    const labRow = {
      id: 'sub1', user_id: 'u1', lab_id: '2.1', status: 'reviewed',
      created_at: '2026-06-01T00:00:00Z', reviewed_at: '2026-06-02T00:00:00Z',
      reviewed_by: 'rev1', rubric_scores: null,
    };
    const moduleRow = {
      cell_id: '2.1', title: 'Prompt Construction', stage: '2',
      dimension: ['Description'], evidence_type: 'performance-task',
    };
    const sb = {
      from: vi.fn((table: string) => {
        let data: unknown[] = [];
        if (table === 'learner_progress_summary') data = [learnerRow];
        if (table === 'lab_submissions') data = [labRow];
        if (table === 'modules') data = [moduleRow];
        // profiles returns empty for champion caller (RLS scopes to learners only)
        return makeQuery(data);
      }),
    };
    vi.mocked(getSupabaseClient).mockReturnValue(sb as unknown as ReturnType<typeof getSupabaseClient>);

    const result = await fetchCohortEvidence('c1');
    const row21 = result.find((r) => r.cellId === '2.1');
    // reviewerProfiles will be empty → labReviewerEmail is null
    expect(row21).toBeDefined();
    expect(row21?.labReviewerEmail).toBeNull();
  });

  it('all-cohorts mode dedups a dual-enrolled learner (one row per learner × module)', async () => {
    const dualLearnerRows = [
      { user_id: 'u1', cohort_id: 'c1', completion_pct: '1', avg_quiz_pct: null, glat_passed: false, reviewable_labs: 0 },
      { user_id: 'u1', cohort_id: 'c2', completion_pct: '1', avg_quiz_pct: null, glat_passed: false, reviewable_labs: 0 },
    ];
    const moduleRow = {
      cell_id: '1.1', title: 'AI Foundations', stage: '1a',
      dimension: [], evidence_type: 'quiz',
    };
    const cohortRows = [
      { id: 'c1', name: 'Cohort Alpha' },
      { id: 'c2', name: 'Cohort Beta' },
    ];
    const sb = {
      from: vi.fn((table: string) => {
        let data: unknown[] = [];
        if (table === 'learner_progress_summary') data = dualLearnerRows;
        if (table === 'modules') data = [moduleRow];
        if (table === 'cohorts') data = cohortRows;
        return makeQuery(data);
      }),
    };
    vi.mocked(getSupabaseClient).mockReturnValue(sb as unknown as ReturnType<typeof getSupabaseClient>);

    const result = await fetchCohortEvidence(); // all-cohorts (no cohortId)
    // One module × one (deduped) learner — not one per (learner × cohort).
    expect(result).toHaveLength(1);
    expect(result[0].cohortName).toBe('Cohort Alpha | Cohort Beta');
  });

  it('throws when Supabase returns an error', async () => {
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
        then: ((resolve?, reject?) =>
          Promise.resolve({ data: null, error: new Error('DB error') }).then(resolve, reject)) as Promise<unknown>['then'],
      }),
    };
    vi.mocked(getSupabaseClient).mockReturnValue(sb as unknown as ReturnType<typeof getSupabaseClient>);

    await expect(fetchCohortEvidence()).rejects.toThrow('DB error');
  });
});

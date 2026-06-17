import { describe, test, expect } from 'vitest';
import {
  buildReviewQueue,
  summarizeSubmission,
  type ReviewSubmissionRow,
  type ProfileNameRow,
} from './reviewQueue';
import type { GradeResult } from './grading';

const VERDICT: GradeResult = {
  grader: 'llm',
  perAnchor: [{ id: 'a', label: 'Clarity', score: 2, max: 2, rationale: 'clear' }],
  overall: 2,
  maxOverall: 2,
};

describe('buildReviewQueue', () => {
  const rows: ReviewSubmissionRow[] = [
    { id: 's1', user_id: 'u1', lab_id: '2.2', transcript: { kind: 'critique', critique: 'x' }, rubric_scores: VERDICT, grader: 'llm', created_at: '2026-05-01T00:00:00Z' },
    { id: 's2', user_id: 'u2', lab_id: '2.6', transcript: { kind: 'voice-edit' }, rubric_scores: null, grader: null, created_at: '2026-05-09T00:00:00Z' },
  ];
  const names: ProfileNameRow[] = [
    { id: 'u1', full_name: 'Ada Lovelace', email: 'ada@navapbc.com' },
    { id: 'u2', full_name: null, email: 'grace@navapbc.com' },
  ];

  test('joins names and sorts newest-first', () => {
    const q = buildReviewQueue(rows, names);
    expect(q.map((i) => i.submissionId)).toEqual(['s2', 's1']); // newest first
    expect(q.find((i) => i.submissionId === 's1')!.learnerName).toBe('Ada Lovelace');
    expect(q.find((i) => i.submissionId === 's2')!.learnerName).toBe('grace@navapbc.com'); // full_name null → email
  });

  test('falls back to a short id when no profile resolves', () => {
    const q = buildReviewQueue([rows[0]], []);
    expect(q[0].learnerName).toBe('Learner u1');
    expect(q[0].rubricScores).toEqual(VERDICT);
  });
});

describe('summarizeSubmission', () => {
  test('voice-edit → draft + revision', () => {
    expect(summarizeSubmission({ kind: 'voice-edit', draft: 'D', revision: 'R' })).toEqual([
      { label: 'AI first draft', value: 'D' },
      { label: 'Learner revision (AI-off)', value: 'R' },
    ]);
  });

  test('iteration → turn count + the learner user messages only', () => {
    const r = summarizeSubmission({
      kind: 'iteration',
      turnCount: 2,
      messages: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'reply' },
        { role: 'user', content: 'second' },
      ],
    });
    expect(r[0]).toEqual({ label: 'Turns', value: '2' });
    expect(r[1].value).toContain('first');
    expect(r[1].value).toContain('second');
    expect(r[1].value).not.toContain('reply'); // assistant turns excluded
  });

  test('prompt-eval → the reusable prompt', () => {
    expect(summarizeSubmission({ kind: 'prompt-eval', prompt: 'P', outputs: [] })).toEqual([
      { label: 'Reusable prompt', value: 'P' },
    ]);
  });

  test('critique/synthesis → text stored under the kind key', () => {
    expect(summarizeSubmission({ kind: 'critique', critique: 'my critique' })).toEqual([
      { label: 'Response', value: 'my critique' },
    ]);
    expect(summarizeSubmission({ kind: 'synthesis', synthesis: 'my synthesis' })).toEqual([
      { label: 'Response', value: 'my synthesis' },
    ]);
  });

  test('2.1 prompt-construction (no kind) → prompt + response', () => {
    const r = summarizeSubmission({ brief: 'b', prompt: 'the prompt', response: 'claude said' });
    expect(r).toEqual([
      { label: 'Prompt', value: 'the prompt' },
      { label: 'Claude response', value: 'claude said' },
    ]);
  });

  test('unknown shape → JSON fallback; non-object → empty', () => {
    expect(summarizeSubmission({ weird: 1 })[0].label).toBe('Submission');
    expect(summarizeSubmission({ weird: 1 })[0].value).toContain('weird');
    expect(summarizeSubmission(null)).toEqual([{ label: 'Submission', value: '' }]);
  });
});

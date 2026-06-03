import { describe, test, expect } from 'vitest';
import { parseVerdict, buildGradeUserMessage, type GradingRubric } from './verdict';

const rubric: GradingRubric = {
  anchors: [
    { id: 'a', label: 'A', description: 'da' },
    { id: 'b', label: 'B', description: 'db' },
  ],
};

// P4.3b generalized the judge from a hardcoded prompt/response submission to a
// neutral list of labelled sections. The prompt-construction lab (2.1) must keep
// passing the SAME two labels so its judge input is BYTE-IDENTICAL — no grading
// regression. Critique passes different labels.
describe('buildGradeUserMessage', () => {
  const oneAnchor: GradingRubric = { anchors: [{ id: 'a', label: 'A', description: 'da' }] };

  test('2.1 back-compat: the two original labels render the exact legacy string', () => {
    const msg = buildGradeUserMessage(oneAnchor, {
      brief: 'B',
      sections: [
        { label: "THE LEARNER'S PROMPT", text: 'P' },
        { label: "CLAUDE'S OUTPUT FROM THAT PROMPT", text: 'R' },
      ],
    });
    expect(msg).toBe(
      [
        'RUBRIC ANCHORS:',
        '- a (A): da',
        '',
        'THE BRIEF THE LEARNER WAS GIVEN:',
        'B',
        '',
        "THE LEARNER'S PROMPT:",
        'P',
        '',
        "CLAUDE'S OUTPUT FROM THAT PROMPT:",
        'R',
        '',
        'Score each anchor now as strict JSON.',
      ].join('\n'),
    );
  });

  test('critique: renders the brief then each labelled section in order', () => {
    const msg = buildGradeUserMessage(oneAnchor, {
      brief: 'Critique this.',
      sections: [
        { label: 'Artifact under review', text: 'A polished summary.' },
        { label: "The learner's critique", text: 'It cites an unverifiable date.' },
      ],
    });
    expect(msg).toContain('THE BRIEF THE LEARNER WAS GIVEN:\nCritique this.');
    expect(msg).toContain('Artifact under review:\nA polished summary.');
    expect(msg).toContain("The learner's critique:\nIt cites an unverifiable date.");
    // brief precedes the artifact, which precedes the critique.
    expect(msg.indexOf('Critique this.')).toBeLessThan(msg.indexOf('A polished summary.'));
    expect(msg.indexOf('A polished summary.')).toBeLessThan(msg.indexOf('It cites an unverifiable date.'));
  });
});

describe('parseVerdict', () => {
  test('valid JSON → perAnchor + totals', () => {
    const r = parseVerdict(
      '{"scores":[{"id":"a","score":2,"rationale":"good"},{"id":"b","score":1,"rationale":"ok"}]}',
      rubric,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.overall).toBe(3);
      expect(r.value.maxOverall).toBe(4);
      expect(r.value.perAnchor[0]).toEqual({ id: 'a', label: 'A', score: 2, max: 2, rationale: 'good' });
    }
  });

  test('strips markdown fences', () => {
    const r = parseVerdict(
      '```json\n{"scores":[{"id":"a","score":0,"rationale":"x"},{"id":"b","score":0,"rationale":"y"}]}\n```',
      rubric,
    );
    expect(r.ok).toBe(true);
  });

  test('malformed JSON → error', () => {
    expect(parseVerdict('not json at all', rubric).ok).toBe(false);
  });

  test('missing anchor → error', () => {
    expect(parseVerdict('{"scores":[{"id":"a","score":2,"rationale":"x"}]}', rubric).ok).toBe(false);
  });

  test('out-of-range score → error', () => {
    expect(
      parseVerdict('{"scores":[{"id":"a","score":5,"rationale":"x"},{"id":"b","score":1,"rationale":"y"}]}', rubric).ok,
    ).toBe(false);
  });
});

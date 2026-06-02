import { describe, test, expect } from 'vitest';
import { parseVerdict, type GradingRubric } from './verdict';

const rubric: GradingRubric = {
  anchors: [
    { id: 'a', label: 'A', description: 'da' },
    { id: 'b', label: 'B', description: 'db' },
  ],
};

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

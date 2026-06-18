import { describe, test, expect } from 'vitest';
import {
  parseContentAction,
  isValidCellId,
  isValidVideoUrl,
  validateQuizJson,
  validateLabConfigJson,
  validateSorterConfigJson,
  validateDraft,
  buildPublishUpdate,
  isAllowlistedAdmin,
  emailDomainAllowed,
  buildCorsHeaders,
  fixedWindowAllow,
  type RateLimitState,
} from './admin-content-core.ts';

const goodQuiz = [
  {
    question: 'Q1?',
    options: ['a', 'b', 'c', 'd'],
    correctIndex: 1,
    explanation: 'because b',
  },
];

describe('isValidCellId', () => {
  test('accepts matrix + custom ids, rejects junk', () => {
    expect(isValidCellId('1.4')).toBe(true);
    expect(isValidCellId('2.15')).toBe(true);
    expect(isValidCellId('custom-prompting-basics')).toBe(true);
    expect(isValidCellId('')).toBe(false);
    expect(isValidCellId('has space')).toBe(false);
    expect(isValidCellId('x'.repeat(81))).toBe(false);
    expect(isValidCellId(123)).toBe(false);
  });
});

describe('isValidVideoUrl', () => {
  test('allows empty/absent and http(s); rejects other schemes/junk', () => {
    expect(isValidVideoUrl(undefined)).toBe(true);
    expect(isValidVideoUrl(null)).toBe(true);
    expect(isValidVideoUrl('')).toBe(true);
    expect(isValidVideoUrl('https://youtu.be/abc')).toBe(true);
    expect(isValidVideoUrl('http://example.com/v')).toBe(true);
    expect(isValidVideoUrl('javascript:alert(1)')).toBe(false);
    expect(isValidVideoUrl('not a url')).toBe(false);
    expect(isValidVideoUrl(42)).toBe(false);
  });
});

describe('validateQuizJson', () => {
  test('accepts a well-formed quiz', () => {
    expect(validateQuizJson(goodQuiz).ok).toBe(true);
  });
  test('a single-question quiz is valid', () => {
    expect(validateQuizJson([goodQuiz[0]]).ok).toBe(true);
  });
  test('rejects empty array and non-array', () => {
    expect(validateQuizJson([]).ok).toBe(false);
    expect(validateQuizJson('nope').ok).toBe(false);
  });
  test('requires exactly 4 options (rejects fewer or more)', () => {
    const opts = (n: number) =>
      validateQuizJson([
        { question: 'q', options: Array.from({ length: n }, (_, i) => `o${i}`), correctIndex: 0, explanation: 'x' },
      ]);
    expect(opts(2).ok).toBe(false);
    expect(opts(3).ok).toBe(false);
    expect(opts(4).ok).toBe(true);
    expect(opts(5).ok).toBe(false);
    const r = opts(3);
    if (!r.ok) expect(r.error).toContain('exactly 4 options');
  });
  test('rejects out-of-range correctIndex, empty question, blank option, non-string explanation', () => {
    const base = { question: 'q', options: ['a', 'b', 'c', 'd'], correctIndex: 0, explanation: 'x' };
    expect(validateQuizJson([{ ...base, correctIndex: 4 }]).ok).toBe(false); // 0..3 only
    expect(validateQuizJson([{ ...base, correctIndex: -1 }]).ok).toBe(false);
    expect(validateQuizJson([{ ...base, question: '' }]).ok).toBe(false);
    expect(validateQuizJson([{ ...base, options: ['a', '', 'c', 'd'] }]).ok).toBe(false);
    expect(validateQuizJson([{ question: 'q', options: ['a', 'b', 'c', 'd'], correctIndex: 0 }]).ok).toBe(false); // missing explanation
  });
  test('failure carries a named, indexed error', () => {
    const r = validateQuizJson([{ question: 'q', options: ['a', 'b', 'c', 'd'], correctIndex: 9, explanation: 'x' }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('quiz_json[0].correctIndex');
  });
});

describe('validateLabConfigJson', () => {
  test('accepts a known kind; rejects unknown kind / non-object', () => {
    expect(validateLabConfigJson({ kind: 'reflection', prompt: 'p' }).ok).toBe(true);
    expect(validateLabConfigJson({ kind: 'glat' }).ok).toBe(true);
    expect(validateLabConfigJson({ kind: 'nope' }).ok).toBe(false);
    expect(validateLabConfigJson({}).ok).toBe(false);
    expect(validateLabConfigJson([]).ok).toBe(false);
    expect(validateLabConfigJson('x').ok).toBe(false);
  });
});

describe('validateSorterConfigJson', () => {
  test('accepts a well-formed sorter; rejects wrong kind / bad category', () => {
    const good = {
      kind: 'scenario-sort',
      scenarios: [{ id: 's1', text: 't', correct: 'delegate', rationale: 'r' }],
    };
    expect(validateSorterConfigJson(good).ok).toBe(true);
    expect(validateSorterConfigJson({ kind: 'wrong', scenarios: [] }).ok).toBe(false);
    expect(
      validateSorterConfigJson({ kind: 'scenario-sort', scenarios: [{ id: 's1', text: 't', correct: 'maybe', rationale: 'r' }] }).ok,
    ).toBe(false);
    expect(validateSorterConfigJson({ kind: 'scenario-sort', scenarios: [] }).ok).toBe(false);
  });
});

describe('validateDraft', () => {
  test('normalizes a full working copy keyed by column name', () => {
    const r = validateDraft({
      title: '  Lesson  ',
      type: 'content',
      body_md: '# hi',
      video_url: 'https://x.test/v',
      tutor_reference_md: 'extra',
      quiz_json: goodQuiz,
      lab_config_json: { kind: 'reflection', prompt: 'p' },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.title).toBe('Lesson'); // trimmed
      expect(r.value.body_md).toBe('# hi');
      expect(r.value.video_url).toBe('https://x.test/v');
      expect(r.value.quiz_json).toEqual(goodQuiz);
    }
  });

  test('partial drafts are valid; only supplied keys are present', () => {
    const r = validateDraft({ body_md: 'just the body' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({ body_md: 'just the body' });
      expect('title' in r.value).toBe(false);
    }
  });

  test('empty video_url normalizes to null', () => {
    const r = validateDraft({ video_url: '' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.video_url).toBeNull();
  });

  test('explicit nulls clear json fields', () => {
    const r = validateDraft({ quiz_json: null, lab_config_json: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ quiz_json: null, lab_config_json: null });
  });

  test('rejects an invalid embedded quiz / empty title / non-object', () => {
    expect(validateDraft({ quiz_json: [] }).ok).toBe(false);
    expect(validateDraft({ title: '   ' }).ok).toBe(false);
    expect(validateDraft('x').ok).toBe(false);
    expect(validateDraft(null).ok).toBe(false);
  });
});

describe('parseContentAction', () => {
  test('save-draft requires a valid cellId + draft', () => {
    const r = parseContentAction({ action: 'save-draft', cellId: '2.9', draft: { body_md: 'x' } });
    expect(r).toEqual({ ok: true, value: { action: 'save-draft', cellId: '2.9', draft: { body_md: 'x' } } });
    expect(parseContentAction({ action: 'save-draft', cellId: 'bad id', draft: {} }).ok).toBe(false);
    expect(parseContentAction({ action: 'save-draft', cellId: '2.9', draft: { quiz_json: [] } }).ok).toBe(false);
  });

  test('publish/archive/restore require only a cellId', () => {
    expect(parseContentAction({ action: 'publish', cellId: '2.9' }).ok).toBe(true);
    expect(parseContentAction({ action: 'archive', cellId: '2.9' }).ok).toBe(true);
    expect(parseContentAction({ action: 'restore', cellId: '2.9' }).ok).toBe(true);
    expect(parseContentAction({ action: 'publish' }).ok).toBe(false);
  });

  test('rejects unknown action / non-object body', () => {
    expect(parseContentAction({ action: 'delete-everything', cellId: '2.9' }).ok).toBe(false);
    expect(parseContentAction(null).ok).toBe(false);
    expect(parseContentAction('x').ok).toBe(false);
  });
});

describe('buildPublishUpdate', () => {
  test('copies present draft fields to live, sets published, bumps version absolutely, nulls draft', () => {
    const update = buildPublishUpdate({ body_md: 'new body', title: 'New' }, 3);
    expect(update).toEqual({
      body_md: 'new body',
      title: 'New',
      status: 'published',
      version: 4, // absolute (currentVersion + 1), never version = version + 1
      draft: null,
    });
  });

  test('only promotes keys present in the draft (untouched live columns stay)', () => {
    const update = buildPublishUpdate({ quiz_json: [{ q: 1 }] }, 1);
    expect(update).toMatchObject({ quiz_json: [{ q: 1 }], status: 'published', version: 2, draft: null });
    expect('body_md' in update).toBe(false);
  });
});

describe('shared helpers (mirror admin-cohorts-core)', () => {
  test('isAllowlistedAdmin matches case-insensitively', () => {
    expect(isAllowlistedAdmin('A@navapbc.com', 'a@navapbc.com, b@navapbc.com')).toBe(true);
    expect(isAllowlistedAdmin('c@navapbc.com', 'a@navapbc.com')).toBe(false);
    expect(isAllowlistedAdmin(null, 'a@navapbc.com')).toBe(false);
  });

  test('emailDomainAllowed enforces the domain', () => {
    expect(emailDomainAllowed('x@navapbc.com', 'navapbc.com')).toBe(true);
    expect(emailDomainAllowed('x@evil.com', 'navapbc.com')).toBe(false);
  });

  test('buildCorsHeaders echoes only allow-listed origins', () => {
    const allowed = ['http://localhost:5173'];
    expect(buildCorsHeaders('http://localhost:5173', allowed)['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
    expect(buildCorsHeaders('http://evil.com', allowed)['access-control-allow-origin']).toBeUndefined();
  });

  test('fixedWindowAllow enforces the per-window cap', () => {
    const store = new Map<string, RateLimitState>();
    for (let i = 0; i < 3; i++) expect(fixedWindowAllow(store, 'u', 1000, 3, 60_000)).toBe(true);
    expect(fixedWindowAllow(store, 'u', 1000, 3, 60_000)).toBe(false);
    expect(fixedWindowAllow(store, 'u', 70_000, 3, 60_000)).toBe(true);
  });
});

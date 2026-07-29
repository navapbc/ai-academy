import { describe, test, expect, afterEach, vi } from 'vitest';
import type { GradingRubric } from '../types';

// UNIT tests for requestLlmGrade (src/lib/grading.ts) — the client seam to the
// `grade` Edge Function. The verdict it returns is persisted VERBATIM into
// lab_submissions.rubric_scores and rendered by GradeResultCard (which maps over
// perAnchor), so a 200 that isn't the expected shape has to fail here rather
// than become bad DB rows and a crashed result card.

const URL = 'http://127.0.0.1:54321';
const ANON = 'anon-key';

const rubric: GradingRubric = { anchors: [{ id: 'a', label: 'Anchor', description: 'Met it.' }] };
const submission = { brief: 'Brief.', sections: [{ label: 'Work', text: 'the work' }] };

const VERDICT = {
  perAnchor: [{ id: 'a', label: 'Anchor', score: 2, max: 2, rationale: 'Met.' }],
  overall: 2,
  maxOverall: 2,
};

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }): Response {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    statusText: 'OK',
    json: async () => body,
  } as unknown as Response;
}

async function loadRequestLlmGrade() {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', URL);
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', ANON);
  vi.doMock('./supabaseClient', () => ({
    isSupabaseConfigured: true,
    getSupabaseClient: () => ({
      auth: { getSession: async () => ({ data: { session: null } }) },
    }),
  }));
  return (await import('./grading')).requestLlmGrade;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.doUnmock('./supabaseClient');
});

describe('requestLlmGrade', () => {
  test('returns the verdict stamped with grader: llm', async () => {
    const requestLlmGrade = await loadRequestLlmGrade();
    const fetchMock = vi.fn(async () => jsonResponse(VERDICT));
    vi.stubGlobal('fetch', fetchMock);

    const result = await requestLlmGrade({ rubric, submission });
    expect(result).toEqual({ ...VERDICT, grader: 'llm' });

    const [url, opts] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${URL}/functions/v1/grade`);
    expect(JSON.parse(opts.body as string)).toEqual({ rubric, submission });
  });

  test('surfaces the JSON { error } message on a non-200', async () => {
    const requestLlmGrade = await loadRequestLlmGrade();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'Rate limit exceeded.' }, { ok: false, status: 429 })),
    );
    await expect(requestLlmGrade({ rubric, submission })).rejects.toThrow('Rate limit exceeded.');
  });

  // A 200 whose body isn't a verdict (a proxy/CDN interposing a page, a
  // partially-deployed function) must throw, not return a half-built GradeResult
  // that saveGrade would write to rubric_scores and GradeResultCard would crash on.
  test.each([
    ['an unrelated object', { hello: 'world' }],
    ['a null body', null],
    ['a missing perAnchor array', { overall: 2, maxOverall: 2 }],
    ['a non-array perAnchor', { perAnchor: 'nope', overall: 2, maxOverall: 2 }],
    ['non-numeric totals', { perAnchor: [], overall: 'two', maxOverall: 2 }],
    [
      'a malformed anchor entry',
      { perAnchor: [{ id: 'a', label: 'Anchor', score: 'two', max: 2, rationale: 'Met.' }], overall: 2, maxOverall: 2 },
    ],
  ])('rejects a 200 with %s', async (_label, body) => {
    const requestLlmGrade = await loadRequestLlmGrade();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(body)));
    await expect(requestLlmGrade({ rubric, submission })).rejects.toThrow(/unexpected response/i);
  });

  test('rejects a 200 whose body is not JSON at all', async () => {
    const requestLlmGrade = await loadRequestLlmGrade();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => {
          throw new Error('not json');
        },
      }) as unknown as Response),
    );
    await expect(requestLlmGrade({ rubric, submission })).rejects.toThrow(/unreadable response/i);
  });

  test('an empty anchor list is still a valid verdict shape', async () => {
    const requestLlmGrade = await loadRequestLlmGrade();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ perAnchor: [], overall: 0, maxOverall: 0 })));
    await expect(requestLlmGrade({ rubric, submission })).resolves.toEqual({
      perAnchor: [],
      overall: 0,
      maxOverall: 0,
      grader: 'llm',
    });
  });
});

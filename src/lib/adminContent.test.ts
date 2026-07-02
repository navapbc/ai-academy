import { describe, test, expect, afterEach, vi } from 'vitest';

// UNIT tests for the admin-content client seam (src/lib/adminContent.ts). We mock
// the supabaseClient module (so no real client / session) and stub `fetch`. These
// assert that the typed creators POST the right action body to the function URL
// with the session token, and that the error / non-ok paths surface a clean Error.
// The actual write/authz boundary is proven by adminContent.integration.test.ts.

const URL = 'http://127.0.0.1:54321';
const ANON = 'anon-key';
const TOKEN = 'session-token-abc';

// The shape of one captured fetch() call: [url, requestInit].
type FetchCall = [string, { method: string; headers: Record<string, string>; body: string }];
const callAt = (fn: ReturnType<typeof vi.fn>, i: number): FetchCall =>
  fn.mock.calls[i] as unknown as FetchCall;

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }): Response {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

async function loadModule() {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', URL);
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', ANON);
  vi.doMock('./supabaseClient', () => ({
    isSupabaseConfigured: true,
    getSupabaseClient: () => ({
      auth: { getSession: async () => ({ data: { session: { access_token: TOKEN } } }) },
    }),
  }));
  return await import('./adminContent');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.doUnmock('./supabaseClient');
});

describe('invokeAdminContent — happy path', () => {
  test('saveDraft POSTs the action to the function URL with the session token', async () => {
    const { saveDraft } = await loadModule();
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, action: 'save-draft' }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await saveDraft('2.9', { body_md: 'new body' });
    expect(res).toEqual({ ok: true, action: 'save-draft', version: undefined });

    const [url, opts] = callAt(fetchMock, 0);
    expect(url).toBe(`${URL}/functions/v1/admin-content`);
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(opts.body)).toEqual({ action: 'save-draft', cellId: '2.9', draft: { body_md: 'new body' } });
  });

  test('publishLesson returns the new version from the response', async () => {
    const { publishLesson } = await loadModule();
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, action: 'publish', version: 4 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await publishLesson('2.9');
    expect(res).toEqual({ ok: true, action: 'publish', version: 4 });
    expect(JSON.parse(callAt(fetchMock, 0)[1].body)).toEqual({ action: 'publish', cellId: '2.9' });
  });

  test('publishLesson omits `note` when none is given (X.2)', async () => {
    const { publishLesson } = await loadModule();
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, action: 'publish', version: 4 }));
    vi.stubGlobal('fetch', fetchMock);

    await publishLesson('2.9');
    const body = JSON.parse(callAt(fetchMock, 0)[1].body);
    expect(body).toEqual({ action: 'publish', cellId: '2.9' });
    expect('note' in body).toBe(false);
  });

  test('publishLesson omits `note` for a whitespace-only note (X.2)', async () => {
    const { publishLesson } = await loadModule();
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, action: 'publish', version: 4 }));
    vi.stubGlobal('fetch', fetchMock);

    await publishLesson('2.9', '   ');
    const body = JSON.parse(callAt(fetchMock, 0)[1].body);
    expect(body).toEqual({ action: 'publish', cellId: '2.9' });
    expect('note' in body).toBe(false);
  });

  test('publishLesson includes a trimmed `note` when one is given (X.2)', async () => {
    const { publishLesson } = await loadModule();
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, action: 'publish', version: 4 }));
    vi.stubGlobal('fetch', fetchMock);

    await publishLesson('2.9', '  a note  ');
    expect(JSON.parse(callAt(fetchMock, 0)[1].body)).toEqual({
      action: 'publish',
      cellId: '2.9',
      note: 'a note',
    });
  });

  test('archive + restore post their actions', async () => {
    const { archiveLesson, restoreLesson } = await loadModule();
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, action: 'archive' }));
    vi.stubGlobal('fetch', fetchMock);
    await archiveLesson('custom-foo');
    expect(JSON.parse(callAt(fetchMock, 0)[1].body)).toEqual({ action: 'archive', cellId: 'custom-foo' });
    await restoreLesson('custom-foo');
    expect(JSON.parse(callAt(fetchMock, 1)[1].body)).toEqual({ action: 'restore', cellId: 'custom-foo' });
  });
});

describe('isValidVideoUrl (client-side inline check; server is authoritative)', () => {
  test('accepts empty / absent (video is optional)', async () => {
    const { isValidVideoUrl } = await loadModule();
    expect(isValidVideoUrl('')).toBe(true);
    expect(isValidVideoUrl(null)).toBe(true);
    expect(isValidVideoUrl(undefined)).toBe(true);
  });

  test('accepts http(s) URLs', async () => {
    const { isValidVideoUrl } = await loadModule();
    expect(isValidVideoUrl('https://example.com/video.mp4')).toBe(true);
    expect(isValidVideoUrl('http://localhost:3000/v')).toBe(true);
  });

  test('rejects non-http(s) and malformed URLs', async () => {
    const { isValidVideoUrl } = await loadModule();
    expect(isValidVideoUrl('ftp://example.com/v')).toBe(false);
    expect(isValidVideoUrl('javascript:alert(1)')).toBe(false);
    expect(isValidVideoUrl('not a url')).toBe(false);
  });
});

describe('invokeAdminContent — error paths', () => {
  test('throws the server error message on a non-ok response', async () => {
    const { publishLesson } = await loadModule();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'Only an admin may edit content.' }, { ok: false, status: 403 })));
    await expect(publishLesson('2.9')).rejects.toThrow('Only an admin may edit content.');
  });

  test('throws a connection error when fetch rejects', async () => {
    const { saveDraft } = await loadModule();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    await expect(saveDraft('2.9', {})).rejects.toThrow('Could not reach the server.');
  });

  test('falls back to a status-based error when the body has no error message', async () => {
    const { publishLesson } = await loadModule();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, { ok: false, status: 500 })));
    await expect(publishLesson('2.9')).rejects.toThrow('Request failed (500).');
  });
});

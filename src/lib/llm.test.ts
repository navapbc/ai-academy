import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

// UNIT tests for the streamChat client seam (src/lib/llm.ts). We mock the
// supabaseClient module (so no real client / session) and stub `fetch` with a
// fake streamed Response. llm.ts reads the Edge Function's PLAIN-TEXT stream
// (the function already strips Anthropic's SSE), so these tests assert that
// llm.ts forwards each decoded text chunk to onChunk and that the error /
// non-200 / missing-body paths surface a clean Error.
//
// Note: the Edge Function's SSE parsing (parseEvent / isStop in
// supabase/functions/chat/index.ts) is NOT covered here — it's a Deno module
// with a top-level Deno.serve() that can't be imported under vitest without
// editing source. That parsing is exercised by the Playwright E2E stub instead;
// the gap is recorded in docs/DEBT-REPORT.md ("Test coverage baseline").

const URL = 'http://127.0.0.1:54321';
const ANON = 'anon-key';

// A streamed Response body built from string chunks.
function streamResponse(chunks: string[], init?: { ok?: boolean; status?: number }): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    statusText: 'OK',
    body,
    json: async () => ({}),
  } as unknown as Response;
}

async function loadStreamChat() {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', URL);
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', ANON);
  vi.doMock('./supabaseClient', () => ({
    isSupabaseConfigured: true,
    getSupabaseClient: () => ({
      auth: { getSession: async () => ({ data: { session: null } }) },
    }),
  }));
  return (await import('./llm')).streamChat;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.doUnmock('./supabaseClient');
});

describe('streamChat — happy path', () => {
  test('forwards each decoded text chunk to onChunk in order', async () => {
    const streamChat = await loadStreamChat();
    const fetchMock = vi.fn(async () => streamResponse(['Hello', ', ', 'world']));
    vi.stubGlobal('fetch', fetchMock);

    const chunks: string[] = [];
    await streamChat([{ role: 'user', content: 'hi' }], {}, (t) => chunks.push(t));

    expect(chunks.join('')).toBe('Hello, world');
    // Posts to the chat Edge Function with the message body.
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${URL}/functions/v1/chat`);
    expect(opts.method).toBe('POST');
    const sent = JSON.parse(opts.body as string);
    expect(sent.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  test('passes system / model / maxTokens through to the function body', async () => {
    const streamChat = await loadStreamChat();
    const fetchMock = vi.fn(async () => streamResponse(['ok']));
    vi.stubGlobal('fetch', fetchMock);

    await streamChat(
      [{ role: 'user', content: 'hi' }],
      { system: 'You are helpful', model: 'claude-sonnet-4-6', maxTokens: 256 },
      () => {},
    );

    const [, opts] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const sent = JSON.parse(opts.body as string);
    expect(sent.system).toBe('You are helpful');
    expect(sent.model).toBe('claude-sonnet-4-6');
    expect(sent.max_tokens).toBe(256);
  });
});

describe('streamChat — error paths', () => {
  test('throws the JSON { error } message on a non-200 response', async () => {
    const streamChat = await loadStreamChat();
    const errorResponse = {
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      body: null,
      json: async () => ({ error: 'rate limited' }),
    } as unknown as Response;
    vi.stubGlobal('fetch', vi.fn(async () => errorResponse));

    await expect(
      streamChat([{ role: 'user', content: 'hi' }], {}, () => {}),
    ).rejects.toThrow('rate limited');
  });

  test('throws when the response has no body', async () => {
    const streamChat = await loadStreamChat();
    const noBody = {
      ok: true,
      status: 200,
      statusText: 'OK',
      body: null,
      json: async () => ({}),
    } as unknown as Response;
    vi.stubGlobal('fetch', vi.fn(async () => noBody));

    await expect(
      streamChat([{ role: 'user', content: 'hi' }], {}, () => {}),
    ).rejects.toBeTruthy();
  });

  test('falls back to status text when the error body is not JSON', async () => {
    const streamChat = await loadStreamChat();
    const badJson = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      body: null,
      json: async () => {
        throw new Error('not json');
      },
    } as unknown as Response;
    vi.stubGlobal('fetch', vi.fn(async () => badJson));

    await expect(
      streamChat([{ role: 'user', content: 'hi' }], {}, () => {}),
    ).rejects.toThrow(/Internal Server Error|500/);
  });
});

describe('streamChat — not configured', () => {
  test('throws a clear error when Supabase env is missing', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    vi.doMock('./supabaseClient', () => ({
      isSupabaseConfigured: false,
      getSupabaseClient: () => {
        throw new Error('not configured');
      },
    }));
    const { streamChat } = await import('./llm');

    await expect(
      streamChat([{ role: 'user', content: 'hi' }], {}, () => {}),
    ).rejects.toThrow(/not configured/i);
  });
});

// DOCUMENTS: LLM-05 — streamChat takes no AbortSignal and never cancels the
// reader, so a caller cannot abort an in-flight stream (unmount / new send
// leaks the request + keeps billing). When abort support is added, unskip and
// assert that aborting the passed signal rejects/stops the stream.
describe.skip('streamChat — cancellation (DOCUMENTS: LLM-05)', () => {
  test('aborts the in-flight stream when the caller signals abort', async () => {
    // No AbortSignal parameter exists on StreamOptions today; this is the
    // contract we want once LLM-05 is fixed.
    expect(false).toBe(true);
  });
});

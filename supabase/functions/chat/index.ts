// Supabase Edge Function: `chat`
//
// Server-side proxy to Anthropic's Messages API. The ANTHROPIC_API_KEY lives
// here (in the Deno runtime env) and is NEVER exposed to the browser — the
// client only ever talks to this function. We read Anthropic's SSE stream and
// re-stream just the text deltas back to the client as a plain UTF-8 text
// stream, which `src/lib/llm.ts` reads with a fetch + stream reader.
//
// Auth: relies on Supabase's default JWT verification at the gateway. The
// client invokes with the anon key (a valid JWT), which passes pre-SSO.
// Per-user auth and rate limits land later.

// Default model: Claude Haiku 4.5 — the cheapest current Claude model. The
// `ANTHROPIC_MODEL` env var overrides this default, and an individual request
// can override per call via the `model` field.
const DEFAULT_MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-haiku-4-5';
const DEFAULT_MAX_TOKENS = 1024;

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// Permissive CORS for local dev. The dev server runs on :3000 (reachable as
// both localhost and 127.0.0.1). Tighten the allow-list for production.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  system?: string;
  model?: string;
  max_tokens?: number;
}

Deno.serve(async (req: Request) => {
  // CORS preflight.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonError('Method not allowed. Use POST.', 405);
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return jsonError(
      'ANTHROPIC_API_KEY not set. Add it to the env file passed to ' +
        '`supabase functions serve --env-file supabase/functions/.env`.',
      500,
    );
  }

  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body.', 400);
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return jsonError('Request must include a non-empty `messages` array.', 400);
  }

  const anthropicBody = {
    model: body.model ?? DEFAULT_MODEL,
    max_tokens: body.max_tokens ?? DEFAULT_MAX_TOKENS,
    ...(body.system ? { system: body.system } : {}),
    messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
  };

  let upstream: Response;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify(anthropicBody),
    });
  } catch (err) {
    return jsonError(
      `Failed to reach Anthropic API: ${err instanceof Error ? err.message : String(err)}`,
      502,
    );
  }

  // Surface Anthropic API errors (bad key, invalid model, rate limit, etc.)
  // with their original status and message rather than a generic 500.
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    return jsonError(
      `Anthropic API error (${upstream.status}): ${detail || upstream.statusText}`,
      upstream.status || 502,
    );
  }

  // Re-stream: parse Anthropic's SSE and emit only the text deltas as a plain
  // text stream the browser can read incrementally.
  const textStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // SSE events are separated by a blank line. Process complete events
          // and keep any trailing partial event in the buffer.
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';

          for (const event of events) {
            const text = parseEvent(event);
            if (text) controller.enqueue(encoder.encode(text));
            if (isStop(event)) {
              controller.close();
              reader.cancel().catch(() => {});
              return;
            }
          }
        }
      } catch (err) {
        controller.error(err);
        return;
      } finally {
        reader.releaseLock();
      }

      controller.close();
    },
  });

  return new Response(textStream, {
    headers: {
      ...corsHeaders,
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-cache',
    },
  });
});

/**
 * Extracts the text delta from a single Anthropic SSE event block, if any.
 * We only care about `content_block_delta` events carrying a `text_delta`.
 * `error` events are turned into a readable inline message.
 */
function parseEvent(event: string): string | null {
  const dataLines = event
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim());

  if (dataLines.length === 0) return null;

  const data = dataLines.join('');
  if (!data || data === '[DONE]') return null;

  try {
    const json = JSON.parse(data);
    if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
      return json.delta.text ?? '';
    }
    if (json.type === 'error') {
      return `\n[stream error: ${json.error?.message ?? 'unknown error'}]`;
    }
  } catch {
    // Ignore non-JSON / partial data lines.
  }
  return null;
}

/** Whether this SSE event signals the end of the message stream. */
function isStop(event: string): boolean {
  return event.includes('event: message_stop') || event.includes('"type":"message_stop"');
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

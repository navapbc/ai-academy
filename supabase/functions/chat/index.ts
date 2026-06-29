// Supabase Edge Function: `chat`
//
// Server-side proxy to Anthropic's Messages API. The ANTHROPIC_API_KEY lives
// here (in the Deno runtime env) and is NEVER exposed to the browser — the
// client only ever talks to this function. We read Anthropic's SSE stream and
// re-stream just the text deltas back to the client as a plain UTF-8 text
// stream, which `src/lib/llm.ts` reads with a fetch + stream reader.
//
// Hardening (debt audit, SEC-01..05 / LLM-01..08,12):
//  - Authn/authz: requires a real signed-in @navapbc.com user (the public anon
//    key alone is rejected) — verified via getUser, not just the gateway JWT.
//  - CORS: echoes an allow-listed origin instead of a blanket `*`.
//  - Input: validated + normalized; model is allow-listed; max_tokens clamped.
//  - Rate limit: per-user fixed window (best-effort, per-isolate).
//  - Errors: upstream detail is logged, not forwarded verbatim; a mid-stream
//    upstream error aborts the stream instead of masquerading as content.
//
// Pure logic lives in ./chat-core.ts (unit-tested under vitest).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  ANTHROPIC_API,
  buildCorsHeaders,
  buildSystemBlocks,
  emailDomainAllowed,
  fixedWindowAllow,
  isStop,
  parseEvent,
  resolveDefaultModel,
  validateChatRequest,
  type RateLimitState,
} from './chat-core.ts';

const DEFAULT_MODEL = resolveDefaultModel(Deno.env.get('ANTHROPIC_MODEL'));

const ALLOWED_EMAIL_DOMAIN = 'navapbc.com';

// CORS allow-list: local dev origins plus an optional prod origin from env.
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(Deno.env.get('APP_ORIGIN') ? [Deno.env.get('APP_ORIGIN')!] : []),
];

// Per-user rate limit (best-effort; per-isolate — see chat-core.ts note).
const RATE_LIMIT = 30; // requests
const RATE_WINDOW_MS = 60_000; // per minute
const rateStore = new Map<string, RateLimitState>();

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  const cors = buildCorsHeaders(origin, ALLOWED_ORIGINS);
  const jsonError = (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...cors, 'content-type': 'application/json' },
    });

  // CORS preflight.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  if (req.method !== 'POST') {
    return jsonError('Method not allowed. Use POST.', 405);
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return jsonError('Server is misconfigured (missing API key).', 500);
  }

  // --- Authn/authz: require a real @navapbc.com user (SEC-01 / LLM-02) -------
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) {
    return jsonError('Server is misconfigured (missing Supabase env).', 500);
  }
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  const user = userData?.user;
  // The bare anon key is not a user token, so getUser fails for it.
  if (userErr || !user) {
    return jsonError('Sign in to use this feature.', 401);
  }
  if (!emailDomainAllowed(user.email, ALLOWED_EMAIL_DOMAIN)) {
    return jsonError(`Access is restricted to @${ALLOWED_EMAIL_DOMAIN} accounts.`, 403);
  }

  // --- Rate limit (LLM-01) ---------------------------------------------------
  if (!fixedWindowAllow(rateStore, user.id, Date.now(), RATE_LIMIT, RATE_WINDOW_MS)) {
    return jsonError('Rate limit exceeded. Please slow down and try again shortly.', 429);
  }

  // --- Validate + normalize input (LLM-03 / LLM-04 / LLM-08) -----------------
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonError('Invalid JSON body.', 400);
  }
  const validated = validateChatRequest(rawBody, DEFAULT_MODEL);
  if (!validated.ok) {
    return jsonError(validated.error, 400);
  }
  const { messages, system, model, max_tokens } = validated.value;

  const anthropicBody = {
    model,
    max_tokens,
    // Cache the stable system prefix to cut repeat-turn cost (LLM-09).
    ...(system ? { system: buildSystemBlocks(system) } : {}),
    messages,
    stream: true,
  };

  let upstream: Response;
  try {
    upstream = await fetch(ANTHROPIC_API.url, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_API.version,
        'content-type': 'application/json',
      },
      body: JSON.stringify(anthropicBody),
    });
  } catch (err) {
    console.error('Anthropic fetch failed:', err);
    return jsonError('Failed to reach the model provider. Please try again.', 502);
  }

  // Log the upstream detail server-side; return a generic message (SEC-05).
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    console.error(`Anthropic API error (${upstream.status}): ${detail || upstream.statusText}`);
    const status = upstream.status === 429 ? 429 : upstream.status >= 500 ? 502 : 400;
    return jsonError('The model provider returned an error. Please try again.', status);
  }

  // Re-stream: parse Anthropic's SSE and emit only the text deltas. A mid-stream
  // upstream `error` event aborts the stream (LLM-06) instead of being rendered
  // as assistant text.
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
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';

          for (const event of events) {
            const parsed = parseEvent(event);
            if (parsed?.type === 'text' && parsed.text) {
              controller.enqueue(encoder.encode(parsed.text));
            } else if (parsed?.type === 'error') {
              console.error('Anthropic stream error:', parsed.message);
              controller.error(new Error(parsed.message));
              await reader.cancel().catch(() => {});
              return;
            }
            if (isStop(event)) {
              controller.close();
              await reader.cancel().catch(() => {});
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
      ...cors,
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-cache',
    },
  });
});

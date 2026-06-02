// Supabase Edge Function: `grade` (LLM-as-judge)
//
// Server-side proxy to Anthropic. The ANTHROPIC_API_KEY lives here and is never
// exposed to the browser. Unlike `chat` (streaming text), this returns a single
// structured JSON verdict. Pure parse/validate logic is in ./verdict.ts (unit-
// tested under vitest). Auth/CORS mirror `chat`; helpers are inlined so this
// function bundles independently.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { GRADE_SYSTEM_PROMPT, buildGradeUserMessage, parseVerdict } from './verdict.ts';
import type { GradingRubric, GradeSubmission } from './verdict.ts';

const DEFAULT_MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-haiku-4-5';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const ALLOWED_EMAIL_DOMAIN = 'navapbc.com';
const MAX_TOKENS = 1024;
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(Deno.env.get('APP_ORIGIN') ? [Deno.env.get('APP_ORIGIN')!] : []),
];

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'access-control-allow-headers': 'authorization, content-type, apikey',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['access-control-allow-origin'] = origin;
  }
  return headers;
}

const RATE_LIMIT = 20; // grade requests
const RATE_WINDOW_MS = 60_000; // per minute
const rateStore = new Map<string, { count: number; windowStart: number }>();

function rateLimitAllow(userId: string, now: number): boolean {
  const state = rateStore.get(userId);
  if (!state || now - state.windowStart >= RATE_WINDOW_MS) {
    rateStore.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (state.count >= RATE_LIMIT) return false;
  state.count += 1;
  return true;
}

function emailDomainAllowed(email: string | undefined): boolean {
  return !!email && email.split('@')[1]?.toLowerCase() === ALLOWED_EMAIL_DOMAIN;
}

function isRubric(v: unknown): v is GradingRubric {
  const r = v as { anchors?: unknown };
  return (
    !!r &&
    Array.isArray(r.anchors) &&
    r.anchors.length > 0 &&
    r.anchors.every((a) => {
      const x = a as Record<string, unknown>;
      return typeof x.id === 'string' && typeof x.label === 'string' && typeof x.description === 'string';
    })
  );
}

function isSubmission(v: unknown): v is GradeSubmission {
  const s = v as Record<string, unknown>;
  return !!s && typeof s.brief === 'string' && typeof s.prompt === 'string' && typeof s.response === 'string';
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req.headers.get('Origin'));
  const jsonError = (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...cors, 'content-type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return jsonError('Method not allowed. Use POST.', 405);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return jsonError('Server is misconfigured (missing API key).', 500);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return jsonError('Server is misconfigured (missing Supabase env).', 500);

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  const user = userData?.user;
  if (userErr || !user) return jsonError('Sign in to use this feature.', 401);
  if (!emailDomainAllowed(user.email)) {
    return jsonError(`Access is restricted to @${ALLOWED_EMAIL_DOMAIN} accounts.`, 403);
  }

  if (!rateLimitAllow(user.id, Date.now())) {
    return jsonError('Rate limit exceeded. Please slow down and try again shortly.', 429);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body.', 400);
  }
  const rubric = (body as { rubric?: unknown }).rubric;
  const submission = (body as { submission?: unknown }).submission;
  if (!isRubric(rubric)) return jsonError('Invalid or missing rubric.', 400);
  if (!isSubmission(submission)) return jsonError('Invalid or missing submission.', 400);

  const anthropicBody = {
    model: DEFAULT_MODEL,
    max_tokens: MAX_TOKENS,
    temperature: 0,
    system: GRADE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildGradeUserMessage(rubric, submission) }],
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
    console.error('Anthropic fetch failed:', err);
    return jsonError('Failed to reach the model provider. Please try again.', 502);
  }
  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    console.error(`Anthropic API error (${upstream.status}): ${detail || upstream.statusText}`);
    return jsonError('The model provider returned an error. Please try again.', upstream.status === 429 ? 429 : 502);
  }

  const data = (await upstream.json().catch(() => null)) as
    | { content?: { type: string; text?: string }[] }
    | null;
  const text = data?.content?.find((b) => b.type === 'text')?.text ?? '';
  const verdict = parseVerdict(text, rubric);
  if (!verdict.ok) {
    console.error('Grade parse failed:', verdict.error);
    return jsonError('The grader returned an unexpected response. Please try again.', 502);
  }
  return new Response(JSON.stringify(verdict.value), {
    headers: { ...cors, 'content-type': 'application/json' },
  });
});

// Pure, runtime-agnostic logic for the `chat` Edge Function (no Deno, no
// network), so it can be unit-tested under vitest. The Deno-only glue (auth,
// fetch, streaming, the in-memory limiter instance) lives in index.ts and calls
// into here. Extracting this also closes the audit's "SSE parser is untested"
// coverage gap.

// --- Provider + model config (SEC-03 / LLM-03 / P6.1) -----------------------
// Single source of truth for this function. The server is authoritative: a raw
// request naming any other model is rejected, so a caller can't force an
// expensive model regardless of the UI. `provider` is the deliberate light seam
// (P6.1, D1) — Claude-only today; a second provider would be an *additive*
// entry here, not a built-out abstraction. Mirrored (not imported) in
// grade/verdict.ts so each function bundles independently under Deno; a vitest
// parity test keeps the two in sync.
export interface ModelDescriptor {
  id: string;
  provider: 'anthropic';
}

export const MODELS: ModelDescriptor[] = [
  { id: 'claude-haiku-4-5', provider: 'anthropic' },
  { id: 'claude-sonnet-4-6', provider: 'anthropic' },
];

export const MODEL_ALLOWLIST: string[] = MODELS.map((m) => m.id);

// The safe hardcoded fallback used when no (or an invalid) ANTHROPIC_MODEL env
// is configured — must itself be allow-listed.
export const FALLBACK_MODEL = 'claude-haiku-4-5';

// Anthropic Messages API endpoint + pinned wire version (was inlined in index.ts).
export const ANTHROPIC_API = {
  url: 'https://api.anthropic.com/v1/messages',
  version: '2023-06-01',
} as const;

export function isModelAllowed(model: string): boolean {
  return MODEL_ALLOWLIST.includes(model);
}

/**
 * Resolves the operator-configured default model: the env value if it's on the
 * allow-list, else the safe fallback. Stops a typo'd ANTHROPIC_MODEL from
 * sending an off-list/invalid model on requests that omit `model` (P6.1).
 */
export function resolveDefaultModel(envModel: string | undefined): string {
  return envModel && isModelAllowed(envModel) ? envModel : FALLBACK_MODEL;
}

// --- max_tokens ceiling (SEC-04 / LLM-04) -----------------------------------
export const DEFAULT_MAX_TOKENS = 1024;
export const MAX_TOKENS_CEILING = 4096;

/** Clamps a requested max_tokens to a safe positive-integer range. */
export function clampMaxTokens(requested: unknown): number {
  if (typeof requested !== 'number' || !Number.isInteger(requested) || requested <= 0) {
    return DEFAULT_MAX_TOKENS;
  }
  return Math.min(requested, MAX_TOKENS_CEILING);
}

// --- Request validation (LLM-08) --------------------------------------------
export interface NormalizedChatRequest {
  messages: { role: 'user' | 'assistant'; content: string }[];
  system?: string;
  model: string;
  max_tokens: number;
}

export type ValidationResult =
  | { ok: true; value: NormalizedChatRequest }
  | { ok: false; error: string };

// Caps to bound payload size / cost (LLM-01 / LLM-04 supporting limits).
export const MAX_MESSAGES = 50;
export const MAX_TOTAL_CONTENT_CHARS = 100_000;

/**
 * Validates and normalizes an incoming chat request body. `defaultModel` is the
 * operator-trusted fallback used when the request omits `model`.
 */
export function validateChatRequest(body: unknown, defaultModel: string): ValidationResult {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }
  const b = body as Record<string, unknown>;

  if (!Array.isArray(b.messages) || b.messages.length === 0) {
    return { ok: false, error: 'Request must include a non-empty `messages` array.' };
  }
  if (b.messages.length > MAX_MESSAGES) {
    return { ok: false, error: `Too many messages (max ${MAX_MESSAGES}).` };
  }

  let totalChars = 0;
  const messages: NormalizedChatRequest['messages'] = [];
  for (const m of b.messages) {
    if (typeof m !== 'object' || m === null) {
      return { ok: false, error: 'Each message must be an object.' };
    }
    const { role, content } = m as Record<string, unknown>;
    if (role !== 'user' && role !== 'assistant') {
      return { ok: false, error: "Each message `role` must be 'user' or 'assistant'." };
    }
    if (typeof content !== 'string' || content.length === 0) {
      return { ok: false, error: 'Each message `content` must be a non-empty string.' };
    }
    totalChars += content.length;
    messages.push({ role, content });
  }

  if (b.system !== undefined && typeof b.system !== 'string') {
    return { ok: false, error: '`system` must be a string.' };
  }

  // `system` is billed as input tokens exactly like message content, so it must
  // count against the same budget. Checking only `messages` left an unbounded
  // hole: a caller could post one tiny message plus a multi-megabyte `system`
  // and bypass the cap entirely (LLM-01/LLM-04).
  if (typeof b.system === 'string') totalChars += b.system.length;
  if (totalChars > MAX_TOTAL_CONTENT_CHARS) {
    return { ok: false, error: 'Request content is too large.' };
  }

  if (b.model !== undefined && typeof b.model !== 'string') {
    return { ok: false, error: '`model` must be a string.' };
  }
  const model = (b.model as string | undefined) ?? defaultModel;
  if (b.model !== undefined && !isModelAllowed(model)) {
    return { ok: false, error: `Unsupported model. Allowed: ${MODEL_ALLOWLIST.join(', ')}.` };
  }

  if (b.max_tokens !== undefined && typeof b.max_tokens !== 'number') {
    return { ok: false, error: '`max_tokens` must be a number.' };
  }

  return {
    ok: true,
    value: {
      messages,
      ...(typeof b.system === 'string' ? { system: b.system } : {}),
      model,
      max_tokens: clampMaxTokens(b.max_tokens),
    },
  };
}

// --- Prompt caching (LLM-09) ------------------------------------------------
export interface SystemBlock {
  type: 'text';
  text: string;
  cache_control: { type: 'ephemeral' };
}

/**
 * Builds Anthropic's structured `system` field with an ephemeral cache_control
 * breakpoint, so the (stable) system/persona prefix is served from the prompt
 * cache on repeat turns instead of re-billing full input tokens (LLM-09).
 * Returns undefined when there's no system prompt.
 */
export function buildSystemBlocks(system: string | undefined): SystemBlock[] | undefined {
  if (!system) return undefined;
  return [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
}

// --- Domain restriction (SEC-01 / LLM-02) -----------------------------------
export function emailDomainAllowed(email: string | undefined | null, domain: string): boolean {
  if (!email) return false;
  return email.split('@')[1]?.toLowerCase() === domain.toLowerCase();
}

// --- CORS allow-list (SEC-02 / LLM-12) --------------------------------------
const CORS_BASE = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  Vary: 'Origin',
};

/**
 * Returns CORS headers that echo the request Origin only when it is in the
 * allow-list (instead of a blanket `*`). An unknown/absent Origin gets no
 * allow-origin header, so the browser blocks the cross-origin read.
 */
export function buildCorsHeaders(
  origin: string | null,
  allowedOrigins: string[],
): Record<string, string> {
  if (origin && allowedOrigins.includes(origin)) {
    return { ...CORS_BASE, 'Access-Control-Allow-Origin': origin };
  }
  return { ...CORS_BASE };
}

// --- SSE parsing (LLM-06 / LLM-07) ------------------------------------------
export type ParsedEvent =
  | { type: 'text'; text: string }
  | { type: 'error'; message: string }
  | null;

/**
 * Parses a single Anthropic SSE event block. Returns a discriminated result so
 * the caller can treat an upstream `error` event as a real error (LLM-06)
 * rather than blending its message into the streamed content.
 */
export function parseEvent(event: string): ParsedEvent {
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
      return { type: 'text', text: json.delta.text ?? '' };
    }
    if (json.type === 'error') {
      return { type: 'error', message: json.error?.message ?? 'unknown upstream error' };
    }
  } catch {
    // Ignore non-JSON / partial data lines.
  }
  return null;
}

/**
 * Whether an SSE event signals the end of the stream — detected by parsing the
 * event's `event:`/`data:` type, not a fragile substring match (LLM-07).
 */
export function isStop(event: string): boolean {
  const lines = event.split('\n');
  for (const line of lines) {
    if (line.startsWith('event:') && line.slice(6).trim() === 'message_stop') return true;
    if (line.startsWith('data:')) {
      try {
        if (JSON.parse(line.slice(5).trim()).type === 'message_stop') return true;
      } catch {
        // not JSON — ignore
      }
    }
  }
  return false;
}

// --- Usage capture (P6.2) ---------------------------------------------------
// Best-effort accumulation of Anthropic token usage out of the SSE stream, so
// the Edge Function can record one claude_usage row when the stream closes —
// never inline with token delivery, never affecting the client stream.
//
// Anthropic carries usage in two events: `message_start` has the input_tokens
// (and a partial output_tokens), and the final `message_delta` has the final
// output_tokens. We take input_tokens from message_start and prefer the latest
// output_tokens seen (message_delta wins over message_start's partial). Pure +
// Deno-agnostic so it's unit-tested under vitest.
export interface UsageTotals {
  input_tokens: number;
  output_tokens: number;
}

export interface UsageAccumulator {
  input_tokens: number | null;
  output_tokens: number | null;
}

/** A fresh accumulator with nothing seen yet. */
export function newUsageAccumulator(): UsageAccumulator {
  return { input_tokens: null, output_tokens: null };
}

/**
 * Feeds one already-parsed SSE JSON event object into the accumulator, updating
 * the running input/output token counts. Tolerates missing/partial usage and
 * never throws — an event without usage is simply ignored.
 */
export function accumulateUsage(acc: UsageAccumulator, event: unknown): void {
  if (typeof event !== 'object' || event === null) return;
  const e = event as { type?: unknown; message?: unknown; usage?: unknown };

  if (e.type === 'message_start') {
    const usage = (e.message as { usage?: unknown } | undefined)?.usage as
      | { input_tokens?: unknown; output_tokens?: unknown }
      | undefined;
    if (typeof usage?.input_tokens === 'number') acc.input_tokens = usage.input_tokens;
    if (typeof usage?.output_tokens === 'number') acc.output_tokens = usage.output_tokens;
    return;
  }

  if (e.type === 'message_delta') {
    const usage = e.usage as { output_tokens?: unknown; input_tokens?: unknown } | undefined;
    if (typeof usage?.output_tokens === 'number') acc.output_tokens = usage.output_tokens;
    if (typeof usage?.input_tokens === 'number') acc.input_tokens = usage.input_tokens;
  }
}

/**
 * Finalizes an accumulator into a concrete usage pair, or null if no usage was
 * ever seen (e.g. an early upstream error). Missing halves default to 0 so a
 * partially-seen usage still records something useful.
 */
export function finalizeUsage(acc: UsageAccumulator): UsageTotals | null {
  if (acc.input_tokens === null && acc.output_tokens === null) return null;
  return {
    input_tokens: acc.input_tokens ?? 0,
    output_tokens: acc.output_tokens ?? 0,
  };
}

// --- Rate limiting (LLM-01) -------------------------------------------------
export interface RateLimitState {
  count: number;
  windowStart: number;
}

/**
 * Fixed-window limiter operating on a caller-owned Map (pure + testable). The
 * Edge Function holds the Map at module scope. NOTE: that scope is per-isolate,
 * so this is a best-effort first layer — a durable store (Postgres/Redis) is the
 * production path. Returns whether the request is allowed.
 */
export function fixedWindowAllow(
  store: Map<string, RateLimitState>,
  key: string,
  now: number,
  limit: number,
  windowMs: number,
): boolean {
  const entry = store.get(key);
  if (!entry || now - entry.windowStart >= windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}

import { describe, test, expect } from 'vitest';
import {
  accumulateUsage,
  ANTHROPIC_API,
  buildCorsHeaders,
  buildSystemBlocks,
  clampMaxTokens,
  DEFAULT_MAX_TOKENS,
  emailDomainAllowed,
  FALLBACK_MODEL,
  finalizeUsage,
  fixedWindowAllow,
  isModelAllowed,
  isStop,
  MAX_MESSAGES,
  MAX_TOTAL_CONTENT_CHARS,
  MAX_TOKENS_CEILING,
  newUsageAccumulator,
  parseEvent,
  resolveDefaultModel,
  validateChatRequest,
  type RateLimitState,
} from './chat-core';

// Unit tests for the chat Edge Function's pure logic — the testable half of the
// security/cost hardening (the Deno glue in index.ts isn't importable here).
// This also closes the audit's "Edge Function SSE parser is untested" gap.

describe('isModelAllowed (SEC-03 / LLM-03)', () => {
  test('allows the two offered models', () => {
    expect(isModelAllowed('claude-haiku-4-5')).toBe(true);
    expect(isModelAllowed('claude-sonnet-4-6')).toBe(true);
  });
  test('rejects anything else (e.g. an expensive opus model)', () => {
    expect(isModelAllowed('claude-opus-4-8')).toBe(false);
    expect(isModelAllowed('gpt-4')).toBe(false);
  });
});

describe('clampMaxTokens (SEC-04 / LLM-04)', () => {
  test('caps to the ceiling', () => {
    expect(clampMaxTokens(999_999)).toBe(MAX_TOKENS_CEILING);
  });
  test('passes a sane value through', () => {
    expect(clampMaxTokens(256)).toBe(256);
  });
  test('falls back to the default for non-positive / non-integer / non-number', () => {
    expect(clampMaxTokens(0)).toBe(DEFAULT_MAX_TOKENS);
    expect(clampMaxTokens(-5)).toBe(DEFAULT_MAX_TOKENS);
    expect(clampMaxTokens(1.5)).toBe(DEFAULT_MAX_TOKENS);
    expect(clampMaxTokens('big')).toBe(DEFAULT_MAX_TOKENS);
    expect(clampMaxTokens(undefined)).toBe(DEFAULT_MAX_TOKENS);
  });
});

describe('validateChatRequest (LLM-08)', () => {
  const ok = (body: unknown) => validateChatRequest(body, 'claude-haiku-4-5');

  test('accepts a well-formed request and normalizes model + max_tokens', () => {
    const r = ok({ messages: [{ role: 'user', content: 'hi' }], max_tokens: 999_999 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.model).toBe('claude-haiku-4-5');
      expect(r.value.max_tokens).toBe(MAX_TOKENS_CEILING);
      expect(r.value.messages).toEqual([{ role: 'user', content: 'hi' }]);
    }
  });

  test('rejects a non-object body', () => {
    expect(ok('nope').ok).toBe(false);
    expect(ok(null).ok).toBe(false);
  });

  test('rejects empty / missing messages', () => {
    expect(ok({}).ok).toBe(false);
    expect(ok({ messages: [] }).ok).toBe(false);
  });

  test('rejects too many messages', () => {
    const messages = Array.from({ length: MAX_MESSAGES + 1 }, () => ({ role: 'user', content: 'x' }));
    expect(ok({ messages }).ok).toBe(false);
  });

  test('rejects a bad role or non-string content', () => {
    expect(ok({ messages: [{ role: 'system', content: 'x' }] }).ok).toBe(false);
    expect(ok({ messages: [{ role: 'user', content: 42 }] }).ok).toBe(false);
    expect(ok({ messages: [{ role: 'user', content: '' }] }).ok).toBe(false);
  });

  test('rejects an explicitly unsupported model', () => {
    const r = ok({ messages: [{ role: 'user', content: 'hi' }], model: 'claude-opus-4-8' });
    expect(r.ok).toBe(false);
  });

  test('rejects wrong types for system / max_tokens', () => {
    expect(ok({ messages: [{ role: 'user', content: 'hi' }], system: 5 }).ok).toBe(false);
    expect(ok({ messages: [{ role: 'user', content: 'hi' }], max_tokens: 'lots' }).ok).toBe(false);
  });

  test('rejects oversized message content', () => {
    const content = 'x'.repeat(MAX_TOTAL_CONTENT_CHARS + 1);
    expect(ok({ messages: [{ role: 'user', content }] }).ok).toBe(false);
  });

  // `system` is billed as input tokens exactly like message content, so it counts
  // against the SAME budget — otherwise one tiny message plus a huge system prompt
  // sails past the cap.
  test('counts `system` toward the total content budget', () => {
    const system = 'x'.repeat(MAX_TOTAL_CONTENT_CHARS);
    expect(ok({ messages: [{ role: 'user', content: 'hi' }], system }).ok).toBe(false);
  });

  test('a system prompt within the budget still passes', () => {
    const system = 'x'.repeat(MAX_TOTAL_CONTENT_CHARS - 10);
    const r = ok({ messages: [{ role: 'user', content: 'hi' }], system });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.system).toBe(system);
  });
});

describe('buildSystemBlocks (LLM-09 — prompt caching)', () => {
  test('wraps the system prompt in a cache_control breakpoint', () => {
    expect(buildSystemBlocks('You are helpful')).toEqual([
      { type: 'text', text: 'You are helpful', cache_control: { type: 'ephemeral' } },
    ]);
  });
  test('returns undefined when there is no system prompt', () => {
    expect(buildSystemBlocks(undefined)).toBeUndefined();
    expect(buildSystemBlocks('')).toBeUndefined();
  });
});

describe('emailDomainAllowed (SEC-01)', () => {
  test('allows navapbc.com (case-insensitive), rejects others / empty', () => {
    expect(emailDomainAllowed('a@navapbc.com', 'navapbc.com')).toBe(true);
    expect(emailDomainAllowed('A@NavaPBC.com', 'navapbc.com')).toBe(true);
    expect(emailDomainAllowed('a@gmail.com', 'navapbc.com')).toBe(false);
    expect(emailDomainAllowed(undefined, 'navapbc.com')).toBe(false);
    expect(emailDomainAllowed(null, 'navapbc.com')).toBe(false);
  });
});

describe('buildCorsHeaders (SEC-02 / LLM-12)', () => {
  const allowed = ['http://localhost:3000', 'https://app.example'];
  test('echoes an allow-listed origin', () => {
    expect(buildCorsHeaders('http://localhost:3000', allowed)['Access-Control-Allow-Origin']).toBe(
      'http://localhost:3000',
    );
  });
  test('omits the allow-origin header for an unknown / absent origin (no wildcard)', () => {
    expect(buildCorsHeaders('https://evil.example', allowed)['Access-Control-Allow-Origin']).toBeUndefined();
    expect(buildCorsHeaders(null, allowed)['Access-Control-Allow-Origin']).toBeUndefined();
  });
});

describe('parseEvent (LLM-06)', () => {
  test('extracts a text delta', () => {
    const ev = 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}';
    expect(parseEvent(ev)).toEqual({ type: 'text', text: 'Hi' });
  });
  test('returns a distinguishable error result for an error event (not inline text)', () => {
    const ev = 'data: {"type":"error","error":{"message":"overloaded"}}';
    expect(parseEvent(ev)).toEqual({ type: 'error', message: 'overloaded' });
  });
  test('ignores [DONE], empty, and non-delta events', () => {
    expect(parseEvent('data: [DONE]')).toBeNull();
    expect(parseEvent('event: ping')).toBeNull();
    expect(parseEvent('data: {"type":"message_start"}')).toBeNull();
  });
});

describe('isStop (LLM-07)', () => {
  test('detects message_stop via the event: line and the data type', () => {
    expect(isStop('event: message_stop\ndata: {"type":"message_stop"}')).toBe(true);
    expect(isStop('data: {"type":"message_stop"}')).toBe(true);
  });
  test('does NOT false-positive on the literal appearing inside text content', () => {
    const ev = 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"the type is message_stop here"}}';
    expect(isStop(ev)).toBe(false);
  });
});

describe('fixedWindowAllow (LLM-01)', () => {
  test('allows up to the limit, then blocks within the window, then resets', () => {
    const store = new Map<string, RateLimitState>();
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) {
      expect(fixedWindowAllow(store, 'u1', t0 + i, 3, 1000)).toBe(true);
    }
    expect(fixedWindowAllow(store, 'u1', t0 + 10, 3, 1000)).toBe(false);
    // After the window elapses, the counter resets.
    expect(fixedWindowAllow(store, 'u1', t0 + 1001, 3, 1000)).toBe(true);
  });
  test('limits are per-key', () => {
    const store = new Map<string, RateLimitState>();
    expect(fixedWindowAllow(store, 'a', 0, 1, 1000)).toBe(true);
    expect(fixedWindowAllow(store, 'a', 1, 1, 1000)).toBe(false);
    expect(fixedWindowAllow(store, 'b', 1, 1, 1000)).toBe(true);
  });
});

describe('resolveDefaultModel (P6.1)', () => {
  test('uses an allow-listed env model when set', () => {
    expect(resolveDefaultModel('claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
  });
  test('falls back to FALLBACK_MODEL for an off-list or unset env model', () => {
    expect(resolveDefaultModel('claude-opus-4-8')).toBe(FALLBACK_MODEL);
    expect(resolveDefaultModel(undefined)).toBe(FALLBACK_MODEL);
  });
  test('FALLBACK_MODEL is itself allow-listed', () => {
    expect(isModelAllowed(FALLBACK_MODEL)).toBe(true);
  });
});

describe('usage accumulator (P6.2)', () => {
  test('message_start (input) + final message_delta (output) → correct pair', () => {
    const acc = newUsageAccumulator();
    accumulateUsage(acc, {
      type: 'message_start',
      message: { usage: { input_tokens: 120, output_tokens: 1 } },
    });
    accumulateUsage(acc, { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } });
    accumulateUsage(acc, { type: 'message_delta', usage: { output_tokens: 57 } });
    // message_delta's output_tokens wins over message_start's partial (1).
    expect(finalizeUsage(acc)).toEqual({ input_tokens: 120, output_tokens: 57 });
  });

  test('no usage events (only text deltas) → finalizer returns null', () => {
    const acc = newUsageAccumulator();
    accumulateUsage(acc, { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } });
    accumulateUsage(acc, { type: 'content_block_stop' });
    expect(finalizeUsage(acc)).toBeNull();
  });

  test('early error before any usage → finalizer returns null', () => {
    const acc = newUsageAccumulator();
    accumulateUsage(acc, { type: 'error', error: { message: 'overloaded' } });
    expect(finalizeUsage(acc)).toBeNull();
  });

  test('input seen but no output → output defaults to 0', () => {
    const acc = newUsageAccumulator();
    accumulateUsage(acc, { type: 'message_start', message: { usage: { input_tokens: 42 } } });
    expect(finalizeUsage(acc)).toEqual({ input_tokens: 42, output_tokens: 0 });
  });

  test('tolerates non-object / malformed events without throwing', () => {
    const acc = newUsageAccumulator();
    expect(() => {
      accumulateUsage(acc, null);
      accumulateUsage(acc, 'garbage');
      accumulateUsage(acc, { type: 'message_start' });
      accumulateUsage(acc, { type: 'message_delta', usage: 'nope' });
    }).not.toThrow();
    expect(finalizeUsage(acc)).toBeNull();
  });
});

describe('ANTHROPIC_API config (P6.1)', () => {
  test('exposes the messages endpoint and pinned wire version', () => {
    expect(ANTHROPIC_API.url).toBe('https://api.anthropic.com/v1/messages');
    expect(ANTHROPIC_API.version).toBe('2023-06-01');
  });
});

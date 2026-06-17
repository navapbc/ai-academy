// Pure, runtime-agnostic logic for the `review-grade` Edge Function (P5.5c). No
// Deno, no network — unit-tested under vitest. Deno glue (auth, service_role
// client, DB read/write, limiter) lives in index.ts. Helpers are self-contained
// copies (Edge Functions bundle independently — same posture as admin-cohorts-core).

export const REVIEW_DECISIONS = ['reviewed', 'returned'] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export interface ReviewAction {
  submissionId: string;
  decision: ReviewDecision;
  note: string | null;
}
export type ParseResult = { ok: true; value: ReviewAction } | { ok: false; error: string };

const NOTE_MAX = 2000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

/** Validates + normalizes the review action. Note is trimmed, bounded, optional. */
export function parseReviewAction(body: unknown): ParseResult {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }
  const b = body as Record<string, unknown>;
  if (!isUuid(b.submissionId)) {
    return { ok: false, error: '`submissionId` must be a valid uuid.' };
  }
  if (
    typeof b.decision !== 'string' ||
    !(REVIEW_DECISIONS as readonly string[]).includes(b.decision)
  ) {
    return { ok: false, error: `\`decision\` must be one of: ${REVIEW_DECISIONS.join(', ')}.` };
  }
  let note: string | null = null;
  if (b.note !== undefined && b.note !== null) {
    if (typeof b.note !== 'string') return { ok: false, error: '`note` must be a string.' };
    const trimmed = b.note.trim();
    if (trimmed.length > NOTE_MAX) {
      return { ok: false, error: `\`note\` must be at most ${NOTE_MAX} characters.` };
    }
    note = trimmed === '' ? null : trimmed;
  }
  return { ok: true, value: { submissionId: b.submissionId, decision: b.decision, note } };
}

// --- Allowlist / domain (mirrors admin-cohorts-core) ------------------------
export function isAllowlistedAdmin(
  email: string | null | undefined,
  csv: string | undefined,
): boolean {
  if (!email) return false;
  const allow = (csv ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
  return allow.includes(email.toLowerCase());
}

export function emailDomainAllowed(email: string | undefined | null, domain: string): boolean {
  if (!email) return false;
  return email.split('@')[1]?.toLowerCase() === domain.toLowerCase();
}

// --- CORS allow-list (mirrors admin-cohorts-core) ---------------------------
const CORS_BASE = {
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  vary: 'Origin',
};
export function buildCorsHeaders(
  origin: string | null,
  allowedOrigins: string[],
): Record<string, string> {
  if (origin && allowedOrigins.includes(origin)) {
    return { ...CORS_BASE, 'access-control-allow-origin': origin };
  }
  return { ...CORS_BASE };
}

// --- Rate limiting (mirrors admin-cohorts-core) -----------------------------
export interface RateLimitState {
  count: number;
  windowStart: number;
}
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

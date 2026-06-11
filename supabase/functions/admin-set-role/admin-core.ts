// Pure, runtime-agnostic logic for the `admin-set-role` Edge Function (no Deno,
// no network), unit-tested under vitest. The Deno-only glue (auth, service_role
// client, DB writes, the in-memory limiter) lives in index.ts and calls here.
// Helpers are self-contained so the function bundles independently (like grade).

export const ROLES = ['learner', 'champion', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export function isRole(v: unknown): v is Role {
  return typeof v === 'string' && (ROLES as readonly string[]).includes(v);
}

export interface SetRoleRequest {
  targetEmail: string;
  role: Role;
}

export type ParseResult =
  | { ok: true; value: SetRoleRequest }
  | { ok: false; error: string };

/** Validates + normalizes the request body. Email is trimmed + lowercased. */
export function parseSetRoleRequest(body: unknown): ParseResult {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }
  const b = body as Record<string, unknown>;
  if (typeof b.targetEmail !== 'string' || b.targetEmail.trim() === '') {
    return { ok: false, error: '`targetEmail` must be a non-empty string.' };
  }
  if (!isRole(b.role)) {
    return { ok: false, error: `\`role\` must be one of: ${ROLES.join(', ')}.` };
  }
  return { ok: true, value: { targetEmail: b.targetEmail.trim().toLowerCase(), role: b.role } };
}

/** Whether `email` is in the comma-separated bootstrap-admin allowlist. */
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

/**
 * Self-lockout guard. index.ts calls this only AFTER verifying the caller is an
 * admin, so a caller setting their own role to anything other than 'admin'
 * (i.e. champion or learner) is demoting themselves out of admin — block it.
 * Self-promotion / idempotent self-set to 'admin' is allowed (the bootstrap path).
 */
export function isSelfDemotion(callerId: string, targetId: string, newRole: Role): boolean {
  return callerId === targetId && newRole !== 'admin';
}

// emailDomainAllowed + buildCorsHeaders below are intentionally self-contained
// copies of the chat/grade helpers — Edge Functions bundle independently, so
// cross-function imports aren't viable. Keep them in sync if the originals change.
/** Email domain restriction (mirrors chat/grade). */
export function emailDomainAllowed(email: string | undefined | null, domain: string): boolean {
  if (!email) return false;
  return email.split('@')[1]?.toLowerCase() === domain.toLowerCase();
}

// --- CORS allow-list (mirrors chat-core) ---
const CORS_BASE = {
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  vary: 'Origin',
};

/** Echoes the request Origin only when it is allow-listed (no blanket `*`). */
export function buildCorsHeaders(
  origin: string | null,
  allowedOrigins: string[],
): Record<string, string> {
  if (origin && allowedOrigins.includes(origin)) {
    return { ...CORS_BASE, 'access-control-allow-origin': origin };
  }
  return { ...CORS_BASE };
}

// --- Rate limiting (mirrors chat-core's fixedWindowAllow so the limiter is
// unit-tested instead of re-implemented inline in index.ts). Fixed-window over
// a caller-owned Map; per-isolate, best-effort first layer. ---
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

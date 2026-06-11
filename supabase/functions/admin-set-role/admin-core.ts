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

/** Caller stripping their OWN admin (target is self and the new role isn't admin). */
export function isSelfDemotion(callerId: string, targetId: string, newRole: Role): boolean {
  return callerId === targetId && newRole !== 'admin';
}

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

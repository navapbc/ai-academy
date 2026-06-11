// Supabase Edge Function: `admin-set-role`
//
// The only sanctioned path to set profiles.role. The W2-2 trigger
// (prevent_self_role_change) blocks role changes from the authenticated/anon
// PostgREST path, so role assignment must run as service_role — which lives
// here and is never exposed to the browser. An admin calls this to set another
// user's role; the first admin bootstraps via the BOOTSTRAP_ADMIN_EMAILS env
// allowlist. Auth/CORS/rate-limit mirror chat/grade; pure logic is in
// ./admin-core.ts (unit-tested under vitest).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  buildCorsHeaders,
  emailDomainAllowed,
  isAllowlistedAdmin,
  isSelfDemotion,
  parseSetRoleRequest,
} from './admin-core.ts';

const ALLOWED_EMAIL_DOMAIN = 'navapbc.com';
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(Deno.env.get('APP_ORIGIN') ? [Deno.env.get('APP_ORIGIN')!] : []),
];

const RATE_LIMIT = 20; // requests
const RATE_WINDOW_MS = 60_000; // per minute (per-isolate, best-effort — mirrors grade)
const rateStore = new Map<string, { count: number; windowStart: number }>();
function rateLimitAllow(userId: string, now: number): boolean {
  const s = rateStore.get(userId);
  if (!s || now - s.windowStart >= RATE_WINDOW_MS) {
    rateStore.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (s.count >= RATE_LIMIT) return false;
  s.count += 1;
  return true;
}

Deno.serve(async (req: Request) => {
  const cors = buildCorsHeaders(req.headers.get('Origin'), ALLOWED_ORIGINS);
  const jsonError = (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...cors, 'content-type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return jsonError('Method not allowed. Use POST.', 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonError('Server is misconfigured (missing Supabase env).', 500);
  }

  // --- Authn: a real signed-in @navapbc.com user (bare anon key 401s) ---
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser();
  const caller = userData?.user;
  if (userErr || !caller) return jsonError('Sign in to use this feature.', 401);
  if (!emailDomainAllowed(caller.email, ALLOWED_EMAIL_DOMAIN)) {
    return jsonError(`Access is restricted to @${ALLOWED_EMAIL_DOMAIN} accounts.`, 403);
  }

  if (!rateLimitAllow(caller.id, Date.now())) {
    return jsonError('Rate limit exceeded. Please slow down and try again shortly.', 429);
  }

  // --- Validate body ---
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonError('Invalid JSON body.', 400);
  }
  const parsed = parseSetRoleRequest(rawBody);
  if (!parsed.ok) return jsonError(parsed.error, 400);
  const { targetEmail, role } = parsed.value;

  // service_role client: bypasses owner RLS + the W2-2 trigger (the whole point).
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- Authz: caller must be admin (env allowlist OR profiles.role='admin') ---
  let callerIsAdmin = isAllowlistedAdmin(caller.email, Deno.env.get('BOOTSTRAP_ADMIN_EMAILS'));
  if (!callerIsAdmin) {
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .maybeSingle();
    callerIsAdmin = callerProfile?.role === 'admin';
  }
  if (!callerIsAdmin) return jsonError('Only an admin may set roles.', 403);

  // --- Resolve the target by email ---
  const { data: target, error: targetErr } = await admin
    .from('profiles')
    .select('id, role')
    .eq('email', targetEmail)
    .maybeSingle();
  if (targetErr) {
    console.error('Target lookup failed:', targetErr.message);
    return jsonError('Failed to look up the target user.', 500);
  }
  if (!target) return jsonError(`No profile found for ${targetEmail}.`, 404);

  // --- Guardrail: block self-demotion (self-promotion stays allowed) ---
  if (isSelfDemotion(caller.id, target.id as string, role)) {
    return jsonError('You cannot change your own admin role. Ask another admin.', 422);
  }

  const oldRole = (target.role as string) ?? null;

  // --- Apply the role change as service_role (the trigger permits this path) ---
  const { error: updErr } = await admin.from('profiles').update({ role }).eq('id', target.id);
  if (updErr) {
    console.error('Role update failed:', updErr.message);
    return jsonError('Failed to update the role.', 500);
  }

  // --- Audit (best-effort: the role change is the primary, already-applied effect) ---
  const { error: auditErr } = await admin.from('role_changes').insert({
    actor_id: caller.id,
    actor_email: caller.email ?? null,
    target_id: target.id,
    target_email: targetEmail,
    old_role: oldRole,
    new_role: role,
  });
  if (auditErr) console.error('Audit insert failed:', auditErr.message);

  return new Response(
    JSON.stringify({ ok: true, targetId: target.id, oldRole, newRole: role }),
    { headers: { ...cors, 'content-type': 'application/json' } },
  );
});

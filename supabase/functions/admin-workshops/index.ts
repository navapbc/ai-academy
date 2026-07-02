// Supabase Edge Function: `admin-workshops` (X.3 Unit 2)
//
// The sanctioned write path for the `workshops` table, which has NO client-write
// RLS — all mutations run as service_role, which lives here and is never exposed
// to the browser. An admin calls this to create/update/delete admin-authored
// workshops (ordered paths through existing published modules). Authn/CORS/
// rate-limit/authz mirror admin-cohorts; pure parse/validate logic is in
// ./admin-workshops-core.ts (unit-tested under vitest).
//
// Server-authoritative step check: before create/update, every stepCellId must
// reference an existing PUBLISHED, non-archived module (public.modules); unknown
// or unpublished ids are rejected 400 with the offending ids listed. The pure
// array-shape validation (strings, no dupes, bounded) stays in core; this DB
// existence/published check must run here because it needs the database.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import {
  buildCorsHeaders,
  emailDomainAllowed,
  fixedWindowAllow,
  isAllowlistedAdmin,
  parseWorkshopAction,
  type RateLimitState,
  type WorkshopAction,
} from './admin-workshops-core.ts';

const ALLOWED_EMAIL_DOMAIN = 'navapbc.com';
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(Deno.env.get('APP_ORIGIN') ? [Deno.env.get('APP_ORIGIN')!] : []),
];

const RATE_LIMIT = 30; // requests
const RATE_WINDOW_MS = 60_000; // per minute (per-isolate, best-effort — mirrors admin-cohorts)
const rateStore = new Map<string, RateLimitState>();

type ApplyResult = { error: string } | { error: null; notFound?: boolean };

/**
 * Verifies every step cell id references an existing published, non-archived
 * module. Returns the subset of ids that are unknown/unpublished (empty = all OK).
 */
async function findUnpublishedSteps(
  admin: SupabaseClient,
  stepCellIds: string[],
): Promise<{ unknown: string[] } | { error: string }> {
  if (stepCellIds.length === 0) return { unknown: [] };
  const { data, error } = await admin
    .from('modules')
    .select('cell_id')
    .in('cell_id', stepCellIds)
    .eq('status', 'published')
    .is('archived_at', null);
  if (error) return { error: error.message };
  const publishedIds = new Set((data ?? []).map((r) => (r as { cell_id: string }).cell_id));
  return { unknown: stepCellIds.filter((id) => !publishedIds.has(id)) };
}

/** Applies one validated action via the service_role client. */
async function applyAction(
  admin: SupabaseClient,
  callerId: string,
  action: WorkshopAction,
): Promise<ApplyResult> {
  switch (action.action) {
    case 'create': {
      const { error } = await admin.from('workshops').insert({
        title: action.title,
        intro: action.intro,
        step_cell_ids: action.stepCellIds,
        created_by: callerId,
      });
      return error ? { error: error.message } : { error: null };
    }
    case 'update': {
      const { data, error } = await admin
        .from('workshops')
        .update({
          title: action.title,
          intro: action.intro,
          step_cell_ids: action.stepCellIds,
          updated_at: new Date().toISOString(),
        })
        .eq('id', action.id)
        .select('id');
      if (error) return { error: error.message };
      if (!data || data.length === 0) return { error: null, notFound: true };
      return { error: null };
    }
    case 'delete': {
      const { data, error } = await admin
        .from('workshops')
        .delete()
        .eq('id', action.id)
        .select('id');
      if (error) return { error: error.message };
      if (!data || data.length === 0) return { error: null, notFound: true };
      return { error: null };
    }
  }
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

  if (!fixedWindowAllow(rateStore, caller.id, Date.now(), RATE_LIMIT, RATE_WINDOW_MS)) {
    return jsonError('Rate limit exceeded. Please slow down and try again shortly.', 429);
  }

  // --- Validate body (shape only; DB existence check is below) ---
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonError('Invalid JSON body.', 400);
  }
  const parsed = parseWorkshopAction(rawBody);
  if (!parsed.ok) return jsonError(parsed.error, 400);
  const action = parsed.value;

  // service_role client: bypasses the (write-less) RLS on the workshops table.
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
  if (!callerIsAdmin) return jsonError('Only an admin may manage workshops.', 403);

  // --- Server-authoritative step check: every step must be an existing
  // published, non-archived module. Runs on create/update (delete has no steps).
  if (action.action === 'create' || action.action === 'update') {
    const check = await findUnpublishedSteps(admin, action.stepCellIds);
    if ('error' in check) {
      console.error('Step cell_id lookup failed:', check.error);
      return jsonError('Failed to validate workshop steps.', 500);
    }
    if (check.unknown.length > 0) {
      return jsonError(
        `These steps do not reference an existing published module: ${check.unknown.join(', ')}.`,
        400,
      );
    }
  }

  // --- Apply the mutation as service_role ---
  const result = await applyAction(admin, caller.id, action);
  if (result.error) {
    console.error(`Workshop action '${action.action}' failed:`, result.error);
    return jsonError('Failed to apply the workshop change.', 500);
  }
  if (result.notFound) {
    return jsonError('No workshop found for that id.', 404);
  }

  return new Response(JSON.stringify({ ok: true, action: action.action }), {
    headers: { ...cors, 'content-type': 'application/json' },
  });
});

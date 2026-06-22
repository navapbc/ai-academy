// Supabase Edge Function: `admin-content` (P5.4-1)
//
// The sanctioned write path for lesson content (the `modules` table), which has
// NO client-write RLS — all mutations run as service_role, which lives here and
// is never exposed to the browser. An admin calls this to save a draft, publish
// (promote draft → live + bump version), archive (soft-delete), and restore a
// lesson. Authn/CORS/rate-limit/authz mirror admin-cohorts; pure logic + the
// write-time JSON validators are in ./admin-content-core.ts (vitest-tested).
//
// Draft → publish spine: learners read the LIVE columns; the CMS reads/writes the
// `draft` jsonb working copy. Publish copies draft → live, sets status='published',
// bumps version absolutely (DATA-05), and nulls draft — one atomic UPDATE.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import {
  buildCorsHeaders,
  buildCustomInsert,
  buildPublishUpdate,
  emailDomainAllowed,
  fixedWindowAllow,
  isAllowlistedAdmin,
  parseContentAction,
  type ContentAction,
  type RateLimitState,
} from './admin-content-core.ts';

const ALLOWED_EMAIL_DOMAIN = 'navapbc.com';
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(Deno.env.get('APP_ORIGIN') ? [Deno.env.get('APP_ORIGIN')!] : []),
];

const RATE_LIMIT = 60; // requests
const RATE_WINDOW_MS = 60_000; // per minute (per-isolate, best-effort — mirrors admin-cohorts)
const rateStore = new Map<string, RateLimitState>();

type ApplyResult = { error: string; status?: number } | { error: null; detail: Record<string, unknown> };

/** Applies one validated action via the service_role client. */
async function applyAction(
  admin: SupabaseClient,
  callerId: string,
  action: ContentAction,
): Promise<ApplyResult> {
  const stamp = { updated_by: callerId, updated_at: new Date().toISOString() };

  // create-custom is the only action without an incoming cellId — it generates a
  // collision-free `custom-<slug>` id and inserts a fresh draft row (R2). It needs
  // the existing ids (collision guard) + the current max sort_order, not a
  // single-row fetch, so it is handled before the existence check below.
  if (action.action === 'create-custom') {
    const { data: all, error: listErr } = await admin.from('modules').select('cell_id, sort_order');
    if (listErr) return { error: listErr.message };
    const ids = (all ?? []).map((r) => r.cell_id as string);
    const maxSortOrder = (all ?? []).reduce(
      (m, r) => Math.max(m, (r.sort_order as number) ?? 0),
      0,
    );
    const insert = buildCustomInsert(action.title, action.type, ids, maxSortOrder, callerId, stamp.updated_at);
    const { error } = await admin.from('modules').insert(insert);
    return error ? { error: error.message } : { error: null, detail: { cellId: insert.cell_id } };
  }

  // Every other action targets an existing module — fetch it once (existence + version/draft).
  const { data: row, error: readErr } = await admin
    .from('modules')
    .select('cell_id, version, draft, archived_at')
    .eq('cell_id', action.cellId)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!row) return { error: 'No lesson found for that id.', status: 404 };

  switch (action.action) {
    case 'save-draft': {
      // Write the working copy only — live columns + status stay untouched, so
      // learners keep seeing the last-published content (R3).
      const { error } = await admin
        .from('modules')
        .update({ draft: action.draft, ...stamp })
        .eq('cell_id', action.cellId);
      return error ? { error: error.message } : { error: null, detail: {} };
    }
    case 'publish': {
      const draft = row.draft as Record<string, unknown> | null;
      if (!draft || Object.keys(draft).length === 0) {
        return { error: 'No draft to publish for that lesson.', status: 400 };
      }
      const update = buildPublishUpdate(draft, (row.version as number) ?? 1);
      const { error } = await admin
        .from('modules')
        .update({ ...update, ...stamp })
        .eq('cell_id', action.cellId);
      return error ? { error: error.message } : { error: null, detail: { version: update.version } };
    }
    case 'archive': {
      const { error } = await admin
        .from('modules')
        .update({ archived_at: new Date().toISOString(), ...stamp })
        .eq('cell_id', action.cellId);
      return error ? { error: error.message } : { error: null, detail: {} };
    }
    case 'restore': {
      const { error } = await admin
        .from('modules')
        .update({ archived_at: null, ...stamp })
        .eq('cell_id', action.cellId);
      return error ? { error: error.message } : { error: null, detail: {} };
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

  // --- Validate body ---
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonError('Invalid JSON body.', 400);
  }
  const parsed = parseContentAction(rawBody);
  if (!parsed.ok) return jsonError(parsed.error, 400);
  const action = parsed.value;

  // service_role client: bypasses the (write-less) RLS on modules.
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
  if (!callerIsAdmin) return jsonError('Only an admin may edit content.', 403);

  // --- Apply the mutation as service_role ---
  const result = await applyAction(admin, caller.id, action);
  if (result.error) {
    if (result.status && result.status < 500) return jsonError(result.error, result.status);
    console.error(`Content action '${action.action}' failed:`, result.error);
    return jsonError('Failed to apply the content change.', 500);
  }

  // --- Audit (best-effort: the mutation is the primary, already-applied effect) ---
  // create-custom has no incoming cellId — the generated one comes back in detail.
  const auditCellId =
    action.action === 'create-custom'
      ? ((result.detail.cellId as string | undefined) ?? null)
      : action.cellId;
  const { error: auditErr } = await admin.from('content_changes').insert({
    actor_id: caller.id,
    actor_email: caller.email?.toLowerCase() ?? null,
    action: action.action,
    cell_id: auditCellId,
    detail: result.detail,
  });
  if (auditErr) console.error('Audit insert failed:', auditErr.message);

  return new Response(JSON.stringify({ ok: true, action: action.action, ...result.detail }), {
    headers: { ...cors, 'content-type': 'application/json' },
  });
});

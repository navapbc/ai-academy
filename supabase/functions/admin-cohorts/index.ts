// Supabase Edge Function: `admin-cohorts` (P5.5a; multi-enrollment + lifecycle U5)
//
// The sanctioned write path for the cohort substrate (cohorts / enrollments /
// cohort_champions), which has NO client-write RLS — all mutations run as
// service_role, which lives here and is never exposed to the browser. An admin
// calls this to create/rename/archive/delete cohorts, enroll/unenroll learners
// (a learner may hold one enrollment per cohort — enrolling into a second
// cohort ADDS a membership, it never moves one), and assign/unassign champions.
// Authn/CORS/rate-limit/authz mirror admin-set-role; pure logic is in
// ./admin-cohorts-core.ts (unit-tested under vitest).
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import {
  buildCorsHeaders,
  deleteCohortBlockedReason,
  emailDomainAllowed,
  fixedWindowAllow,
  isAllowlistedAdmin,
  parseCohortAction,
  roleAfterAssign,
  roleAfterUnassign,
  type CohortAction,
  type RateLimitState,
} from './admin-cohorts-core.ts';

const ALLOWED_EMAIL_DOMAIN = 'navapbc.com';
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(Deno.env.get('APP_ORIGIN') ? [Deno.env.get('APP_ORIGIN')!] : []),
];

const RATE_LIMIT = 30; // requests
const RATE_WINDOW_MS = 60_000; // per minute (per-isolate, best-effort — mirrors admin-set-role)
const rateStore = new Map<string, RateLimitState>();

// A role change applied as a side effect of (un)assigning a champion, so the
// caller can audit it to role_changes.
interface RoleChange {
  targetId: string;
  oldRole: string | null;
  newRole: string;
}
// `status` (< 500) marks a client-facing rejection whose message is safe to
// surface verbatim (e.g. the 409 delete guard); without it the caller gets the
// generic 500.
type ApplyResult =
  | { error: string; status?: number }
  | { error: null; roleChange?: RoleChange };

/** Applies one validated action via the service_role client. */
async function applyAction(
  admin: SupabaseClient,
  callerId: string,
  action: CohortAction,
): Promise<ApplyResult> {
  switch (action.action) {
    case 'create_cohort': {
      const { error } = await admin.from('cohorts').insert({ name: action.name, created_by: callerId });
      return error ? { error: error.message } : { error: null };
    }
    case 'rename_cohort': {
      // `.select()` so a rename that matched NO row 404s instead of reporting
      // success — an admin renaming an already-deleted cohort was told "saved"
      // while nothing changed (mirrors update_week in admin-courses).
      const { data, error } = await admin
        .from('cohorts')
        .update({ name: action.name })
        .eq('id', action.cohortId)
        .select('id');
      if (error) return { error: error.message };
      if (!data || data.length === 0) return { error: 'No cohort found for that id.', status: 404 };
      return { error: null };
    }
    case 'archive_cohort': {
      // Archive = read-only end-of-cohort marker. Deliberately touches NEITHER
      // enrollments (alumni keep program access) NOR cohort_champions (the
      // champion keeps read access to the cohort they ran; archive never
      // demotes — only explicit unassign does). Idempotent: the `is null`
      // filter makes a second archive a no-op that preserves the original
      // archived_at timestamp.
      //
      // Existence is checked separately BECAUSE of that idempotency: a zero-row
      // update means "already archived" (success) or "no such cohort" (404), and
      // the filtered UPDATE alone can't tell them apart.
      const { data: cohort, error: lookupErr } = await admin
        .from('cohorts')
        .select('id')
        .eq('id', action.cohortId)
        .maybeSingle();
      if (lookupErr) return { error: lookupErr.message };
      if (!cohort) return { error: 'No cohort found for that id.', status: 404 };
      const { error } = await admin
        .from('cohorts')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', action.cohortId)
        .is('archived_at', null);
      return error ? { error: error.message } : { error: null };
    }
    case 'delete_cohort': {
      // U5 guard: hard delete only at zero enrollments — otherwise 409 with the
      // count, pointing the admin at archive_cohort. A zero-enrollment delete
      // still cascades its cohort_champions rows (FK on delete cascade); that
      // does NOT demote the champions (no role write here — same posture as
      // archive; demotion is only ever the explicit-unassign path).
      const { count, error: countErr } = await admin
        .from('enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('cohort_id', action.cohortId);
      if (countErr) return { error: countErr.message };
      const blocked = deleteCohortBlockedReason(count ?? 0);
      if (blocked) return { error: blocked, status: 409 };
      const { error } = await admin.from('cohorts').delete().eq('id', action.cohortId);
      return error ? { error: error.message } : { error: null };
    }
    case 'enroll_learner': {
      // Multi-enrollment (U5): one row per (user, cohort) — enrolling into a
      // second cohort ADDS a row; re-enrolling into the same cohort is an
      // idempotent upsert on the (user_id, cohort_id) unique pair. Archived
      // cohorts are read-only: reject rather than silently grow an archived
      // roster (the UI also excludes them from the picker).
      const { data: cohort, error: cohortErr } = await admin
        .from('cohorts')
        .select('archived_at')
        .eq('id', action.cohortId)
        .maybeSingle();
      if (cohortErr) return { error: cohortErr.message };
      if (!cohort) return { error: 'No cohort found for that id.', status: 404 };
      if (cohort.archived_at) {
        return { error: 'This cohort is archived and read-only.', status: 409 };
      }
      const { error } = await admin
        .from('enrollments')
        .upsert(
          { user_id: action.userId, cohort_id: action.cohortId, enrolled_by: callerId },
          { onConflict: 'user_id,cohort_id' },
        );
      return error ? { error: error.message } : { error: null };
    }
    case 'unenroll_learner': {
      // Cohort-scoped (U5): removes exactly the named membership; the learner's
      // enrollments in other cohorts are untouched.
      const { error } = await admin
        .from('enrollments')
        .delete()
        .eq('user_id', action.userId)
        .eq('cohort_id', action.cohortId);
      return error ? { error: error.message } : { error: null };
    }
    case 'assign_champion': {
      const { error } = await admin
        .from('cohort_champions')
        .upsert(
          { cohort_id: action.cohortId, user_id: action.userId, assigned_by: callerId },
          { onConflict: 'cohort_id,user_id' },
        );
      if (error) return { error: error.message };
      // Auto-grant the champion role to a plain learner so the assignment takes
      // effect (they can reach the staff area). Champion/admin are left as-is.
      const { data: prof } = await admin
        .from('profiles')
        .select('role')
        .eq('id', action.userId)
        .maybeSingle();
      const oldRole = (prof?.role as string) ?? null;
      const newRole = roleAfterAssign(oldRole);
      if (newRole) {
        const { error: rErr } = await admin.from('profiles').update({ role: newRole }).eq('id', action.userId);
        if (rErr) return { error: rErr.message };
        return { error: null, roleChange: { targetId: action.userId, oldRole, newRole } };
      }
      return { error: null };
    }
    case 'unassign_champion': {
      const { error } = await admin
        .from('cohort_champions')
        .delete()
        .eq('cohort_id', action.cohortId)
        .eq('user_id', action.userId);
      if (error) return { error: error.message };
      // Demote back to learner only if this was their LAST cohort and they are a
      // champion (never demote an admin; keep the role if they lead other cohorts).
      // delete-then-count is correct for a single request. Best-effort under
      // concurrency: two simultaneous unassigns of a champion's final two cohorts
      // could each still see a remaining row and skip the demote, leaving a stale
      // (harmless, never-admin) champion role that self-heals on the next unassign.
      // Acceptable on this admin-only, low-concurrency surface.
      const { count, error: cErr } = await admin
        .from('cohort_champions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', action.userId);
      if (cErr) return { error: cErr.message };
      const { data: prof } = await admin
        .from('profiles')
        .select('role')
        .eq('id', action.userId)
        .maybeSingle();
      const oldRole = (prof?.role as string) ?? null;
      const newRole = roleAfterUnassign(oldRole, count ?? 0);
      if (newRole) {
        const { error: rErr } = await admin.from('profiles').update({ role: newRole }).eq('id', action.userId);
        if (rErr) return { error: rErr.message };
        return { error: null, roleChange: { targetId: action.userId, oldRole, newRole } };
      }
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

  // --- Validate body ---
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonError('Invalid JSON body.', 400);
  }
  const parsed = parseCohortAction(rawBody);
  if (!parsed.ok) return jsonError(parsed.error, 400);
  const action = parsed.value;

  // service_role client: bypasses the (write-less) RLS on the cohort tables.
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
  if (!callerIsAdmin) return jsonError('Only an admin may manage cohorts.', 403);

  // --- Target validation: granting actions (enroll/assign) must target a real
  // profile, so a stray-but-syntactically-valid uuid can't be granted membership/
  // champion rights (and the caller gets a clear 404 instead of a swallowed FK 500).
  if (action.action === 'enroll_learner' || action.action === 'assign_champion') {
    const { data: targetProfile, error: lookupErr } = await admin
      .from('profiles')
      .select('id')
      .eq('id', action.userId)
      .maybeSingle();
    if (lookupErr) {
      console.error('Target profile lookup failed:', lookupErr.message);
      return jsonError('Failed to look up the target user.', 500);
    }
    if (!targetProfile) return jsonError('No profile found for that user.', 404);
  }

  // --- Apply the mutation as service_role ---
  const result = await applyAction(admin, caller.id, action);
  if (result.error) {
    console.error(`Cohort action '${action.action}' failed:`, result.error);
    // 4xx rejections (e.g. the delete-with-enrollments 409) carry a message
    // written for the admin; DB errors stay behind the generic 500.
    if (result.status && result.status < 500) return jsonError(result.error, result.status);
    return jsonError('Failed to apply the cohort change.', 500);
  }

  // --- Audit (best-effort: the mutation is the primary, already-applied effect) ---
  const cohortId = 'cohortId' in action ? action.cohortId : null;
  const targetUser = 'userId' in action ? action.userId : null;
  const detail = 'name' in action ? { name: action.name } : null;
  const { error: auditErr } = await admin.from('cohort_changes').insert({
    actor_id: caller.id,
    actor_email: caller.email?.toLowerCase() ?? null,
    action: action.action,
    cohort_id: cohortId,
    target_user: targetUser,
    detail,
  });
  if (auditErr) console.error('Audit insert failed:', auditErr.message);

  // A champion (un)assignment can flip profiles.role as a side effect — record it
  // in the role_changes audit (the canonical role-change log, P5.1a), best-effort.
  if (result.roleChange) {
    const { error: roleAuditErr } = await admin.from('role_changes').insert({
      actor_id: caller.id,
      actor_email: caller.email?.toLowerCase() ?? null,
      target_id: result.roleChange.targetId,
      target_email: null,
      old_role: result.roleChange.oldRole,
      new_role: result.roleChange.newRole,
    });
    if (roleAuditErr) console.error('Role audit insert failed:', roleAuditErr.message);
  }

  return new Response(JSON.stringify({ ok: true, action: action.action }), {
    headers: { ...cors, 'content-type': 'application/json' },
  });
});

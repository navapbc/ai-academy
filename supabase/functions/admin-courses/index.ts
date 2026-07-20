// Supabase Edge Function: `admin-courses` (cohort-restructure U3)
//
// The sanctioned write path for the course structure tables (course_weeks /
// course_week_modules), which have NO client-write RLS — all mutations run as
// service_role, which lives here and is never exposed to the browser. An admin
// calls this to create/rename/reorder/delete course weeks and to assign/
// unassign/reorder published modules within a week. Authn/CORS/rate-limit/authz
// mirror admin-cohorts; pure parse/validate logic is in
// ./admin-courses-core.ts (unit-tested under vitest).
//
// Server-authoritative referential checks: assign_module requires an existing PUBLISHED,
// non-archived module not already in another week (unique(cell_id) — 400 names
// the offender); delete_week requires an empty week (409 otherwise). The other
// direction — archive refuses while a week membership exists — lives in
// admin-content. Restoring an archived module deliberately does NOT auto-rejoin
// a week: unassignment is permanent until an admin re-assigns.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import {
  assignmentBlockedReason,
  buildCorsHeaders,
  deleteWeekBlockedReason,
  emailDomainAllowed,
  fixedWindowAllow,
  isAllowlistedAdmin,
  parseCourseAction,
  reorderMismatchReason,
  type CourseAction,
  type RateLimitState,
} from './admin-courses-core.ts';

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

// `status` (< 500) marks a client-facing rejection whose message is safe to
// surface verbatim (e.g. the 409 delete guard, the named-offender 400s);
// without it the caller gets the generic 500.
type ApplyResult = { error: string; status?: number } | { error: null };

/** Applies one validated action via the service_role client. */
async function applyAction(admin: SupabaseClient, action: CourseAction): Promise<ApplyResult> {
  switch (action.action) {
    case 'create_week': {
      const { data: course, error: courseErr } = await admin
        .from('courses')
        .select('id')
        .eq('id', action.courseId)
        .maybeSingle();
      if (courseErr) return { error: courseErr.message };
      if (!course) return { error: 'No course found for that id.', status: 404 };

      // New weeks land after every existing week of the course.
      const { data: weeks, error: weeksErr } = await admin
        .from('course_weeks')
        .select('sort_order')
        .eq('course_id', action.courseId);
      if (weeksErr) return { error: weeksErr.message };
      const maxSort = (weeks ?? []).reduce(
        (m, w) => Math.max(m, (w.sort_order as number) ?? 0),
        -1,
      );
      const { error } = await admin.from('course_weeks').insert({
        course_id: action.courseId,
        title: action.title,
        subtitle: action.subtitle,
        sort_order: maxSort + 1,
      });
      return error ? { error: error.message } : { error: null };
    }
    case 'update_week': {
      const { data, error } = await admin
        .from('course_weeks')
        .update({ title: action.title, subtitle: action.subtitle })
        .eq('id', action.weekId)
        .select('id');
      if (error) return { error: error.message };
      if (!data || data.length === 0) return { error: 'No week found for that id.', status: 404 };
      return { error: null };
    }
    case 'reorder_weeks': {
      // The ordered list must be exactly the course's current weeks — reorder
      // only ever permutes sort_order (a stale list can't drop/steal weeks).
      const { data: weeks, error: weeksErr } = await admin
        .from('course_weeks')
        .select('id')
        .eq('course_id', action.courseId);
      if (weeksErr) return { error: weeksErr.message };
      const mismatch = reorderMismatchReason(
        "the course's current weeks",
        (weeks ?? []).map((w) => w.id as string),
        action.weekIds,
      );
      if (mismatch) return { error: mismatch, status: 400 };
      for (let i = 0; i < action.weekIds.length; i++) {
        const { error } = await admin
          .from('course_weeks')
          .update({ sort_order: i })
          .eq('id', action.weekIds[i]);
        if (error) return { error: error.message };
      }
      return { error: null };
    }
    case 'delete_week': {
      // U3 guard: only an EMPTY week may be deleted — otherwise 409 pointing the
      // admin at unassign (deleting a populated week via the membership cascade
      // would silently unassign its modules).
      const { count, error: countErr } = await admin
        .from('course_week_modules')
        .select('cell_id', { count: 'exact', head: true })
        .eq('week_id', action.weekId);
      if (countErr) return { error: countErr.message };
      const blocked = deleteWeekBlockedReason(count ?? 0);
      if (blocked) return { error: blocked, status: 409 };
      const { data, error } = await admin
        .from('course_weeks')
        .delete()
        .eq('id', action.weekId)
        .select('id');
      if (error) return { error: error.message };
      if (!data || data.length === 0) return { error: 'No week found for that id.', status: 404 };
      return { error: null };
    }
    case 'assign_module': {
      // Referential check: the
      // module must exist, be published, non-archived, and not already belong to
      // a week (unique(cell_id)). 400 names the offender.
      const { data: mod, error: modErr } = await admin
        .from('modules')
        .select('cell_id, status, archived_at')
        .eq('cell_id', action.cellId)
        .maybeSingle();
      if (modErr) return { error: modErr.message };
      const { data: membership, error: memErr } = await admin
        .from('course_week_modules')
        .select('week_id, course_weeks(title)')
        .eq('cell_id', action.cellId)
        .maybeSingle();
      if (memErr) return { error: memErr.message };
      const assignedWeekTitle = membership
        ? ((membership.course_weeks as { title?: string } | null)?.title ?? 'another week')
        : null;
      const blocked = assignmentBlockedReason(
        action.cellId,
        mod
          ? {
              status: mod.status as string,
              archivedAt: (mod.archived_at as string | null) ?? null,
              assignedWeekTitle,
            }
          : null,
      );
      if (blocked) return { error: blocked, status: 400 };

      const { data: week, error: weekErr } = await admin
        .from('course_weeks')
        .select('id')
        .eq('id', action.weekId)
        .maybeSingle();
      if (weekErr) return { error: weekErr.message };
      if (!week) return { error: 'No week found for that id.', status: 404 };

      // New members land after every existing member of the week.
      const { data: members, error: membersErr } = await admin
        .from('course_week_modules')
        .select('sort_order')
        .eq('week_id', action.weekId);
      if (membersErr) return { error: membersErr.message };
      const maxSort = (members ?? []).reduce(
        (m, r) => Math.max(m, (r.sort_order as number) ?? 0),
        -1,
      );
      const { error } = await admin.from('course_week_modules').insert({
        week_id: action.weekId,
        cell_id: action.cellId,
        sort_order: maxSort + 1,
      });
      return error ? { error: error.message } : { error: null };
    }
    case 'unassign_module': {
      const { data, error } = await admin
        .from('course_week_modules')
        .delete()
        .eq('cell_id', action.cellId)
        .select('cell_id');
      if (error) return { error: error.message };
      if (!data || data.length === 0) {
        return { error: 'That module is not assigned to any week.', status: 404 };
      }
      return { error: null };
    }
    case 'reorder_week_modules': {
      // Same exact-set rule as reorder_weeks, scoped to the week's members.
      const { data: members, error: membersErr } = await admin
        .from('course_week_modules')
        .select('cell_id')
        .eq('week_id', action.weekId);
      if (membersErr) return { error: membersErr.message };
      const mismatch = reorderMismatchReason(
        "the week's current modules",
        (members ?? []).map((r) => r.cell_id as string),
        action.cellIds,
      );
      if (mismatch) return { error: mismatch, status: 400 };
      for (let i = 0; i < action.cellIds.length; i++) {
        const { error } = await admin
          .from('course_week_modules')
          .update({ sort_order: i })
          .eq('week_id', action.weekId)
          .eq('cell_id', action.cellIds[i]);
        if (error) return { error: error.message };
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

  // --- Validate body (shape only; DB referential checks are in applyAction) ---
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonError('Invalid JSON body.', 400);
  }
  const parsed = parseCourseAction(rawBody);
  if (!parsed.ok) return jsonError(parsed.error, 400);
  const action = parsed.value;

  // service_role client: bypasses the (write-less) RLS on the structure tables.
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
  if (!callerIsAdmin) return jsonError('Only an admin may manage courses.', 403);

  // --- Apply the mutation as service_role ---
  const result = await applyAction(admin, action);
  if (result.error) {
    console.error(`Course action '${action.action}' failed:`, result.error);
    // 4xx rejections (named-offender 400s, the 409 delete guard, 404s) carry a
    // message written for the admin; DB errors stay behind the generic 500.
    if (result.status && result.status < 500) return jsonError(result.error, result.status);
    return jsonError('Failed to apply the course change.', 500);
  }

  // --- Audit (best-effort: the mutation is the primary, already-applied effect) ---
  const courseId = 'courseId' in action ? action.courseId : null;
  const weekId = 'weekId' in action ? action.weekId : null;
  const cellId = 'cellId' in action ? action.cellId : null;
  const detail: Record<string, unknown> = {};
  if ('title' in action) detail.title = action.title;
  if ('subtitle' in action) detail.subtitle = action.subtitle;
  if ('weekIds' in action) detail.weekIds = action.weekIds;
  if ('cellIds' in action) detail.cellIds = action.cellIds;
  const { error: auditErr } = await admin.from('course_changes').insert({
    actor_id: caller.id,
    actor_email: caller.email?.toLowerCase() ?? null,
    action: action.action,
    course_id: courseId,
    week_id: weekId,
    cell_id: cellId,
    detail: Object.keys(detail).length > 0 ? detail : null,
  });
  if (auditErr) console.error('Audit insert failed:', auditErr.message);

  return new Response(JSON.stringify({ ok: true, action: action.action }), {
    headers: { ...cors, 'content-type': 'application/json' },
  });
});

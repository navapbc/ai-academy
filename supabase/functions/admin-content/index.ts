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
  archiveBlockedReason,
  buildContentVersionRow,
  buildCorsHeaders,
  buildCustomInsert,
  buildPublishUpdate,
  DRAFT_COLUMN_KEYS,
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

// A failure result MAY still carry a `detail`: the publish path returns one on
// its reset-step 409s because the primary mutation (draft→live promotion and/or
// the epoch commit) already committed even though the reset sub-step failed —
// index.ts audits any result that carries a detail (review FIX A-2).
type ApplyResult =
  | { error: string; status?: number; detail?: Record<string, unknown> }
  | { error: null; detail: Record<string, unknown> };

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
    const insert = buildCustomInsert(action.title, action.type, ids, maxSortOrder, callerId, stamp.updated_at, action.origin);
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
      const hasDraft = !!draft && Object.keys(draft).length > 0;
      // No draft AND no reset flag: nothing to do — the pre-existing 400,
      // unchanged. WITH resetProgress, a NULL draft is the documented
      // reset-only RETRY (review FIX A-3): a previous publish-with-reset
      // committed the promotion (consuming the draft) but its reset sub-step
      // failed, and the admin was told to "publish with reset again". The
      // retry skips promotion/version bump/snapshot and just re-runs the
      // epoch-then-delete sequence below.
      if (!hasDraft && !action.resetProgress) {
        return { error: 'No draft to publish for that lesson.', status: 400 };
      }

      const detail: Record<string, unknown> = {};
      if (hasDraft) {
        const update = buildPublishUpdate(draft, (row.version as number) ?? 1);
        const { error } = await admin
          .from('modules')
          .update({ ...update, ...stamp })
          .eq('cell_id', action.cellId);
        if (error) return { error: error.message };

        // The publish UPDATE succeeded (version bumped, draft nulled). Now write a
        // best-effort content_versions snapshot (X.2 R1/R2). The snapshot is the
        // promoted live content — the SAME field set buildPublishUpdate copies
        // draft→live (DRAFT_COLUMN_KEYS) — so it equals exactly what was published.
        // This MUST NEVER fail the publish (the version bump already landed), so it
        // mirrors the content_changes audit below: try/catch → console.warn only.
        try {
          const snapshot: Record<string, unknown> = {};
          for (const key of DRAFT_COLUMN_KEYS) {
            if (key in update) snapshot[key] = update[key];
          }
          const versionRow = buildContentVersionRow({
            cellId: action.cellId,
            version: update.version as number,
            snapshot,
            authorId: callerId,
            note: action.note,
          });
          const { error: snapErr } = await admin.from('content_versions').insert(versionRow);
          if (snapErr) console.warn('content_versions snapshot insert failed:', snapErr.message);
        } catch (e) {
          console.warn('content_versions snapshot insert threw:', e);
        }

        detail.version = update.version;
      } else {
        // Reset-only retry: no promotion happened this call (U10 / FIX A-3).
        detail.resetOnly = true;
      }

      // Progress reset (restructure U10, R17) — NOT best-effort (unlike the
      // snapshot above): a failure is reported so the admin retries. STRICTLY
      // ORDERED, each PostgREST call its own transaction:
      //   1. Commit modules.progress_reset_at FIRST — the commit point. From
      //      this instant the DB trigger (enforce_progress_reset_epoch)
      //      rejects any completion write carrying an older epoch, so nothing
      //      step 2 deletes can be resurrected by a stale cache/outbox.
      //   2. THEN delete the module's PRE-EPOCH module_progress rows (counted
      //      for audit). The delete is SCOPED to rows whose reset_epoch is
      //      NULL or predates the just-committed epoch (review FIX A-1): a
      //      completion legitimately written WITH the fresh epoch in the
      //      epoch→delete gap (or during a retry) must survive — the trigger
      //      already guarantees anything landing after step 1 carries the
      //      fresh epoch.
      // The epoch is minted here, never derived from the snapshot write — the
      // snapshot is best-effort and is NOT the epoch source.
      //
      // Failure paths return 409 WITH the accumulated detail so index.ts still
      // audits the already-committed promotion (review FIX A-2); the detail
      // records the failed sub-step + the error class.
      if (action.resetProgress) {
        detail.resetProgress = true;
        const epoch = new Date().toISOString();
        const { error: epochErr } = await admin
          .from('modules')
          .update({ progress_reset_at: epoch })
          .eq('cell_id', action.cellId);
        if (epochErr) {
          return {
            error:
              'The lesson was published, but resetting learner progress failed. ' +
              'Publish with reset again to retry.',
            status: 409,
            detail: {
              ...detail,
              resetFailed: true,
              resetFailedStep: 'epoch-commit',
              resetError: epochErr.message,
            },
          };
        }
        const { count, error: delErr } = await admin
          .from('module_progress')
          .delete({ count: 'exact' })
          .eq('module_id', action.cellId)
          .or(`reset_epoch.is.null,reset_epoch.lt."${epoch}"`);
        if (delErr) {
          // The epoch committed, so stale re-writes are already blocked, but the
          // pre-reset rows survive — the admin must retry to clear them.
          return {
            error:
              'The lesson was published and the reset epoch was set, but clearing ' +
              'existing learner progress failed. Publish with reset again to retry.',
            status: 409,
            detail: {
              ...detail,
              resetEpoch: epoch,
              resetFailed: true,
              resetFailedStep: 'delete',
              resetError: delErr.message,
            },
          };
        }
        // Rides the content_changes audit insert below (action='publish'):
        // detail carries the deleted-row count + the new epoch (U10 audit).
        detail.resetEpoch = epoch;
        detail.deletedProgressRows = count ?? 0;
      }

      return { error: null, detail };
    }
    case 'archive': {
      // Referential guard (restructure U3): a lesson assigned to a course week
      // must be unassigned (via admin-courses) before archive — 400 names the
      // week. The embedded select resolves the membership's week title in one
      // read (course_week_modules.week_id → course_weeks is to-one).
      const { data: membership, error: memErr } = await admin
        .from('course_week_modules')
        .select('week_id, course_weeks(title)')
        .eq('cell_id', action.cellId)
        .maybeSingle();
      if (memErr) return { error: memErr.message };
      const assignedWeekTitle = membership
        ? ((membership.course_weeks as { title?: string } | null)?.title ?? 'its course week')
        : null;
      const blocked = archiveBlockedReason(assignedWeekTitle);
      if (blocked) return { error: blocked, status: 400 };

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

  // --- Audit (best-effort: the mutation is the primary, already-applied effect) ---
  // Runs for every success AND for any failure that carries a detail: the
  // publish path returns a detail on its reset-step 409s because the draft→live
  // promotion (and possibly the epoch commit) already committed — the audit
  // trail must record the committed publish even when the reset sub-step failed
  // (review FIX A-2; detail then carries resetFailed + the error class).
  // create-custom has no incoming cellId — the generated one comes back in detail.
  if (result.detail) {
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
  }

  if (result.error) {
    if (result.status && result.status < 500) return jsonError(result.error, result.status);
    console.error(`Content action '${action.action}' failed:`, result.error);
    return jsonError('Failed to apply the content change.', 500);
  }

  return new Response(JSON.stringify({ ok: true, action: action.action, ...result.detail }), {
    headers: { ...cors, 'content-type': 'application/json' },
  });
});

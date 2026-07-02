import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

// Admin content-management client (P5.4-1). Writes go through the `admin-content`
// service_role Edge Function (the modules table has no client-write RLS); the CMS
// reads drafts directly (modules is authenticated-readable). The service_role key
// never reaches the browser — the client only holds the user's session token,
// which the function verifies as an admin. Mirrors src/lib/adminCohorts.ts.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * The admin working copy of a lesson's editable fields, keyed by the DB column
 * name (so publish is a straight copy). Every field is optional — Save posts the
 * working copy the editor holds. The function re-validates server-side (the
 * authoritative W2-7/D-16 check); the editors will import the same validators
 * from admin-content-core for inline feedback (Chunks 3–5).
 */
export interface DraftFields {
  title?: string;
  type?: string;
  body_md?: string | null;
  video_url?: string | null;
  tutor_reference_md?: string | null;
  quiz_json?: unknown;
  lab_config_json?: unknown;
  sorter_config_json?: unknown;
}

/**
 * Client-side mirror of the server's video-URL check (admin-content-core
 * `isValidVideoUrl`) for inline editor feedback. An empty/absent value is allowed
 * (video is optional); a present value must be an http(s) URL. The Edge Function
 * re-validates on write and is authoritative (W2-7/D-16) — this is UX only. The
 * tsconfig excludes `supabase/`, so the Deno core can't be imported here; a tiny
 * duplicate is the house pattern (cf. DraftFields above).
 */
export function isValidVideoUrl(v: string | null | undefined): boolean {
  if (v === null || v === undefined || v === '') return true;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** A multiple-choice quiz question carries exactly this many options. */
export const QUIZ_OPTION_COUNT = 4;

/** One question as the QuizEditor assembles it (mirrors QuizQuestion in types.ts). */
export interface QuizQuestionDraft {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

/**
 * Client-side mirror of the server's `validateQuizJson` (admin-content-core) for
 * inline editor feedback: a non-empty array of questions, each with exactly 4
 * non-empty options, an in-range correctIndex, a non-empty question, and a string
 * explanation. The Edge Function re-validates on write and is authoritative
 * (R8 / W2-7/D-16) — this is UX only. The tsconfig excludes `supabase/`, so the
 * Deno core can't be imported here; the tiny duplicate is the house pattern
 * (cf. isValidVideoUrl above).
 */
export function validateQuizQuestions(
  questions: QuizQuestionDraft[],
): { ok: true } | { ok: false; error: string } {
  if (questions.length < 1) return { ok: false, error: 'Add at least one question.' };
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const n = i + 1;
    if (q.question.trim() === '') return { ok: false, error: `Question ${n}: enter the question text.` };
    if (q.options.length !== QUIZ_OPTION_COUNT) {
      return { ok: false, error: `Question ${n}: needs exactly ${QUIZ_OPTION_COUNT} options.` };
    }
    if (!q.options.every((o) => o.trim() !== '')) {
      return { ok: false, error: `Question ${n}: every option must be filled in.` };
    }
    if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
      return { ok: false, error: `Question ${n}: choose which option is correct.` };
    }
  }
  return { ok: true };
}

/**
 * Max length of the optional publish change-note (X.2). Mirrors the server cap
 * (admin-content-core `normalizePublishNote`, ≤500 chars) for a light client-side hint —
 * the Edge Function re-validates and is authoritative.
 */
export const NOTE_MAX_LENGTH = 500;

export type ContentAction =
  | { action: 'save-draft'; cellId: string; draft: DraftFields }
  | { action: 'publish'; cellId: string; note?: string }
  | { action: 'archive'; cellId: string }
  | { action: 'restore'; cellId: string }
  | { action: 'create-custom'; title: string; type: string };

export interface ContentActionResult {
  ok: true;
  action: ContentAction['action'];
  version?: number;
  /** create-custom returns the server-generated `custom-<slug>` id. */
  cellId?: string;
}

/** POSTs one action to the admin-content function; throws Error(body.error) on failure. */
export async function invokeAdminContent(action: ContentAction): Promise<ContentActionResult> {
  if (!isSupabaseConfigured || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase is not configured.');
  }
  let accessToken = SUPABASE_ANON_KEY;
  const { data } = await getSupabaseClient().auth.getSession();
  if (data.session?.access_token) accessToken = data.session.access_token;

  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/admin-content`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(action),
    });
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }

  let body: { ok?: boolean; error?: string; version?: number; cellId?: string } = {};
  try {
    body = await res.json();
  } catch {
    // fall through to the status-based error below
  }
  if (!res.ok || !body.ok) {
    throw new Error(body.error ?? `Request failed (${res.status}).`);
  }
  return { ok: true, action: action.action, version: body.version, cellId: body.cellId };
}

// Thin typed creators (keep call sites readable).
export const saveDraft = (cellId: string, draft: DraftFields) =>
  invokeAdminContent({ action: 'save-draft', cellId, draft });
/**
 * Publishes a lesson. `note` is the optional "what changed?" change-note (X.2);
 * blank/whitespace is omitted so the server persists null. The server trims and
 * length-caps it (≤500) authoritatively.
 */
export const publishLesson = (cellId: string, note?: string) => {
  const trimmed = note?.trim();
  return invokeAdminContent(
    trimmed ? { action: 'publish', cellId, note: trimmed } : { action: 'publish', cellId },
  );
};
export const archiveLesson = (cellId: string) => invokeAdminContent({ action: 'archive', cellId });
export const restoreLesson = (cellId: string) => invokeAdminContent({ action: 'restore', cellId });
/** Creates a free-form custom lesson; resolves with the generated `custom-<slug>` id. */
export const createCustomLesson = (title: string, type: string) =>
  invokeAdminContent({ action: 'create-custom', title, type });

import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

// Admin workshop-management client (X.3 Unit 2). Writes go through the
// `admin-workshops` service_role Edge Function (the workshops table has no
// client-write RLS); reads use the authenticated SELECT RLS on workshops. The
// service_role key never reaches the browser — the client only holds the user's
// session token, which the function verifies as an admin. Mirrors adminCohorts.ts.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// --- Write path: invoke the Edge Function -----------------------------------

export type WorkshopAction =
  | { action: 'create'; title: string; intro?: string | null; stepCellIds: string[] }
  | { action: 'update'; id: string; title: string; intro?: string | null; stepCellIds: string[] }
  | { action: 'delete'; id: string };

/** POSTs one action to the admin-workshops function; throws Error(body.error) on failure. */
export async function invokeAdminWorkshops(action: WorkshopAction): Promise<void> {
  if (!isSupabaseConfigured || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase is not configured.');
  }
  let accessToken = SUPABASE_ANON_KEY;
  const { data } = await getSupabaseClient().auth.getSession();
  if (data.session?.access_token) accessToken = data.session.access_token;

  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/admin-workshops`, {
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

  let body: { ok?: boolean; error?: string } = {};
  try {
    body = await res.json();
  } catch {
    // fall through to the status-based error below
  }
  if (!res.ok || !body.ok) {
    throw new Error(body.error ?? `Request failed (${res.status}).`);
  }
}

// Thin typed creators (keep call sites readable).
export const createWorkshop = (title: string, stepCellIds: string[], intro?: string | null) =>
  invokeAdminWorkshops({ action: 'create', title, intro, stepCellIds });
export const updateWorkshop = (
  id: string,
  title: string,
  stepCellIds: string[],
  intro?: string | null,
) => invokeAdminWorkshops({ action: 'update', id, title, intro, stepCellIds });
export const deleteWorkshop = (id: string) => invokeAdminWorkshops({ action: 'delete', id });

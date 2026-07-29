import { getSupabaseClient } from './supabaseClient';

// Admin usage-monitoring data-access (P6.2 Unit 3). Pure builders + thin async
// fetchers over the `claude_usage` table (Unit 1). RLS scopes every read to
// admins via `is_admin()` — a non-admin caller gets zero rows, so the panel
// renders empty rather than leaking usage. Read-only: this layer never writes.
//
// Mirrors dashboard.ts: pure `build*` functions unit-test without a DB, the thin
// fetchers do the `getSupabaseClient().from(...).select(...)`, and Postgres
// numeric/bigint columns (which PostgREST serializes as strings) are coerced via
// `toNum`.

/** Coerce a Postgres numeric/bigint-as-string (or number/null) to a number, defaulting to 0. */
function toNum(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isNaN(n) ? 0 : n;
}

export type UsageSource = 'chat' | 'grade';

/** One row of the `claude_usage` table, as PostgREST returns it. */
export interface UsageRow {
  user_id: string;
  source: string;
  model: string;
  input_tokens: number | string | null;
  output_tokens: number | string | null;
  created_at: string;
}

interface ProfileNameRow {
  id: string;
  full_name: string | null;
  email: string | null;
}

/** Per-user rolled-up token/call totals over the window. */
export interface UsageByUser {
  userId: string;
  /** Display name: full_name, else email, else a short id fallback. */
  name: string;
  callCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** True when this user's total tokens exceed the monitor-only flag threshold. */
  overThreshold: boolean;
}

/**
 * Default per-window token threshold that visually flags a heavy consumer. This
 * is a monitor-only signal (no call is ever blocked); tune it here or wire it to
 * config later. 500k tokens over the selected window is a sane starting point.
 */
export const DEFAULT_THRESHOLD_TOKENS = 500_000;

export interface WindowOption {
  label: string;
  ms: number;
}

/** Selectable lookback windows for the admin view. */
export const WINDOW_OPTIONS: readonly WindowOption[] = [
  { label: 'Last 24 hours', ms: 24 * 60 * 60 * 1000 },
  { label: 'Last 7 days', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: 'Last 30 days', ms: 30 * 24 * 60 * 60 * 1000 },
] as const;

/**
 * Pure: aggregate rows per user_id into call/token totals, sort desc by total
 * tokens (heaviest consumer first), and flag anyone over the threshold. Numeric
 * strings are coerced via `toNum`. `names` is keyed on exactly the ids present in
 * `rows`, so no user the caller can't see is ever surfaced.
 */
export function buildUsageByUser(
  rows: UsageRow[],
  names: ProfileNameRow[],
  { thresholdTokens }: { thresholdTokens: number } = { thresholdTokens: DEFAULT_THRESHOLD_TOKENS },
): UsageByUser[] {
  const nameById = new Map(names.map((n) => [n.id, n]));
  const byUser = new Map<string, { callCount: number; inputTokens: number; outputTokens: number }>();

  for (const r of rows) {
    const agg = byUser.get(r.user_id) ?? { callCount: 0, inputTokens: 0, outputTokens: 0 };
    agg.callCount += 1;
    agg.inputTokens += toNum(r.input_tokens);
    agg.outputTokens += toNum(r.output_tokens);
    byUser.set(r.user_id, agg);
  }

  return Array.from(byUser.entries())
    .map(([userId, agg]) => {
      const profile = nameById.get(userId);
      const name =
        profile?.full_name?.trim() || profile?.email || `User ${userId.slice(0, 8)}`;
      const totalTokens = agg.inputTokens + agg.outputTokens;
      return {
        userId,
        name,
        callCount: agg.callCount,
        inputTokens: agg.inputTokens,
        outputTokens: agg.outputTokens,
        totalTokens,
        overThreshold: totalTokens > thresholdTokens,
      };
    })
    .sort((a, b) => b.totalTokens - a.totalTokens);
}

const USAGE_COLUMNS = 'user_id, source, model, input_tokens, output_tokens, created_at';

// PostgREST caps EVERY response at `db.max_rows` (1000 — see supabase/config.toml),
// so a single unbounded select over a busy window silently returns only the first
// page. With `order(created_at asc)` that page is the OLDEST 1000 calls, which
// understates every per-user total and stops the threshold flag from ever firing.
// So page explicitly instead of trusting one round-trip. The order key is
// (created_at, id) — created_at alone is not a total order, and ties straddling a
// page boundary would duplicate/skip rows.
const USAGE_PAGE_SIZE = 1000;
/** Safety stop so a pathological table can't page forever (≈100 pages). */
const USAGE_MAX_ROWS = 100_000;

/**
 * Reads the RLS-scoped `claude_usage` rows since `sinceIso`, then looks up names
 * for exactly the user ids present (never enumerating all profiles). A non-admin
 * caller gets zero rows from RLS, so this resolves to an empty result.
 */
export async function fetchUsageByUser(
  sinceIso: string,
  { thresholdTokens }: { thresholdTokens: number } = { thresholdTokens: DEFAULT_THRESHOLD_TOKENS },
): Promise<UsageByUser[]> {
  const sb = getSupabaseClient();
  const rows: UsageRow[] = [];
  for (let from = 0; from < USAGE_MAX_ROWS; from += USAGE_PAGE_SIZE) {
    const { data, error } = await sb
      .from('claude_usage')
      .select(USAGE_COLUMNS)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + USAGE_PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as UsageRow[];
    rows.push(...page);
    // A short page means we reached the end (a full page may still be the last
    // one — the next iteration returns empty and stops).
    if (page.length < USAGE_PAGE_SIZE) break;
  }

  if (rows.length === 0) return [];

  const ids = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: names, error: nameError } = await sb
    .from('profiles')
    .select('id, full_name, email')
    .in('id', ids);
  if (nameError) throw nameError;

  return buildUsageByUser(rows, (names ?? []) as ProfileNameRow[], { thresholdTokens });
}

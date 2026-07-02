import { getSupabaseClient } from './supabaseClient';

// Content version-history read path (X.2 Unit 3). The publish snapshot writer
// (Unit 2) appends one `content_versions` row per publish; the admin-read RLS
// policy (Unit 1) lets an admin — and only an admin — SELECT them. This module is
// the CMS read side: a pure builder + a thin RLS-direct fetcher + a `profiles`
// name lookup, mirroring dashboard.ts / learnerDetail.ts. Read-only — no restore
// (rollback is deferred). The CMS surface is admin-gated in StaffArea; the RLS
// policy is the authoritative gate.

/** One version-history entry, shaped for the read-only CMS list. */
export interface ContentVersionEntry {
  /** Stable row id (list key). */
  id: string;
  /** The `modules.version` this snapshot captured. */
  version: number;
  /** The "what changed?" note, or null when none was given. */
  note: string | null;
  /** Author display name: full_name, else email, else a short id fallback, else "Unknown". */
  authorName: string;
  /** ISO timestamp the snapshot was written. */
  createdAt: string;
}

// Raw PostgREST shapes.
export interface ContentVersionRow {
  id: string;
  version: number | string;
  note: string | null;
  author_id: string | null;
  created_at: string;
}
export interface ProfileNameRow {
  id: string;
  full_name: string | null;
  email: string | null;
}

function toNum(v: number | string | null): number {
  if (v === null || v === '') return 0;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Pure: join version rows to author names and shape them newest-first. Name lookup
 * is keyed on the ids the rows surfaced (mirrors buildLearnerRoster); a missing
 * author_id or unresolved profile falls back to a short id, then "Unknown". Sort
 * is by created_at descending, with version as a stable tiebreaker.
 */
export function buildVersionHistory(
  rows: ContentVersionRow[],
  names: ProfileNameRow[],
): ContentVersionEntry[] {
  const byId = new Map(names.map((n) => [n.id, n]));
  return rows
    .map((r) => {
      const profile = r.author_id ? byId.get(r.author_id) : undefined;
      const authorName =
        profile?.full_name?.trim() ||
        profile?.email?.trim() ||
        (r.author_id ? `User ${r.author_id.slice(0, 8)}` : 'Unknown');
      return {
        id: r.id,
        version: toNum(r.version),
        note: r.note && r.note.trim() !== '' ? r.note : null,
        authorName,
        createdAt: r.created_at,
      };
    })
    .sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || b.version - a.version,
    );
}

/**
 * Reads a cell's version history (admin RLS — direct read, no Edge Function),
 * newest-first, then resolves author names for exactly the ids the rows surfaced
 * (never enumerating profiles). Throws on error so the caller surfaces a failure
 * state.
 */
export async function fetchContentVersions(cellId: string): Promise<ContentVersionEntry[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('content_versions')
    .select('id, version, note, author_id, created_at')
    .eq('cell_id', cellId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as unknown as ContentVersionRow[];
  if (rows.length === 0) return [];

  const authorIds = [...new Set(rows.map((r) => r.author_id).filter((id): id is string => id !== null))];
  if (authorIds.length === 0) return buildVersionHistory(rows, []);

  const { data: names, error: nameError } = await sb
    .from('profiles')
    .select('id, full_name, email')
    .in('id', authorIds);
  if (nameError) throw nameError;

  return buildVersionHistory(rows, (names ?? []) as ProfileNameRow[]);
}

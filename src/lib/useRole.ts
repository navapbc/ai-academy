import { useEffect, useState } from 'react';
import type { Role } from '../types';
import { useAuth } from './auth';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

// Resolves the signed-in user's access role from their `profiles` row (P5.1d).
// Owner-read RLS lets a user read their own profile, so the anon key is enough.
//
// Deliberately NOT cached in localStorage: unlike progress, a stale role is a
// privilege-boundary hazard (a learner inheriting an admin's cached role on a
// shared browser — the D-01 class of bug). It is fetched fresh per session and
// MUST be consumed inside the `key={session.user.id}` subtree so the state
// resets cleanly on a user switch. While loading or unresolved we stay
// least-privilege (`role: null` → no elevated view is reachable).
//
// This only decides which views the client *offers*. The real data boundary is
// the champion/admin read RLS (P5.1c); the server never trusts this value.

export interface RoleState {
  /** Resolved role, or null while loading / when unresolvable (fail-closed). */
  role: Role | null;
  /** True until the first resolution attempt settles. */
  loading: boolean;
  /** Non-null when the profile could not be read; role falls back to null. */
  error: string | null;
  isAdmin: boolean;
  isChampion: boolean;
  /** admin OR champion — the audience for staff-only views. */
  isStaff: boolean;
}

/**
 * Pure: does `role` satisfy an `allow` list? A null/unresolved role never
 * passes, so guarding on this fails closed.
 */
export function isAllowed(role: Role | null, allow: readonly Role[]): boolean {
  return role !== null && allow.includes(role);
}

export function useRole(): RoleState {
  const { user } = useAuth();
  const userId = user?.id;
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // No session (or no local stack): nothing to resolve — stay least-privilege.
    if (!userId || !isSupabaseConfigured) {
      setRole(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    // Drop the previous user's role BEFORE resolving this one. The comment above
    // relies on the `key={session.user.id}` remount to reset this state, but that
    // is a caller convention, not a guarantee: if this hook is ever mounted
    // outside that subtree, a user switch would otherwise keep serving the prior
    // user's (possibly elevated) role for the whole fetch window. Re-fetching for
    // the SAME user briefly shows least-privilege, which fails closed.
    setRole(null);
    setLoading(true);
    getSupabaseClient()
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) {
          // Fail closed: an unreadable profile grants no elevated role.
          setRole(null);
          setError('Could not load your access role.');
        } else {
          setRole((data?.role as Role | undefined) ?? null);
          setError(null);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return {
    role,
    loading,
    error,
    isAdmin: role === 'admin',
    isChampion: role === 'champion',
    isStaff: role === 'admin' || role === 'champion',
  };
}

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { clearProgressCache } from './progressCache';

// Owns the Supabase auth session for the whole app. RLS on the data tables is
// owner-only, so progress/quiz reads and writes only work once a user is signed
// in. Google SSO (restricted to @navapbc.com) is the real sign-in; a local
// email/password fallback exists for dev only (see Login.tsx).

/**
 * The only email domain allowed a usable session. Google's `hd` param is just a
 * UX hint, so we enforce the boundary in two places that don't trust the
 * client: this guard (below) and a `before insert on auth.users` DB trigger
 * (see the restrict_auth_email_domain migration). Keep this in ONE place.
 */
export const ALLOWED_EMAIL_DOMAIN = 'navapbc.com';

const DOMAIN_REJECTION_MESSAGE = `Please sign in with your @${ALLOWED_EMAIL_DOMAIN} Google account.`;

function emailDomainAllowed(email: string | undefined): boolean {
  if (!email) return false;
  return email.split('@')[1]?.toLowerCase() === ALLOWED_EMAIL_DOMAIN;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** True until the initial session has been resolved. */
  loading: boolean;
  /** Non-null when a sign-in was rejected (e.g. wrong email domain). */
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    // Without config there's no stack to talk to — stop loading and show login,
    // where signIn will surface a clear "not configured" error.
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    const supabase = getSupabaseClient();

    // Client guard: a resolved session whose user is outside the allowed domain
    // is not usable. We sign it out and surface a clear error rather than
    // letting it through. This is a convenience boundary; the DB trigger is the
    // backstop that holds even if this code is bypassed.
    const applySession = async (next: Session | null) => {
      if (next?.user && !emailDomainAllowed(next.user.email)) {
        setSession(null);
        setAuthError(DOMAIN_REJECTION_MESSAGE);
        await supabase.auth.signOut();
        return;
      }
      // A valid sign-in clears any prior rejection message. A null session
      // (e.g. the sign-out we just triggered) leaves the message in place.
      if (next?.user) setAuthError(null);
      setSession(next);
    };

    supabase.auth.getSession().then(async ({ data }) => {
      await applySession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      void applySession(next);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    setAuthError(null);
    const { error } = await getSupabaseClient().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        // `hd` nudges Google to the Nava workspace and `select_account` avoids a
        // silent re-login with a stale account; neither is a security boundary.
        queryParams: { hd: ALLOWED_EMAIL_DOMAIN, prompt: 'select_account' },
      },
    });
    if (error) throw error;
  };

  const signIn = async (email: string, password: string) => {
    setAuthError(null);
    const { error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    // Drop the signing-out user's cached progress while we still know who they
    // are (audit D-01 sign-out hygiene). The pending-writes outbox is kept on
    // purpose: it is owner-keyed and a parked completion is durable evidence of
    // work done (DATA-02) — it retries when this same user signs back in.
    if (session?.user) clearProgressCache(session.user.id);
    await getSupabaseClient().auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        authError,
        signInWithGoogle,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an <AuthProvider>.');
  return ctx;
}

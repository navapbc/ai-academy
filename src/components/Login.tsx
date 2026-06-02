import { useState, type FormEvent } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { BRANDING } from '../branding';
import { ALLOWED_EMAIL_DOMAIN, useAuth } from '../lib/auth';

// Google SSO (restricted to @navapbc.com) is the primary, production sign-in.
// The session it establishes is what unlocks the RLS-protected progress and
// quiz data. The email/password form is a LOCAL-DEV-ONLY fallback so a local
// stack is usable without configuring Google; it is hidden in production.
export default function Login() {
  const { signInWithGoogle, signIn, authError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  const handleGoogle = async () => {
    setError(null);
    setGoogleSubmitting(true);
    try {
      await signInWithGoogle();
      // On success the browser redirects to Google, so we don't reset state.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
      setGoogleSubmitting(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // The domain-rejection message from the auth guard takes precedence over a
  // local form error so a rejected Google account always gets a clear reason.
  const displayedError = authError ?? error;

  return (
    <div className="min-h-screen bg-nava-sand flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-3xl border-2 border-nava-mint shadow-sm p-8 space-y-8">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto bg-nava-mint rounded-2xl flex items-center justify-center text-nava-green">
            <GoogleMark className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-nava-plum">{BRANDING.name}</h1>
          <p className="text-sm text-gray-500">
            Sign in with your @{ALLOWED_EMAIL_DOMAIN} Google account to track your progress.
          </p>
        </div>

        {displayedError && (
          <div role="alert" className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{displayedError}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleSubmitting}
          aria-label="Sign in with Google"
          aria-busy={googleSubmitting}
          className="w-full py-3.5 bg-nava-green text-white rounded-xl font-bold shadow-lg shadow-nava-green/20 hover:bg-nava-plum disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          {googleSubmitting ? (
            <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
          ) : (
            <>
              <GoogleMark className="w-5 h-5" />
              Sign in with Google
            </>
          )}
        </button>

        {import.meta.env.DEV && (
          <div className="space-y-5 pt-2 border-t border-gray-100">
            <p className="text-center text-xs font-medium uppercase tracking-wide text-gray-500">
              Local dev sign-in
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 focus:border-nava-green focus:outline-none transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium text-gray-700">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 focus:border-nava-green focus:outline-none transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-white text-nava-plum border-2 border-nava-mint rounded-xl font-bold hover:border-nava-green disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign In'}
              </button>
            </form>

            <p className="text-center text-xs text-gray-500">
              Local demo: <span className="font-mono">demo@navapbc.com</span> /{' '}
              <span className="font-mono">demo-password</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Inline Google "G" so the primary button reads as Google sign-in without
// pulling in another icon dependency.
function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8a12 12 0 1 1 7.9-21l5.7-5.7A20 20 0 1 0 24 44c11 0 20-9 20-20 0-1.3-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8A12 12 0 0 1 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 0 0 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 12.7 28l-6.6 5.1A20 20 0 0 0 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C39.9 35.9 44 30.5 44 24c0-1.3-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}

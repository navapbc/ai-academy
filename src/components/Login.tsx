import { useState, type FormEvent } from 'react';
import { LogIn, Loader2, AlertCircle } from 'lucide-react';
import { BRANDING } from '../branding';
import { useAuth } from '../lib/auth';

// Minimal email/password sign-in. The session it establishes is what unlocks
// the RLS-protected progress and quiz data. In dev we surface the seeded demo
// credentials so a local stack is usable out of the box.
export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  return (
    <div className="min-h-screen bg-nava-sand flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-3xl border-2 border-nava-mint shadow-sm p-8 space-y-8">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto bg-nava-mint rounded-2xl flex items-center justify-center text-nava-green">
            <LogIn className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-nava-plum">{BRANDING.name}</h1>
          <p className="text-sm text-gray-500">Sign in to track your progress.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
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

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 bg-nava-green text-white rounded-xl font-bold shadow-lg shadow-nava-green/20 hover:bg-nava-plum disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign In'}
          </button>
        </form>

        {import.meta.env.DEV && (
          <p className="text-center text-xs text-gray-400">
            Local demo: <span className="font-mono">demo@nava.dev</span> /{' '}
            <span className="font-mono">demo-password</span>
          </p>
        )}
      </div>
    </div>
  );
}

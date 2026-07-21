import { type ReactNode } from 'react';
import { Loader2, Lock } from 'lucide-react';
import type { Role } from '../types';
import { isAllowed } from '../lib/useRole';

// Client-side route guard (P5.1d): renders `children` only when the resolved
// role is in `allow`. Fails closed — while the role is still loading it shows a
// spinner (never the protected content), and an unresolved/disallowed role gets
// a "not authorized" notice instead. The `allow` list is the seam for the
// eventual admin-only vs champion split (P5.2 staff dashboard vs P5.5 review).
//
// This is defense-in-depth, not the security boundary: the data itself is
// protected by the champion/admin read RLS (P5.1c). The guard only keeps a
// learner from navigating into a view that would render empty for them anyway.

interface RoleGuardProps {
  role: Role | null;
  loading: boolean;
  allow: readonly Role[];
  children: ReactNode;
  /** Optional override for the disallowed state (defaults to a notice). */
  fallback?: ReactNode;
}

export default function RoleGuard({ role, loading, allow, children, fallback }: RoleGuardProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16" role="status">
        <Loader2 className="w-6 h-6 text-nava-plum animate-spin" aria-hidden="true" />
        <span className="sr-only">Checking access…</span>
      </div>
    );
  }

  if (!isAllowed(role, allow)) {
    if (fallback !== undefined) return <>{fallback}</>;
    return (
      <div className="max-w-md mx-auto text-center space-y-3 py-16" role="alert">
        <Lock className="w-10 h-10 text-gray-400 mx-auto" aria-hidden="true" />
        <h2 className="text-lg font-bold text-gray-900">Staff access only</h2>
        <p className="text-sm text-gray-600">
          This area is for champions and admins. Your account doesn’t have access.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

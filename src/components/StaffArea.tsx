import { LayoutDashboard, ClipboardList, Users } from 'lucide-react';
import type { Role } from '../types';

// Placeholder staff landing reached via the role-gated `staff` view (P5.1d).
// It only proves the view is *reachable and gated* — the real dashboards and
// review queue land later: staff dashboard (P5.2), learner self-view (P5.3),
// cohort management + review queue (P5.5). Champions and admins see the same
// shell here; the per-feature admin-only vs champion split happens in those
// slices via the RoleGuard `allow` seam.

const COMING_SOON: { icon: typeof LayoutDashboard; title: string; detail: string; slice: string }[] = [
  {
    icon: LayoutDashboard,
    title: 'Cohort dashboard',
    detail: 'Completion %, score distributions, and GLAT pass rates by cohort.',
    slice: 'P5.2',
  },
  {
    icon: ClipboardList,
    title: 'Review queue',
    detail: 'Open learner lab submissions awaiting champion review.',
    slice: 'P5.5',
  },
  {
    icon: Users,
    title: 'Cohort management',
    detail: 'Create cohorts, enroll learners, and assign champions.',
    slice: 'P5.5',
  },
];

export default function StaffArea({ role }: { role: Role }) {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <header className="space-y-2">
        <span className="text-[11px] font-bold uppercase tracking-widest text-nava-green">
          {role === 'admin' ? 'Admin' : 'Champion'} area
        </span>
        <h1 className="text-2xl font-bold text-gray-900" tabIndex={-1}>
          Staff tools
        </h1>
        <p className="text-sm text-gray-600">
          You can reach this area because your role is{' '}
          <span className="font-semibold">{role}</span>. The dashboards and review
          tools below are being built — this page confirms staff access works.
        </p>
      </header>

      <ul className="space-y-3">
        {COMING_SOON.map(({ icon: Icon, title, detail, slice }) => (
          <li
            key={title}
            className="flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-4"
          >
            <Icon className="w-5 h-5 text-nava-green shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-gray-900">{title}</h2>
                <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
                  Soon · {slice}
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-600">{detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

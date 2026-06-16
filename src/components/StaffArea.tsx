import { useState } from 'react';
import { ClipboardList, Users } from 'lucide-react';
import type { Role } from '../types';
import type { LearnerRosterEntry } from '../lib/learnerDetail';
import CohortDashboard from './staff/CohortDashboard';
import LearnerDetail from './staff/LearnerDetail';

// Staff landing reached via the role-gated `staff` view (P5.1d). The cohort
// dashboard (P5.2b) is live at the top; selecting a learner from a cohort
// roster drills into their per-learner detail (P5.2c) — in-page state, no new
// top-level view. The review queue and cohort management land in P5.5 and show
// as "soon" tiles below. Champions and admins see the same shell; the
// per-feature admin-only vs champion split happens in those slices via the
// RoleGuard `allow` seam.

const COMING_SOON: { icon: typeof ClipboardList; title: string; detail: string; slice: string }[] = [
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
  const [selected, setSelected] = useState<LearnerRosterEntry | null>(null);

  if (selected) {
    return (
      <div className="max-w-5xl mx-auto">
        <LearnerDetail learner={selected} onBack={() => setSelected(null)} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-10">
      <header className="space-y-2">
        <span className="text-[11px] font-bold uppercase tracking-widest text-nava-green">
          {role === 'admin' ? 'Admin' : 'Champion'} area
        </span>
        <h1 className="text-2xl font-bold text-gray-900" tabIndex={-1}>
          Cohort dashboard
        </h1>
        <p className="text-sm text-gray-600">
          Completion, quiz scores, and review load for the cohorts you can see.
        </p>
      </header>

      <CohortDashboard onSelectLearner={setSelected} />

      <ul className="space-y-3 border-t border-gray-200 pt-8">
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

import { useState } from 'react';
import { ClipboardList, Users, ChevronRight, FileText, Activity, BookOpen } from 'lucide-react';
import type { Role } from '../types';
import type { LearnerRosterEntry } from '../lib/learnerDetail';
import CohortDashboard from './staff/CohortDashboard';
import LearnerDetail from './staff/LearnerDetail';
import CohortManagement from './staff/CohortManagement';
import ReviewQueue from './staff/ReviewQueue';
import UsageMonitoring from './staff/UsageMonitoring';
import CmsHome from './cms/CmsHome';
import CourseManagement from './cms/CourseManagement';

// Staff landing reached via the role-gated `staff` view (P5.1d). The cohort
// dashboard (P5.2b) is live at the top; selecting a learner drills into their
// per-learner detail (P5.2c). Admins also get cohort management (P5.5a) — an
// in-page view (no new top-level View), gated to admins (champions don't manage
// cohorts; the admin-cohorts Edge Function enforces the same). The review queue
// (P5.5b) remains a "soon" tile.

export default function StaffArea({ role }: { role: Role }) {
  const [selected, setSelected] = useState<LearnerRosterEntry | null>(null);
  const [showCohorts, setShowCohorts] = useState(false);
  const [showReviewQueue, setShowReviewQueue] = useState(false);
  const [showCms, setShowCms] = useState(false);
  const [showUsage, setShowUsage] = useState(false);
  const [showCourses, setShowCourses] = useState(false);
  const isAdmin = role === 'admin';

  if (selected) {
    return (
      <div className="max-w-5xl mx-auto">
        <LearnerDetail learner={selected} onBack={() => setSelected(null)} />
      </div>
    );
  }

  if (showReviewQueue) {
    return (
      <div className="max-w-5xl mx-auto">
        <ReviewQueue onBack={() => setShowReviewQueue(false)} />
      </div>
    );
  }

  if (showCohorts && isAdmin) {
    return (
      <div className="max-w-5xl mx-auto">
        <CohortManagement onBack={() => setShowCohorts(false)} />
      </div>
    );
  }

  if (showCms && isAdmin) {
    return (
      <div className="max-w-5xl mx-auto">
        <CmsHome onBack={() => setShowCms(false)} />
      </div>
    );
  }

  if (showUsage && isAdmin) {
    return (
      <div className="max-w-5xl mx-auto">
        <UsageMonitoring onBack={() => setShowUsage(false)} />
      </div>
    );
  }

  if (showCourses && isAdmin) {
    return (
      <div className="max-w-5xl mx-auto">
        <CourseManagement onBack={() => setShowCourses(false)} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-10">
      <header className="space-y-2">
        <span className="text-[11px] font-bold uppercase tracking-widest text-nava-green">
          {isAdmin ? 'Admin' : 'Champion'} area
        </span>
        <h1 className="text-2xl font-bold text-gray-900" tabIndex={-1}>
          Cohort dashboard
        </h1>
        <p className="text-sm text-gray-600">
          Completion, quiz scores, and review load for the cohorts you can see.
        </p>
      </header>

      <CohortDashboard onSelectLearner={setSelected} />

      <div className="space-y-3 border-t border-gray-200 pt-8">
        {/* Cohort management — admins get a live entry; champions see it as upcoming. */}
        {isAdmin ? (
          <button
            onClick={() => setShowCohorts(true)}
            className="flex w-full items-start gap-4 rounded-xl border border-gray-200 bg-white p-4 text-left hover:bg-gray-50 transition-colors"
          >
            <Users className="w-5 h-5 text-nava-green shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-gray-900">Cohort management</h2>
              <p className="mt-1 text-sm text-gray-600">
                Create cohorts, enroll learners, and assign champions.
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" aria-hidden="true" />
          </button>
        ) : (
          <ComingSoon
            icon={Users}
            title="Cohort management"
            detail="Create cohorts, enroll learners, and assign champions."
            slice="P5.5 · admin"
          />
        )}

        {/* Content management (P5.4): admins get a live entry; champions see it as upcoming. */}
        {isAdmin ? (
          <button
            onClick={() => setShowCms(true)}
            className="flex w-full items-start gap-4 rounded-xl border border-gray-200 bg-white p-4 text-left hover:bg-gray-50 transition-colors"
          >
            <FileText className="w-5 h-5 text-nava-green shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-gray-900">Content management</h2>
              <p className="mt-1 text-sm text-gray-600">
                Browse every lesson and its editorial status.
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" aria-hidden="true" />
          </button>
        ) : (
          <ComingSoon
            icon={FileText}
            title="Content management"
            detail="Browse and edit lessons across the matrix."
            slice="P5.4 · admin"
          />
        )}

        {/* Course management (restructure U3): admin-only. Champions see it as upcoming. */}
        {isAdmin ? (
          <button
            onClick={() => setShowCourses(true)}
            className="flex w-full items-start gap-4 rounded-xl border border-gray-200 bg-white p-4 text-left hover:bg-gray-50 transition-colors"
          >
            <BookOpen className="w-5 h-5 text-nava-green shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-gray-900">Course management</h2>
              <p className="mt-1 text-sm text-gray-600">
                Author course weeks and assign published modules.
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" aria-hidden="true" />
          </button>
        ) : (
          <ComingSoon
            icon={BookOpen}
            title="Course management"
            detail="Author course weeks and assign published modules."
            slice="U3 · admin"
          />
        )}

        {/* Usage monitoring (P6.2): admin-only (usage is admin scope, not champion).
            Champions see it as upcoming. */}
        {isAdmin ? (
          <button
            onClick={() => setShowUsage(true)}
            className="flex w-full items-start gap-4 rounded-xl border border-gray-200 bg-white p-4 text-left hover:bg-gray-50 transition-colors"
          >
            <Activity className="w-5 h-5 text-nava-green shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-gray-900">Usage monitoring</h2>
              <p className="mt-1 text-sm text-gray-600">
                Per-user Claude token and call totals, with outlier flagging.
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" aria-hidden="true" />
          </button>
        ) : (
          <ComingSoon
            icon={Activity}
            title="Usage monitoring"
            detail="Per-user Claude token and call totals, with outlier flagging."
            slice="P6.2 · admin"
          />
        )}

        {/* Review queue (P5.5b): champions + admins; RLS scopes the content. */}
        <button
          onClick={() => setShowReviewQueue(true)}
          className="flex w-full items-start gap-4 rounded-xl border border-gray-200 bg-white p-4 text-left hover:bg-gray-50 transition-colors"
        >
          <ClipboardList className="w-5 h-5 text-nava-green shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-gray-900">Review queue</h2>
            <p className="mt-1 text-sm text-gray-600">
              Open learner lab submissions awaiting review.
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function ComingSoon({
  icon: Icon,
  title,
  detail,
  slice,
}: {
  icon: typeof ClipboardList;
  title: string;
  detail: string;
  slice: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-4">
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
    </div>
  );
}

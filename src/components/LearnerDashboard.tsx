import { Loader2, AlertTriangle } from 'lucide-react';
import type { CurriculumSection } from '../types';
import { useLearnerDetail } from '../lib/useLearnerDetail';
import { summarizeOwnProgress } from '../lib/learnerSelf';
import { buildWeekProgress, currentWeek, type WeekProgress } from '../lib/courseWeekProgress';
import {
  formatPct,
  StatCard,
  ModuleProgressTable,
  LabSubmissionsList,
} from './progress/ProgressPanels';
import LearnerPortfolio from './progress/LearnerPortfolio';

// Learner self-view dashboard (P5.3a, redesigned 2026-07-21 — see
// docs/superpowers/specs/2026-07-21-learner-dashboard-redesign-design.md). Reuses
// the P5.2c per-learner data-access (fetchLearnerDetail) at the owner-RLS path —
// userId is the signed-in user, so the existing owner policies already permit every
// read; no new policy or migration. INVARIANT (U13): this learner surface never
// reads the staff aggregation views (learner_progress_summary etc.) — their
// viewer-independent denominators are staff semantics by design. Asserted by
// learnerDetail.test.ts.
//
// Two blocks: "Course 1" (primary — completion/current week/labs completed, scoped
// to origin==='course', plus a per-week list) and "Supplemental & resources"
// (secondary — completion plus Avg quiz score/GLAT/Labs in review, which only have
// real data for matrix+custom content). `sections` is passed down from App.tsx (the
// same curriculum structure Sidebar renders) purely to derive week labels/membership
// — completion truth stays in `detail`, fetched independently under owner RLS.

function WeekRow({ week, title, completedCount, totalCount }: WeekProgress) {
  const pct = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);
  return (
    <li className="rounded-xl border border-gray-200 bg-white px-4 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-gray-500">{week}</span>
        <span className="text-[11px] font-semibold tabular-nums text-gray-500">
          {completedCount} of {totalCount}
        </span>
      </div>
      <p className="truncate text-sm font-medium text-gray-900">{title}</p>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
        <div className="h-full rounded-full bg-nava-plum" style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}

export default function LearnerDashboard({
  userId,
  sections,
}: {
  userId: string;
  sections: CurriculumSection[];
}) {
  const { detail, loading, error, reload } = useLearnerDetail(userId);
  const summary = detail ? summarizeOwnProgress(detail) : null;
  const weeks = detail
    ? buildWeekProgress(
        sections,
        new Set(detail.modules.filter((m) => m.completed).map((m) => m.cellId)),
      )
    : [];
  const current = currentWeek(weeks);

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <span className="text-[11px] font-bold uppercase tracking-widest text-nava-plum">
          Your dashboard
        </span>
        <h1 className="text-2xl font-bold text-gray-900" tabIndex={-1}>
          Your progress
        </h1>
        <p className="text-sm text-gray-600">
          Your Course 1 progress, plus anything you’ve explored in supplemental coursework and resources.
        </p>
      </header>

      {loading && (
        <div className="flex items-center justify-center py-12" role="status">
          <Loader2 className="w-6 h-6 text-nava-plum animate-spin" aria-hidden="true" />
          <span className="sr-only">Loading your progress…</span>
        </div>
      )}

      {error && !loading && (
        <div className="max-w-md text-center space-y-3 py-8 mx-auto" role="alert">
          <AlertTriangle className="w-8 h-8 text-orange-500 mx-auto" aria-hidden="true" />
          <p className="text-sm text-gray-700">{error}</p>
          <button
            onClick={reload}
            className="px-5 py-2 bg-nava-green hover:bg-nava-green/90 text-white rounded-xl font-bold transition-all"
          >
            Retry
          </button>
        </div>
      )}

      {detail && summary && !loading && !error && (
        <>
          {weeks.length > 0 && current ? (
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-gray-900">Course 1</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatCard
                  label="Completion"
                  value={formatPct(summary.course.completionPct)}
                  note={`${summary.course.completedCount} of ${summary.course.totalCount} modules`}
                />
                <StatCard
                  label="Current week"
                  value={current.complete ? 'Complete' : current.week}
                  note={current.title}
                />
                <StatCard label="Labs completed" value={String(summary.course.labsCompleted)} />
              </div>
              <ul className="space-y-2">
                {weeks.map((w) => (
                  <WeekRow key={w.id} {...w} />
                ))}
              </ul>
            </section>
          ) : (
            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-sm text-gray-600">You’re not enrolled in Course 1 yet.</p>
            </section>
          )}

          {summary.supplemental.totalCount > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-gray-900">Supplemental & resources</h2>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard
                  label="Explored"
                  value={formatPct(summary.supplemental.completionPct)}
                  note={`${summary.supplemental.completedCount} of ${summary.supplemental.totalCount}`}
                />
                <StatCard label="Avg quiz score" value={formatPct(summary.supplemental.avgQuizPct)} />
                <StatCard label="GLAT" value={summary.supplemental.glatPassed ? 'Passed' : 'Not yet'} />
                <StatCard label="Labs in review" value={String(summary.supplemental.reviewableLabs)} />
              </div>
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">Module progress</h2>
            <ModuleProgressTable modules={detail.modules} />
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">Your lab submissions</h2>
            <LabSubmissionsList
              labs={detail.labs}
              emptyText="You haven’t submitted any labs yet."
            />
          </section>
        </>
      )}

      {/* Portfolio & calibration artifacts (P5.3b). Independent fetch + states, so
          it renders even if the summary/module fetch above failed. */}
      <LearnerPortfolio userId={userId} />
    </div>
  );
}

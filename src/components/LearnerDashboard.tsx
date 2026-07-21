import { useState, type ReactNode } from 'react';
import { ChevronDown, Loader2, AlertTriangle } from 'lucide-react';
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
// Two collapsible blocks (mirrors the Sidebar's own section-toggle pattern):
// "Course 1" (primary, expanded by default — completion/current week, scoped to
// origin==='course', plus a per-week list and its own module rollup with no quiz
// column, since Course 1 has no quizzes) and "Supplemental & resources" (secondary,
// collapsed by default — completion plus Avg quiz score/GLAT/Labs in review, which
// only have real data for matrix+custom content, its own module rollup with the
// quiz column, the lab submissions list, AND the portfolio/calibration panels
// (P5.3b) — labs and portfolio artifacts are both supplemental practice work,
// grouped here rather than as their own top-level sections).
// `sections` is passed down from App.tsx (the same curriculum structure Sidebar
// renders) purely to derive week labels/membership — completion truth stays in
// `detail`, fetched independently under owner RLS.

/**
 * A collapsible dashboard section (mirrors the Sidebar's own section-toggle
 * pattern — chevron + aria-expanded/aria-controls — so the two surfaces read as
 * one system). Expansion state is in-memory only, per section.
 */
function CollapsibleSection({
  id,
  title,
  defaultExpanded,
  children,
}: {
  id: string;
  title: string;
  defaultExpanded: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const panelId = `dashboard-section-${id}`;
  return (
    <section className="space-y-3">
      <h2>
        <button
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="w-full flex items-center justify-between gap-2 text-left"
        >
          <span className="text-lg font-bold text-gray-900">{title}</span>
          <ChevronDown
            className={`w-5 h-5 shrink-0 text-gray-500 transition-transform ${expanded ? '' : '-rotate-90'}`}
            aria-hidden="true"
          />
        </button>
      </h2>
      {expanded && (
        <div id={panelId} className="space-y-3">
          {children}
        </div>
      )}
    </section>
  );
}

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
  // Split the module rollup by section so Course 1 gets its own list (no quiz
  // column — Course 1 has no quizzes) directly under its stats, and Supplemental +
  // Resources gets its own list (with the quiz column, which is real for matrix
  // content) directly under its stats.
  const courseModules = detail?.modules.filter((m) => m.origin === 'course') ?? [];
  const supplementalModules = detail?.modules.filter((m) => m.origin !== 'course') ?? [];

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
            <CollapsibleSection id="course-1" title="Course 1" defaultExpanded>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              </div>
              <ul className="space-y-2">
                {weeks.map((w) => (
                  <WeekRow key={w.id} {...w} />
                ))}
              </ul>
              <ModuleProgressTable modules={courseModules} showQuizColumn={false} />
            </CollapsibleSection>
          ) : (
            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-sm text-gray-600">You’re not enrolled in Course 1 yet.</p>
            </section>
          )}

          {summary.supplemental.totalCount > 0 && (
            // Labs are supplemental work, so the submissions list is grouped in
            // here rather than as its own top-level section.
            <CollapsibleSection
              id="supplemental"
              title="Supplemental & resources"
              defaultExpanded={false}
            >
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
              <ModuleProgressTable modules={supplementalModules} />
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-gray-700">Your lab submissions</h3>
                <LabSubmissionsList
                  labs={detail.labs}
                  emptyText="You haven’t submitted any labs yet."
                />
              </div>
              {/* Portfolio & calibration artifacts (P5.3b) — grouped here with lab
                  submissions, since both are supplemental practice work. */}
              <LearnerPortfolio userId={userId} />
            </CollapsibleSection>
          )}
        </>
      )}
    </div>
  );
}

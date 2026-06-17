import { Loader2, AlertTriangle } from 'lucide-react';
import { useLearnerDetail } from '../lib/useLearnerDetail';
import { summarizeOwnProgress } from '../lib/learnerSelf';
import {
  formatPct,
  StatCard,
  ModuleProgressTable,
  LabSubmissionsList,
} from './progress/ProgressPanels';

// Learner self-view dashboard (P5.3a): a learner's own progress, quiz scores, and
// lab submission statuses in one place. Reuses the P5.2c per-learner data-access
// (fetchLearnerDetail) at the owner-RLS path — userId is the signed-in user, so the
// existing owner policies already permit every read; no new policy or migration.
// Summary cards are derived locally (summarizeOwnProgress) so they stay consistent
// with the published-module table below. Read-only: records nothing, no onComplete,
// no effect on gating.

export default function LearnerDashboard({ userId }: { userId: string }) {
  const { detail, loading, error, reload } = useLearnerDetail(userId);
  const summary = detail ? summarizeOwnProgress(detail) : null;

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <span className="text-[11px] font-bold uppercase tracking-widest text-nava-green">
          Your dashboard
        </span>
        <h1 className="text-2xl font-bold text-gray-900" tabIndex={-1}>
          Your progress
        </h1>
        <p className="text-sm text-gray-600">
          Your completion, quiz scores, and lab submissions across the course.
        </p>
      </header>

      {loading && (
        <div className="flex items-center justify-center py-12" role="status">
          <Loader2 className="w-6 h-6 text-nava-green animate-spin" aria-hidden="true" />
          <span className="sr-only">Loading your progress…</span>
        </div>
      )}

      {error && !loading && (
        <div className="max-w-md text-center space-y-3 py-8 mx-auto" role="alert">
          <AlertTriangle className="w-8 h-8 text-orange-500 mx-auto" aria-hidden="true" />
          <p className="text-sm text-gray-700">{error}</p>
          <button
            onClick={reload}
            className="px-5 py-2 bg-nava-green hover:bg-nava-plum text-white rounded-xl font-bold transition-all"
          >
            Retry
          </button>
        </div>
      )}

      {detail && summary && !loading && !error && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Completion"
              value={formatPct(summary.completionPct)}
              note={`${summary.completedCount} of ${summary.totalCount} modules`}
            />
            <StatCard label="Avg quiz score" value={formatPct(summary.avgQuizPct)} />
            <StatCard label="GLAT" value={summary.glatPassed ? 'Passed' : 'Not yet'} />
            <StatCard label="Labs in review" value={String(summary.reviewableLabs)} />
          </div>

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
    </div>
  );
}

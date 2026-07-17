import { ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';
import { useLearnerDetail } from '../../lib/useLearnerDetail';
import type { LearnerRosterEntry } from '../../lib/learnerDetail';
import {
  formatPct,
  StatCard,
  ModuleProgressTable,
  LabSubmissionsList,
} from '../progress/ProgressPanels';

// Staff per-learner drill-down (P5.2c). Best-per-module rollup (progress +
// scores) plus lab submission status badges — no transcript reading (that's the
// P5.5 review queue). Data is RLS-scoped by P5.1c; reachability by RoleGuard
// (P5.1d). The learner identity comes from the roster entry the caller picked;
// the per-module/lab detail is fetched on demand by id. The progress table + lab
// list + cards are shared presentational primitives (P5.3a) reused by the learner
// self-view (LearnerDashboard).

export default function LearnerDetail({
  learner,
  onBack,
}: {
  learner: LearnerRosterEntry;
  onBack: () => void;
}) {
  const { detail, loading, error, reload } = useLearnerDetail(learner.userId);

  return (
    <div className="space-y-8">
      <div>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-nava-plum hover:text-nava-plum transition-colors"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back to cohorts
        </button>
      </div>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-900" tabIndex={-1}>
          {learner.name}
        </h1>
        {learner.email && learner.email !== learner.name && (
          <p className="text-sm text-gray-500">{learner.email}</p>
        )}
      </header>

      {/*
        Scope note: completionPct (P5.2a view) is published-module-scoped and so
        matches the per-module table below; avgQuizPct is NOT — it averages best
        scores across every attempted module, including in-review cells the table
        hides. Hence the card's clarifying note, so the higher figure doesn't read
        as contradicting the table. (Keeping avgQuizPct as-is so this card matches
        the cohort dashboard's per-learner average.)
      */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Completion" value={formatPct(learner.completionPct)} />
        <StatCard
          label="Avg quiz score"
          value={formatPct(learner.avgQuizPct)}
          note="across all attempted modules, incl. in review"
        />
        <StatCard label="GLAT" value={learner.glatPassed ? 'Passed' : 'Not yet'} />
        <StatCard label="Labs awaiting review" value={String(learner.reviewableLabs)} />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12" role="status">
          <Loader2 className="w-6 h-6 text-nava-plum animate-spin" aria-hidden="true" />
          <span className="sr-only">Loading learner detail…</span>
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

      {detail && !loading && !error && (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">Module progress</h2>
            <ModuleProgressTable modules={detail.modules} />
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">Lab submissions</h2>
            <LabSubmissionsList labs={detail.labs} emptyText="No lab submissions yet." />
          </section>
        </>
      )}
    </div>
  );
}

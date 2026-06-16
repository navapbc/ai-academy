import { Fragment } from 'react';
import { ArrowLeft, Loader2, AlertTriangle, Check } from 'lucide-react';
import { useLearnerDetail } from '../../lib/useLearnerDetail';
import type { LearnerRosterEntry, LearnerModuleRow } from '../../lib/learnerDetail';

// Staff per-learner drill-down (P5.2c). Best-per-module rollup (progress +
// scores) plus lab submission status badges — no transcript reading (that's the
// P5.5 review queue). Data is RLS-scoped by P5.1c; reachability by RoleGuard
// (P5.1d). The learner identity comes from the roster entry the caller picked;
// the per-module/lab detail is fetched on demand by id.

/** 0..1 fraction → "NN%", or an em dash when there's no data. */
function formatPct(n: number | null): string {
  return n === null ? '—' : `${Math.round(n * 100)}%`;
}

const STAGE_LABELS: Record<string, string> = {
  '1a': 'Stage 1a',
  '1b': 'Stage 1b',
  '2': 'Stage 2',
};

function StatCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-[11px] font-bold uppercase tracking-widest text-gray-500">{label}</div>
      <div
        className="mt-1 text-2xl font-bold text-gray-900"
        aria-label={value === '—' ? 'No data' : undefined}
      >
        {value}
      </div>
      {note && <div className="mt-1 text-[11px] text-gray-400">{note}</div>}
    </div>
  );
}

/** Per-lab status colors; unknown statuses fall back to gray. */
const LAB_STATUS_COLORS: Record<string, string> = {
  reviewable: 'bg-amber-100 text-amber-800',
  reviewed: 'bg-nava-green/15 text-nava-green',
  returned: 'bg-red-100 text-red-700',
  submitted: 'bg-gray-100 text-gray-700',
};

function LabStatusBadge({ status }: { status: string | null }) {
  const label = status ?? 'unknown';
  const cls = (status && LAB_STATUS_COLORS[status]) ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>
  );
}

function ModuleRowItem({ row }: { row: LearnerModuleRow }) {
  return (
    <tr className="border-t border-gray-100">
      <td className="py-2 pr-3">
        <span className="font-mono text-xs text-gray-500">{row.cellId}</span>{' '}
        <span className="text-gray-900">{row.title}</span>
      </td>
      <td className="py-2 px-3 text-center">
        {row.completed ? (
          <span className="inline-flex items-center gap-1 text-nava-green font-semibold">
            <Check className="w-4 h-4" aria-hidden="true" />
            <span>Done</span>
          </span>
        ) : (
          <span className="text-gray-400">
            <span aria-hidden="true">—</span>
            <span className="sr-only">Not completed</span>
          </span>
        )}
      </td>
      <td className="py-2 pl-3 text-right">
        {row.bestQuizPct === null ? (
          <span className="text-gray-400">
            <span aria-hidden="true">—</span>
            <span className="sr-only">No quiz attempt</span>
          </span>
        ) : (
          <span className={row.quizPassed ? 'text-gray-900' : 'text-red-600'}>
            {formatPct(row.bestQuizPct)}
          </span>
        )}
      </td>
    </tr>
  );
}

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
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-nava-green hover:text-nava-plum transition-colors"
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
          <Loader2 className="w-6 h-6 text-nava-green animate-spin" aria-hidden="true" />
          <span className="sr-only">Loading learner detail…</span>
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

      {detail && !loading && !error && (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">Module progress</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-widest text-gray-500">
                  <th className="py-1 pr-3">Module</th>
                  <th className="py-1 px-3 text-center">Completed</th>
                  <th className="py-1 pl-3 text-right">Best quiz</th>
                </tr>
              </thead>
              <tbody>
                {detail.modules.map((row, i) => {
                  const prev = detail.modules[i - 1];
                  const showStage = !prev || prev.stage !== row.stage;
                  return (
                    <Fragment key={row.cellId}>
                      {showStage && (
                        <tr>
                          <td
                            colSpan={3}
                            className="pt-4 pb-1 text-[11px] font-bold uppercase tracking-widest text-nava-green"
                          >
                            {STAGE_LABELS[row.stage] ?? row.stage}
                          </td>
                        </tr>
                      )}
                      <ModuleRowItem row={row} />
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">Lab submissions</h2>
            {detail.labs.length === 0 ? (
              <p className="text-sm text-gray-500">No lab submissions yet.</p>
            ) : (
              <ul className="space-y-2">
                {detail.labs.map((lab) => (
                  <li
                    key={lab.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5"
                  >
                    <span className="font-mono text-sm text-gray-700">{lab.labId}</span>
                    <LabStatusBadge status={lab.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

import type { LearnerLabRow, LearnerModuleRow } from '../../lib/learnerDetail';

import { Check } from 'lucide-react';
import { Fragment } from 'react';

// Shared progress presentational primitives (P5.3a). Lifted verbatim from the
// staff per-learner drill-down (P5.2c) so the staff view (LearnerDetail) and the
// learner self-view (LearnerDashboard) render module progress + lab status
// identically. Pure presentational — no data-access, no role awareness.

/** 0..1 fraction → "NN%", or an em dash when there's no data. */
export function formatPct(n: number | null): string {
  return n === null ? '—' : `${Math.round(n * 100)}%`;
}

export function StatCard({ label, value, note }: { label: string; value: string; note?: string }) {
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
  reviewed: 'bg-nava-plum/15 text-nava-plum',
  returned: 'bg-red-100 text-red-700',
  submitted: 'bg-gray-100 text-gray-700',
};

export function LabStatusBadge({ status }: { status: string | null }) {
  const label = status ?? 'unknown';
  const cls = (status && LAB_STATUS_COLORS[status]) ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>
  );
}

function ModuleRowItem({ row, showQuizColumn }: { row: LearnerModuleRow; showQuizColumn: boolean }) {
  return (
    <tr className="border-t border-gray-100">
      <td className="py-2 pr-3">
        {/* <span className="font-mono text-xs text-gray-500">{row.cellId}</span>{' '} */}
        <span className="text-gray-900">{row.title}</span>
      </td>
      <td className="py-2 px-3 text-center">
        {row.completed ? (
          <span className="inline-flex items-center gap-1 text-nava-plum font-semibold">
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
      {showQuizColumn && (
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
      )}
    </tr>
  );
}

/**
 * Best-per-module rollup table, grouped by curriculum section (U13): course
 * lessons → Supplemental coursework → Resources — the same sections the
 * learner nav renders (rows arrive pre-ordered from buildLearnerModuleRows).
 * `showQuizColumn` (default true) hides the "Best quiz" column entirely — Course 1
 * modules never have quizzes, so callers rendering a course-only slice pass `false`
 * rather than showing a column that's always an em dash.
 */
export function ModuleProgressTable({
  modules,
  showQuizColumn = true,
}: {
  modules: LearnerModuleRow[];
  showQuizColumn?: boolean;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[11px] font-bold uppercase tracking-widest text-gray-500">
          <th className="py-1 pr-3">Module</th>
          <th className="py-1 px-3 text-center">Completed</th>
          {showQuizColumn && <th className="py-1 pl-3 text-right">Best quiz</th>}
        </tr>
      </thead>
      <tbody>
        {modules.map((row, i) => {
          const prev = modules[i - 1];
          const showSection = !prev || prev.section !== row.section;
          return (
            <Fragment key={row.cellId}>
              {showSection && (
                <tr>
                  <td
                    colSpan={showQuizColumn ? 3 : 2}
                    className="pt-4 pb-1 text-[11px] font-bold uppercase tracking-widest text-nava-plum"
                  >
                    {row.section}
                  </td>
                </tr>
              )}
              <ModuleRowItem row={row} showQuizColumn={showQuizColumn} />
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

/** Lab submissions list with status badges (badges only — no transcript reading). */
export function LabSubmissionsList({
  labs,
  emptyText,
}: {
  labs: LearnerLabRow[];
  emptyText: string;
}) {
  if (labs.length === 0) {
    return <p className="text-sm text-gray-500">{emptyText}</p>;
  }
  return (
    <ul className="space-y-2">
      {labs.map((lab) => (
        <li
          key={lab.id}
          className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5"
        >
          <span className="font-mono text-sm text-gray-700">{lab.labId}</span>
          <LabStatusBadge status={lab.status} />
        </li>
      ))}
    </ul>
  );
}

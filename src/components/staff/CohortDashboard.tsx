import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, AlertTriangle, ChevronRight, Download } from 'lucide-react';
import { useDashboard } from '../../lib/useDashboard';
import type { CohortSummary, ScoreDistribution } from '../../lib/dashboard';
import type { LearnerRosterEntry } from '../../lib/learnerDetail';
import { fetchCohortEvidence } from '../../lib/evidenceExport';
import { serializeEvidenceCsv, buildCsvFilename, downloadCsv } from '../../lib/csvExport';
import { downloadEvidencePdf } from '../../lib/pdfExport';

// Staff cohort dashboard (P5.2b): the first UI on the P5.2a aggregation views.
// Reachability is gated by RoleGuard (P5.1d); data is scoped by RLS (P5.1c/P5.2a).
// Per-cohort blocks render straight from the views — no blended-average math.
// The cohort filter is client-side (the scoped views already returned every
// cohort the caller can see). Realtime/polling is P5.2d.

/** 0..1 fraction → "NN%", or an em dash when there's no data. */
function formatPct(n: number | null): string {
  return n === null ? '—' : `${Math.round(n * 100)}%`;
}

const BANDS: { key: keyof ScoreDistribution; label: string }[] = [
  { key: 'lt60', label: '<60' },
  { key: '60to79', label: '60–79' },
  { key: '80to100', label: '80–100' },
];

const BAND_COLORS: Record<keyof ScoreDistribution, string> = {
  lt60: 'bg-red-400',
  '60to79': 'bg-amber-400',
  '80to100': 'bg-nava-green/80',
};

function SummaryCard({ label, value, note }: { label: string; value: string; note?: string }) {
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

function DistributionBar({ dist }: { dist: ScoreDistribution }) {
  const total = dist.lt60 + dist['60to79'] + dist['80to100'];
  if (total === 0) {
    return <p className="text-sm text-gray-500">No quiz data yet.</p>;
  }
  return (
    <div className="space-y-2">
      <div className="flex h-3 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
        {BANDS.map(({ key }) => {
          const pct = (dist[key] / total) * 100;
          if (pct === 0) return null;
          return <div key={key} className={BAND_COLORS[key]} style={{ width: `${pct}%` }} />;
        })}
      </div>
      <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600">
        {BANDS.map(({ key, label }) => (
          <li key={key}>
            <span className="font-semibold text-gray-900">{dist[key]}</span> learner
            {dist[key] === 1 ? '' : 's'} scoring {label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Clickable learner roster — the entry point to the P5.2c per-learner drill-down. */
function LearnerRoster({
  learners,
  onSelectLearner,
}: {
  learners: LearnerRosterEntry[];
  onSelectLearner: (learner: LearnerRosterEntry) => void;
}) {
  if (learners.length === 0) {
    return <p className="text-sm text-gray-500">No learners enrolled yet.</p>;
  }
  return (
    <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
      {learners.map((l) => (
        <li key={l.userId}>
          <button
            onClick={() => onSelectLearner(l)}
            className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
          >
            <span className="min-w-0 truncate font-medium text-gray-900">{l.name}</span>
            <span className="flex shrink-0 items-center gap-3 text-sm text-gray-500">
              <span>{formatPct(l.completionPct)} complete</span>
              {l.reviewableLabs > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                  {l.reviewableLabs} to review
                </span>
              )}
              <ChevronRight className="w-4 h-4 text-gray-400" aria-hidden="true" />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function CohortBlock({
  summary,
  dist,
  learners,
  onSelectLearner,
}: {
  summary: CohortSummary;
  dist: ScoreDistribution;
  learners: LearnerRosterEntry[];
  onSelectLearner: (learner: LearnerRosterEntry) => void;
}) {
  return (
    <section className="space-y-4">
      <header className="flex items-baseline gap-3">
        <h2 className="text-lg font-bold text-gray-900">{summary.cohortName}</h2>
        {summary.archived && (
          <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
            Archived · read-only
          </span>
        )}
        <span className="text-sm text-gray-500">
          {summary.learnerCount} learner{summary.learnerCount === 1 ? '' : 's'}
        </span>
      </header>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Avg completion" value={formatPct(summary.avgCompletionPct)} />
        <SummaryCard label="GLAT pass rate" value={formatPct(summary.glatPassRate)} />
        <SummaryCard label="Avg quiz score" value={formatPct(summary.avgQuizPct)} />
        <SummaryCard label="Labs awaiting review" value={String(summary.reviewableTotal)} />
      </div>
      <DistributionBar dist={dist} />
      <LearnerRoster learners={learners} onSelectLearner={onSelectLearner} />
    </section>
  );
}

const EMPTY_DIST: ScoreDistribution = { lt60: 0, '60to79': 0, '80to100': 0 };

export default function CohortDashboard({
  onSelectLearner,
}: {
  onSelectLearner: (learner: LearnerRosterEntry) => void;
}) {
  const { summaries, distribution, learners, loading, error, reload } = useDashboard();
  const [selected, setSelected] = useState<string>('all');
  // Tracks which export (if any) is in flight, so each button shows its own spinner.
  const [exportState, setExportState] = useState<'idle' | 'csv' | 'pdf' | 'error'>('idle');
  const exportError = useRef<string | null>(null);

  async function handleExport(format: 'csv' | 'pdf') {
    setExportState(format);
    exportError.current = null;
    try {
      const cohortId = selected === 'all' ? undefined : selected;
      const rows = await fetchCohortEvidence(cohortId);
      const cohortName =
        selected === 'all' ? undefined : summaries.find((s) => s.cohortId === selected)?.cohortName;
      if (format === 'csv') {
        downloadCsv(serializeEvidenceCsv(rows), buildCsvFilename(cohortName));
      } else {
        downloadEvidencePdf(rows, { cohortName });
      }
      setExportState('idle');
    } catch (err) {
      exportError.current = err instanceof Error ? err.message : 'Export failed';
      setExportState('error');
    }
  }

  // Group the flat roster by cohort once so each block gets only its learners.
  const learnersByCohort = useMemo(() => {
    const out = new Map<string, LearnerRosterEntry[]>();
    for (const l of learners) {
      if (l.cohortId === null) continue;
      const list = out.get(l.cohortId) ?? [];
      list.push(l);
      out.set(l.cohortId, list);
    }
    return out;
  }, [learners]);

  // If a reload drops the selected cohort (e.g. its last learner left), reset the
  // filter to "all" so the <select> control and the rendered set stay in sync —
  // otherwise the dropdown shows a ghost value while `visible` falls back to all.
  useEffect(() => {
    if (selected !== 'all' && !summaries.some((s) => s.cohortId === selected)) {
      setSelected('all');
    }
  }, [summaries, selected]);

  const visible = useMemo(() => {
    if (selected === 'all') return summaries;
    const found = summaries.find((s) => s.cohortId === selected);
    return found ? [found] : summaries;
  }, [summaries, selected]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16" role="status">
        <Loader2 className="w-6 h-6 text-nava-plum animate-spin" aria-hidden="true" />
        <span className="sr-only">Loading the cohort dashboard…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto text-center space-y-3 py-12" role="alert">
        <AlertTriangle className="w-8 h-8 text-orange-500 mx-auto" aria-hidden="true" />
        <p className="text-sm text-gray-700">{error}</p>
        <button
          onClick={reload}
          className="px-5 py-2 bg-nava-green hover:bg-nava-green/90 text-white rounded-xl font-bold transition-all"
        >
          Retry
        </button>
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <p className="text-sm text-gray-600 py-8">
        No cohorts assigned to you yet. Once learners are enrolled in a cohort you can
        see, their progress will appear here.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="cohort-filter" className="text-sm font-semibold text-gray-700">
          Cohort
        </label>
        <select
          id="cohort-filter"
          value={selected}
          onChange={(e) => { setSelected(e.target.value); setExportState('idle'); }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm"
        >
          <option value="all">All cohorts</option>
          {summaries.map((s) => (
            <option key={s.cohortId} value={s.cohortId}>
              {s.cohortName}
              {s.archived ? ' (archived)' : ''} ({s.learnerCount} learner
              {s.learnerCount === 1 ? '' : 's'})
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => handleExport('csv')}
            disabled={exportState === 'csv' || exportState === 'pdf'}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            aria-label="Download evidence report as CSV"
          >
            {exportState === 'csv' ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="w-4 h-4" aria-hidden="true" />
            )}
            {exportState === 'csv' ? 'Exporting…' : 'Download CSV'}
          </button>
          <button
            onClick={() => handleExport('pdf')}
            disabled={exportState === 'csv' || exportState === 'pdf'}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            aria-label="Download evidence report as PDF"
          >
            {exportState === 'pdf' ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="w-4 h-4" aria-hidden="true" />
            )}
            {exportState === 'pdf' ? 'Exporting…' : 'Download PDF'}
          </button>
        </div>
        {exportState === 'error' && (
          <p className="w-full text-xs text-red-600" role="alert">
            {exportError.current ?? 'Export failed. Please try again.'}
          </p>
        )}
      </div>

      {visible.map((s) => (
        <CohortBlock
          key={s.cohortId}
          summary={s}
          dist={distribution.get(s.cohortId) ?? EMPTY_DIST}
          learners={learnersByCohort.get(s.cohortId) ?? []}
          onSelectLearner={onSelectLearner}
        />
      ))}
    </div>
  );
}

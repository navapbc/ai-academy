import { useMemo, useState } from 'react';
import { ArrowLeft, Loader2, AlertTriangle, AlertCircle } from 'lucide-react';
import { useUsageMonitoring } from '../../lib/useUsageMonitoring';
import {
  WINDOW_OPTIONS,
  DEFAULT_THRESHOLD_TOKENS,
  type UsageByUser,
} from '../../lib/usageMonitoring';

// Admin usage-monitoring panel (P6.2 Unit 3). Read-only per-user Claude token/
// call totals over a selectable window, sortable by any column, with over-
// threshold consumers visually flagged. RLS (`is_admin()`) scopes the data and
// the StaffArea entry + RoleGuard gate reachability to admins. Records nothing.

type SortKey = 'name' | 'callCount' | 'inputTokens' | 'outputTokens' | 'totalTokens';

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: 'name', label: 'User', numeric: false },
  { key: 'callCount', label: 'Calls', numeric: true },
  { key: 'inputTokens', label: 'Input tokens', numeric: true },
  { key: 'outputTokens', label: 'Output tokens', numeric: true },
  { key: 'totalTokens', label: 'Total tokens', numeric: true },
];

const numberFmt = new Intl.NumberFormat('en-US');

function sortRows(rows: UsageByUser[], key: SortKey, dir: 'asc' | 'desc'): UsageByUser[] {
  const sorted = [...rows].sort((a, b) => {
    if (key === 'name') return a.name.localeCompare(b.name);
    return a[key] - b[key];
  });
  return dir === 'asc' ? sorted : sorted.reverse();
}

export default function UsageMonitoring({ onBack }: { onBack: () => void }) {
  const [windowMs, setWindowMs] = useState<number>(WINDOW_OPTIONS[1].ms); // default 7 days
  // Default sort: heaviest total consumer first (matches the builder's default).
  const [sortKey, setSortKey] = useState<SortKey>('totalTokens');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const { rows, loading, error, reload } = useUsageMonitoring(windowMs);

  const sorted = useMemo(() => sortRows(rows, sortKey, sortDir), [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Names default A→Z; numeric columns default high→low.
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back
        </button>
      </div>

      <header className="space-y-2">
        <span className="text-[11px] font-bold uppercase tracking-widest text-nava-green">
          Admin area
        </span>
        <h1 className="text-2xl font-bold text-gray-900" tabIndex={-1}>
          Usage monitoring
        </h1>
        <p className="text-sm text-gray-600">
          Per-user Claude token and call totals over the selected window. Read-only —
          consumers over {numberFmt.format(DEFAULT_THRESHOLD_TOKENS)} total tokens are flagged.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="usage-window" className="text-sm font-semibold text-gray-700">
          Window
        </label>
        <select
          id="usage-window"
          value={windowMs}
          onChange={(e) => setWindowMs(Number(e.target.value))}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm"
        >
          {WINDOW_OPTIONS.map((w) => (
            <option key={w.ms} value={w.ms}>
              {w.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16" role="status">
          <Loader2 className="w-6 h-6 text-nava-green animate-spin" aria-hidden="true" />
          <span className="sr-only">Loading usage monitoring…</span>
        </div>
      ) : error ? (
        <div className="max-w-md mx-auto text-center space-y-3 py-12" role="alert">
          <AlertTriangle className="w-8 h-8 text-orange-500 mx-auto" aria-hidden="true" />
          <p className="text-sm text-gray-700">{error}</p>
          <button
            onClick={reload}
            className="px-5 py-2 bg-nava-green hover:bg-nava-plum text-white rounded-xl font-bold transition-all"
          >
            Retry
          </button>
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-gray-600 py-8">
          No Claude usage recorded in this window yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                {COLUMNS.map((col) => (
                  <th key={col.key} scope="col" className={col.numeric ? 'text-right' : ''}>
                    <button
                      onClick={() => toggleSort(col.key)}
                      className={`flex w-full items-center gap-1 px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-gray-500 hover:text-gray-900 transition-colors ${
                        col.numeric ? 'justify-end' : ''
                      }`}
                      aria-label={`Sort by ${col.label}`}
                    >
                      {col.label}
                      {sortKey === col.key && (
                        <span aria-hidden="true">{sortDir === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((r) => (
                <tr
                  key={r.userId}
                  data-flagged={r.overThreshold ? 'true' : undefined}
                  className={r.overThreshold ? 'bg-red-50' : ''}
                >
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{r.name}</span>
                      {r.overThreshold && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                          <AlertCircle className="w-3 h-3" aria-hidden="true" />
                          Over threshold
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                    {numberFmt.format(r.callCount)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                    {numberFmt.format(r.inputTokens)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                    {numberFmt.format(r.outputTokens)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900">
                    {numberFmt.format(r.totalTokens)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

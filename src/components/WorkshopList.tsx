import { Loader2, AlertTriangle, PlayCircle, Layers, CheckCircle2 } from 'lucide-react';
import { useWorkshops } from '../lib/useWorkshops';
import { workshopProgress, type Workshop } from '../lib/workshops';

// Learner workshop list (X.3 Unit 4, R3): the available admin-authored workshops
// with per-workshop progress (completed/total steps). Launching a workshop opens
// the guided runner (onLaunch). Read-only: progress is DERIVED from the learner's
// completed module ids passed down from App (which owns useProgress) — this list
// writes nothing (R5).

interface Props {
  /** The signed-in learner's completed module ids (from App's useProgress). */
  completedModuleIds: string[];
  /** Open the guided runner for a workshop. */
  onLaunch: (workshopId: string) => void;
}

export default function WorkshopList({ completedModuleIds, onLaunch }: Props) {
  const { workshops, loading, error, reload } = useWorkshops();

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <span className="text-[11px] font-bold uppercase tracking-widest text-nava-green">
          Guided paths
        </span>
        <h1 className="text-2xl font-bold text-gray-900" tabIndex={-1}>
          Workshops
        </h1>
        <p className="text-sm text-gray-600">
          Curated, ordered paths through the curriculum. Your progress is shared with
          the modules you complete anywhere.
        </p>
      </header>

      {loading && (
        <div className="flex items-center justify-center py-12" role="status">
          <Loader2 className="w-6 h-6 text-nava-green animate-spin" aria-hidden="true" />
          <span className="sr-only">Loading workshops…</span>
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

      {!loading && !error && workshops.length === 0 && (
        <div className="max-w-md text-center space-y-3 py-12 mx-auto">
          <Layers className="w-8 h-8 text-gray-400 mx-auto" aria-hidden="true" />
          <p className="text-sm text-gray-600">
            No workshops are available yet. Check back soon.
          </p>
        </div>
      )}

      {!loading && !error && workshops.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {workshops.map((workshop) => (
            <WorkshopCard
              key={workshop.id}
              workshop={workshop}
              completedModuleIds={completedModuleIds}
              onLaunch={() => onLaunch(workshop.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function WorkshopCard({
  workshop,
  completedModuleIds,
  onLaunch,
}: {
  workshop: Workshop;
  completedModuleIds: string[];
  onLaunch: () => void;
}) {
  const { completed, total } = workshopProgress(workshop.stepCellIds, completedModuleIds);
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isDone = total > 0 && completed === total;

  return (
    <li className="flex flex-col justify-between gap-4 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-gray-900">{workshop.title}</h2>
          {isDone && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-nava-mint px-2.5 py-1 text-[11px] font-bold text-nava-green">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              Complete
            </span>
          )}
        </div>
        {workshop.intro && <p className="text-sm text-gray-600">{workshop.intro}</p>}
      </div>

      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between text-[11px] font-bold text-gray-500 tabular-nums">
            <span>
              {completed} of {total} steps
            </span>
            <span>{pct}%</span>
          </div>
          <div
            className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200"
            role="progressbar"
            aria-label={`${workshop.title} progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <div className="h-full bg-nava-plum" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <button
          onClick={onLaunch}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-nava-green px-6 py-3 font-bold text-white shadow-sm transition-all hover:bg-nava-plum active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={total === 0}
        >
          <PlayCircle className="w-5 h-5" aria-hidden="true" />
          {completed > 0 && !isDone ? 'Continue workshop' : 'Start workshop'}
        </button>
      </div>
    </li>
  );
}

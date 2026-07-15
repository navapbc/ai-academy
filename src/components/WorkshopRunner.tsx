import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Lock, ArrowLeft } from 'lucide-react';
import type { AIPersona, Module } from '../types';
import type { CompletedVia } from '../lib/progress';
import { workshopProgress, type Workshop } from '../lib/workshops';
import ModuleRenderer from './ModuleRenderer';

// Guided workshop stepper (X.3 Unit 4, R4/R5/R6). Walks a workshop's ordered
// step_cell_ids one at a time, rendering each step's underlying module via
// ModuleRenderer REUSED VERBATIM — so gating, completion, and every module
// callback fire exactly as they do standalone (R6). The runner writes NO new
// progress: completing a step goes through the SAME onComplete the standalone
// module uses (App's completeModule), so there is never a second write (R5).
// Overall progress is DERIVED from the learner's completed module ids.
//
// A step whose module is unavailable — not in the published/unarchived curriculum
// (moduleById miss) or gated/locked for this learner (isStepLocked) — renders a
// clear "unavailable"/"locked" state instead of crashing, and never bypasses
// gating. Next/prev still work across such steps.

interface Props {
  workshop: Workshop;
  /** Resolve a step's cell_id to its published/unarchived Module (miss = unavailable). */
  moduleById: (cellId: string) => Module | undefined;
  /** Whether a resolved module is currently gated/locked for this learner. */
  isStepLocked: (module: Module) => boolean;
  /** The learner's completed module ids (for derived overall progress). */
  completedModuleIds: string[];
  selectedPersona: AIPersona;
  /**
   * Completion path for a step's module — the SAME callback the standalone module
   * uses (App's completeModule), so the runner adds no second write (R5/R6).
   * `via` threads through untouched (U9 completed_via stamping).
   */
  onCompleteModule: (moduleId: string, via: CompletedVia) => void;
  /** Back to the workshop list. */
  onExit: () => void;
}

export default function WorkshopRunner({
  workshop,
  moduleById,
  isStepLocked,
  completedModuleIds,
  selectedPersona,
  onCompleteModule,
  onExit,
}: Props) {
  const steps = workshop.stepCellIds;
  const total = steps.length;
  const [index, setIndex] = useState(0);

  // Clamp defensively in case the workshop shape changes under us.
  const current = Math.min(index, Math.max(total - 1, 0));
  const cellId = steps[current];

  const { completed } = useMemo(
    () => workshopProgress(steps, completedModuleIds),
    [steps, completedModuleIds],
  );

  const module = cellId ? moduleById(cellId) : undefined;
  const locked = module ? isStepLocked(module) : false;

  const goPrev = () => setIndex((i) => Math.max(0, Math.min(i, total - 1) - 1));
  const goNext = () => setIndex((i) => Math.min(total - 1, Math.min(i, total - 1) + 1));

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <button
          onClick={onExit}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-nava-green transition-colors"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          All workshops
        </button>

        <div className="space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-widest text-nava-green">
            Workshop
          </span>
          <h1 className="text-2xl font-bold text-gray-900" tabIndex={-1}>
            {workshop.title}
          </h1>
          {workshop.intro && <p className="text-sm text-gray-600">{workshop.intro}</p>}
        </div>

        {total > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold text-gray-500 tabular-nums">
              <span>
                Step {current + 1} of {total}
              </span>
              <span>
                {completed} of {total} complete
              </span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200"
              role="progressbar"
              aria-label="Workshop progress"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={completed}
            >
              <div
                className="h-full bg-nava-plum"
                style={{ width: `${Math.round((completed / total) * 100)}%` }}
              />
            </div>
          </div>
        ) : null}
      </header>

      {total === 0 ? (
        <div className="max-w-md text-center space-y-3 py-12 mx-auto">
          <p className="text-sm text-gray-600">This workshop has no steps yet.</p>
        </div>
      ) : (
        <>
          <div>
            {!module ? (
              <UnavailableStep
                cellId={cellId}
                title="This step isn't available"
                message="Its module isn't currently published, or it was removed from the curriculum. You can move on to the next step."
              />
            ) : locked ? (
              <UnavailableStep
                cellId={cellId}
                title="This step is locked"
                message="Complete the earlier stages to unlock this module. Workshop steps never skip the normal gating."
              />
            ) : (
              // ModuleRenderer reused verbatim (R6): gating/completion identical to
              // standalone. onComplete goes through App's completeModule (R5).
              <ModuleRenderer
                key={module.id}
                module={module}
                selectedPersona={selectedPersona}
                isCompleted={completedModuleIds.includes(module.id)}
                onComplete={(via) => onCompleteModule(module.id, via)}
              />
            )}
          </div>

          <div className="flex items-center justify-between border-t border-gray-100 pt-6">
            <button
              onClick={goPrev}
              disabled={current === 0}
              className="inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 font-bold text-gray-600 transition-all hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              Previous
            </button>
            <button
              onClick={goNext}
              disabled={current >= total - 1}
              className="inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 font-bold text-gray-600 transition-all hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function UnavailableStep({
  cellId,
  title,
  message,
}: {
  cellId: string;
  title: string;
  message: string;
}) {
  return (
    <div
      className="space-y-3 rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-sm"
      role="status"
    >
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
        <Lock className="w-5 h-5 text-gray-500" aria-hidden="true" />
      </div>
      <h3 className="font-bold text-gray-800">{title}</h3>
      <p className="mx-auto max-w-sm text-sm text-gray-500">{message}</p>
      {cellId && (
        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
          Step: {cellId}
        </p>
      )}
    </div>
  );
}

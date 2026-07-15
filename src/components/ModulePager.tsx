import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Module } from '../types';

// Week-flow Next/Previous controls (cohort-restructure U2, R4): a footer under
// the module content that walks the FLATTENED VISIBLE ORDER (course weeks →
// supplemental → resources — the same order the completion cursor advances
// through). Pure navigation: selecting never completes anything. Under U9's
// participation completion (which deliberately never moves the cursor), this
// pager is how the learner moves on after an activity auto-completes. Rendered
// in App's learning view, not a new top-level view — the sidebar stays the
// primary navigation.

interface Props {
  /** All learner-visible modules, in flattened section order. */
  modules: Module[];
  currentModuleId: string;
  onSelect: (moduleId: string) => void;
}

export default function ModulePager({ modules, currentModuleId, onSelect }: Props) {
  const index = modules.findIndex((m) => m.id === currentModuleId);
  // Defensive: an unknown current module renders no pager rather than crashing.
  if (index === -1) return null;
  const previous = index > 0 ? modules[index - 1] : undefined;
  const next = index < modules.length - 1 ? modules[index + 1] : undefined;
  if (!previous && !next) return null;

  return (
    <nav
      aria-label="Lesson navigation"
      className="mt-4 flex items-stretch justify-between gap-4 border-t border-gray-100 pt-6"
    >
      {previous ? (
        <button
          onClick={() => onSelect(previous.id)}
          className="group flex min-w-0 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition-all hover:border-nava-green hover:shadow-sm"
          id="module-pager-previous"
        >
          <ChevronLeft className="w-4 h-4 shrink-0 text-gray-500 group-hover:text-nava-green" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-gray-500">
              Previous
            </span>
            <span className="block truncate text-sm font-semibold text-gray-800 group-hover:text-nava-green">
              {previous.title}
            </span>
          </span>
        </button>
      ) : (
        // Keeps Next pinned to the right edge on the first module.
        <span aria-hidden="true" />
      )}
      {next && (
        <button
          onClick={() => onSelect(next.id)}
          className="group flex min-w-0 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-right transition-all hover:border-nava-green hover:shadow-sm"
          id="module-pager-next"
        >
          <span className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-gray-500">
              Next
            </span>
            <span className="block truncate text-sm font-semibold text-gray-800 group-hover:text-nava-green">
              {next.title}
            </span>
          </span>
          <ChevronRight className="w-4 h-4 shrink-0 text-gray-500 group-hover:text-nava-green" aria-hidden="true" />
        </button>
      )}
    </nav>
  );
}

import { useState } from 'react';
import { Check, X, ShieldCheck, RotateCcw } from 'lucide-react';
import type { SorterCategory, SorterConfig } from '../types';
import { gradeScenarios } from './scenarioSorter.grade';

// The four categories are a fixed taxonomy (not per-cell), so their labels and
// one-line definitions live here; the per-cell scenarios come from the DB config.
const CATEGORIES: { id: SorterCategory; label: string; desc: string }[] = [
  { id: 'delegate', label: 'Delegate', desc: 'AI does it end-to-end — low-stakes, verifiable, no sensitive data.' },
  { id: 'assist', label: 'Assist', desc: 'AI helps; a person directs, checks, and owns the result.' },
  { id: 'human-only', label: 'Human-only', desc: 'A person must make and own the call (AI may help prep, never decide).' },
  { id: 'refuse', label: 'Refuse', desc: "Don't use AI here at all — prohibited data or unauthorized use." },
];

const labelFor = (cat: SorterCategory) => CATEGORIES.find((c) => c.id === cat)?.label ?? cat;

export default function ScenarioSorter({
  config,
  onComplete,
}: {
  config?: SorterConfig;
  onComplete: () => void;
}) {
  const scenarios = config?.scenarios ?? [];
  const [assignments, setAssignments] = useState<Record<string, SorterCategory>>({});
  // null until first check; then a frozen per-scenario correctness snapshot so
  // re-picking a wrong answer doesn't leak the key before the learner re-checks.
  const [result, setResult] = useState<Record<string, boolean> | null>(null);

  if (scenarios.length === 0) return null;

  const allAssigned = scenarios.every((s) => assignments[s.id]);
  const numCorrect = result ? scenarios.filter((s) => result[s.id]).length : 0;
  const allCorrect = result !== null && numCorrect === scenarios.length;

  const assign = (id: string, cat: SorterCategory) => {
    if (result?.[id]) return; // lock a scenario once it's been graded correct
    setAssignments((prev) => ({ ...prev, [id]: cat }));
  };

  const check = () => {
    const grade = gradeScenarios(assignments, scenarios);
    const snapshot: Record<string, boolean> = {};
    scenarios.forEach((s) => {
      snapshot[s.id] = grade.correctIds.includes(s.id);
    });
    setResult(snapshot);
  };

  return (
    <div className="bg-white border-2 border-nava-mint rounded-3xl p-8 shadow-sm space-y-8" id="scenario-sorter">
      <div className="border-b border-nava-mint pb-6">
        <h3 className="font-bold text-lg">Scenario Sorter</h3>
        {config?.intro && <p className="text-sm text-gray-500 mt-1">{config.intro}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CATEGORIES.map((c) => (
          <div key={c.id} className="text-xs text-gray-600 bg-gray-50 rounded-xl p-3 leading-relaxed">
            <span className="font-bold text-nava-plum">{c.label}</span> — {c.desc}
          </div>
        ))}
      </div>

      <div className="space-y-5">
        {scenarios.map((s, i) => {
          const picked = assignments[s.id];
          const graded = result?.[s.id];
          return (
            <div
              key={s.id}
              className={`rounded-2xl border-2 p-5 space-y-3 ${
                result === null
                  ? 'border-gray-100'
                  : graded
                  ? 'border-green-300 bg-green-50/40'
                  : 'border-red-300 bg-red-50/40'
              }`}
            >
              <p className="text-sm font-medium text-gray-800">
                <span className="text-gray-500 mr-2">{i + 1}.</span>
                {s.text}
              </p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={picked === c.id}
                    disabled={result?.[s.id] === true}
                    onClick={() => assign(s.id, c.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                      picked === c.id
                        ? 'border-nava-green bg-nava-mint text-nava-green'
                        : 'border-gray-100 text-gray-600 hover:border-nava-green/30'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              {result !== null && (
                <div
                  className={`flex items-start gap-2 text-xs rounded-xl p-3 ${
                    graded ? 'bg-green-100/60 text-green-900' : 'bg-red-100/50 text-red-900'
                  }`}
                >
                  {graded ? (
                    <Check className="w-4 h-4 shrink-0 mt-0.5 text-green-600" />
                  ) : (
                    <X className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                  )}
                  <span>
                    <span className="font-bold">Correct: {labelFor(s.correct)}.</span> {s.rationale}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {allCorrect ? (
        <button
          type="button"
          onClick={onComplete}
          className="w-full py-4 bg-nava-green text-white rounded-2xl font-bold hover:bg-nava-plum transition-all shadow-lg flex items-center justify-center gap-2"
        >
          <ShieldCheck className="w-5 h-5" /> Continue
        </button>
      ) : (
        <div className="space-y-4">
          {result !== null && (
            <p role="status" aria-live="polite" className="text-center font-bold text-gray-700">
              {numCorrect} / {scenarios.length} correct — fix the highlighted ones and re-check.
            </p>
          )}
          <button
            type="button"
            onClick={check}
            disabled={!allAssigned}
            className="w-full py-3.5 bg-nava-green text-white rounded-xl font-bold shadow-lg shadow-nava-green/20 disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            {result === null ? 'Check answers' : (<><RotateCcw className="w-4 h-4" /> Re-check</>)}
          </button>
        </div>
      )}
    </div>
  );
}

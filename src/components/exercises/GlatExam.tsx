import { useMemo, useRef, useState } from 'react';
import { ShieldCheck, HelpCircle, Check, X } from 'lucide-react';
import type { GlatConfig } from '../../types';
import { useAuth } from '../../lib/auth';
import { recordQuizAttempt } from '../../lib/progress';
import { scoreGlat, type GlatResponses } from '../../lib/grading/scoreGlat';

// GLAT objective gate (cell 2.14, P4.10). Section A (diagnostic, unscored) +
// Sections B+C (35 scored). ≥passThreshold records a PASSING quiz_attempts row on
// 2.14 and completes the cell via onComplete (the cell-2.1/D8 "lab gates"
// pattern). On a miss it records the failed attempt and offers a retake. The
// recordedRef guard makes the write idempotent across StrictMode/re-renders.

const SCALE = [1, 2, 3, 4, 5];

export default function GlatExam({
  config,
  labId,
  onComplete,
}: {
  config: GlatConfig;
  labId: string;
  onComplete: () => void;
}) {
  const { user } = useAuth();
  const [sectionA, setSectionA] = useState<Record<string, number>>({});
  const [sectionBC, setSectionBC] = useState<Record<string, number>>({});
  const [result, setResult] = useState<ReturnType<typeof scoreGlat> | null>(null);
  const recordedRef = useRef(false);

  const allScoredAnswered = useMemo(
    () => config.sectionBC.every((q) => q.id in sectionBC),
    [config.sectionBC, sectionBC],
  );

  const handleSubmit = () => {
    if (!allScoredAnswered) return;
    const responses: GlatResponses = { sectionA, sectionBC };
    const r = scoreGlat(config, responses);
    setResult(r);
    if (user && !recordedRef.current) {
      recordedRef.current = true;
      recordQuizAttempt(user.id, {
        moduleId: labId,
        score: r.correct,
        maxScore: r.total,
        passed: r.passed,
        answers: { ...sectionA, ...sectionBC },
      }).catch(() => {
        // Best-effort persistence; the local result still shows.
      });
    }
    if (r.passed) onComplete();
  };

  const reset = () => {
    setSectionA({});
    setSectionBC({});
    setResult(null);
    recordedRef.current = false;
  };

  if (result) {
    const byId = new Map(result.perItem.map((i) => [i.id, i]));
    return (
      <div className="bg-white border-2 border-nava-mint rounded-3xl p-8 shadow-sm space-y-8">
        <div role="status" aria-live="polite" className="text-center space-y-3">
          <div
            className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center ${
              result.passed ? 'bg-green-100' : 'bg-orange-100'
            }`}
          >
            {result.passed ? (
              <ShieldCheck className="w-10 h-10 text-green-600" aria-hidden="true" />
            ) : (
              <HelpCircle className="w-10 h-10 text-orange-600" aria-hidden="true" />
            )}
          </div>
          <h3 className="text-2xl font-bold text-gray-900">
            {result.passed ? 'Passed' : 'Not yet — keep going'}
          </h3>
          <p className="text-gray-600">
            You scored {result.correct} / {result.total} ({Math.round(result.pct * 100)}%).
            {' '}A passing score is {Math.round(config.passThreshold * 100)}%.
          </p>
          <p
            className={`inline-block text-sm font-medium px-4 py-2 rounded-xl ${
              result.passed ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'
            }`}
          >
            {result.passed
              ? 'Objective gate complete — this finishes the course.'
              : "Review the explanations below, then retake when you're ready."}
          </p>
        </div>

        <ol className="space-y-4">
          {config.sectionBC.map((q) => {
            const item = byId.get(q.id)!;
            return (
              <li key={q.id} className="rounded-xl border border-gray-200 p-4">
                <div className="flex items-start gap-2">
                  {item.isCorrect ? (
                    <Check className="w-4 h-4 text-green-600 mt-1 shrink-0" aria-hidden="true" />
                  ) : (
                    <X className="w-4 h-4 text-red-600 mt-1 shrink-0" aria-hidden="true" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">{q.question}</p>
                    <p className="sr-only">{item.isCorrect ? 'Correct' : 'Incorrect'}</p>
                    <p className="mt-1 text-sm text-gray-600">
                      Correct answer: <span className="font-medium">{q.options[q.correctIndex]}</span>
                    </p>
                    <p className="mt-1 text-xs text-gray-500">{q.rationale}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        {!result.passed && (
          <div className="flex justify-center">
            <button
              onClick={reset}
              className="px-10 py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-all"
            >
              Retake the gate
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border-2 border-nava-mint rounded-3xl p-8 shadow-sm space-y-10" id="glat-exam">
      <header className="space-y-1">
        <h3 className="text-xl font-bold text-gray-900">GLAT — objective gate</h3>
        <p className="text-sm text-gray-600">
          A {config.sectionBC.length}-question objective check across Stage 1–2. Score{' '}
          {Math.round(config.passThreshold * 100)}% or higher to pass. The first few questions are a
          quick self-check and aren&apos;t scored.
        </p>
      </header>

      {config.sectionA.length > 0 && (
        <section className="space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500">
            Self-check (not scored)
          </h4>
          {config.sectionA.map((item) => (
            <fieldset key={item.id} className="space-y-2" aria-label={item.id}>
              <legend className="text-sm font-medium text-gray-800">{item.prompt}</legend>
              <div className="flex items-center gap-2" role="radiogroup" aria-label={item.id}>
                {item.scaleLabels && <span className="text-xs text-gray-400">{item.scaleLabels[0]}</span>}
                {SCALE.map((n) => (
                  <button
                    key={n}
                    role="radio"
                    aria-checked={sectionA[item.id] === n}
                    aria-label={String(n)}
                    onClick={() => setSectionA((p) => ({ ...p, [item.id]: n }))}
                    className={`w-9 h-9 rounded-full border-2 text-sm font-bold transition-all ${
                      sectionA[item.id] === n
                        ? 'border-nava-green bg-nava-mint text-nava-green'
                        : 'border-gray-200 text-gray-500 hover:border-nava-green/40'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                {item.scaleLabels && <span className="text-xs text-gray-400">{item.scaleLabels[1]}</span>}
              </div>
            </fieldset>
          ))}
        </section>
      )}

      <section className="space-y-6">
        <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500">Scored questions</h4>
        {config.sectionBC.map((q, qi) => (
          <fieldset key={q.id} className="space-y-3" aria-label={`${q.id} ${q.question}`}>
            <legend className="text-base font-medium text-gray-900">
              {qi + 1}. {q.question}
            </legend>
            <div className="space-y-2" role="radiogroup" aria-label={`${q.id} ${q.question}`}>
              {q.options.map((opt, oi) => (
                <button
                  key={oi}
                  role="radio"
                  aria-checked={sectionBC[q.id] === oi}
                  aria-label={opt}
                  onClick={() => setSectionBC((p) => ({ ...p, [q.id]: oi }))}
                  className={`w-full p-3 rounded-xl text-left text-sm font-medium border-2 transition-all ${
                    sectionBC[q.id] === oi
                      ? 'border-nava-green bg-nava-mint text-nava-green'
                      : 'border-gray-100 hover:border-nava-green/30'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
      </section>

      <div className="flex justify-end pt-4 border-t border-gray-100">
        <button
          onClick={handleSubmit}
          disabled={!allScoredAnswered}
          className="px-10 py-3 bg-nava-green text-white rounded-xl font-bold shadow-lg shadow-nava-green/20 disabled:opacity-50 transition-all active:scale-95"
        >
          Submit the gate
        </button>
      </div>
    </div>
  );
}

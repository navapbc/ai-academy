import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Check, X, Sparkles, ListChecks, ClipboardCheck } from 'lucide-react';
import type { ScenarioExerciseConfig } from '../../types';
import { useAuth } from '../../lib/auth';
import { recordLabSubmission } from '../../lib/progress';

interface Props {
  config: ScenarioExerciseConfig;
  labId: string;
}

// Per-kind copy for the intro card. The two exercise kinds share this component
// and differ only in their seeded content + the framing shown to the learner.
const KIND_COPY: Record<ScenarioExerciseConfig['kind'], { title: string; blurb: string }> = {
  'disclosure-builder': {
    title: 'Practice: Build your disclosure call',
    blurb:
      'For each artifact, pick the disclosure level that matches the stakes. This is graded practice — it doesn’t affect your module completion.',
  },
  'regulatory-check': {
    title: 'Practice: Get the regulatory facts right',
    blurb:
      'For each topic, pick the statement that is accurate to put in a client response. This is graded practice — it doesn’t affect your module completion.',
  },
};

export default function ScenarioExercise({ config, labId }: Props) {
  const { user } = useAuth();
  const { items, takeaway } = config;
  const copy = KIND_COPY[config.kind];

  // picks[itemIndex] = chosen option index
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [graded, setGraded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const maxScore = items.length;
  const results = items.map((item, i) => picks[i] === item.correctIndex);
  const score = results.reduce((sum, ok) => sum + (ok ? 1 : 0), 0);

  const allAnswered = items.every((_, i) => picks[i] !== undefined);

  const setPick = (i: number, value: number) => {
    if (graded) return;
    setPicks((prev) => ({ ...prev, [i]: value }));
  };

  const handleSubmit = async () => {
    if (!allAnswered || graded || saving) return; // guard the async-save window (DATA-04)
    setGraded(true);
    setSaveError(null);

    if (!user) {
      setSaveError('Sign in to record your practice — your answers are graded below.');
      return;
    }

    const answers = items.map((item, i) => ({
      prompt: item.prompt,
      picked: picks[i] ?? null,
      correctIndex: item.correctIndex,
      correct: results[i],
    }));

    setSaving(true);
    try {
      await recordLabSubmission(user.id, {
        labId,
        transcript: { answers, score, maxScore },
        status: 'submitted',
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not record your submission.');
    } finally {
      setSaving(false);
    }
  };

  const handleRetry = () => {
    setPicks({});
    setGraded(false);
    setSaveError(null);
  };

  return (
    <div
      className="bg-white border-2 border-nava-mint rounded-3xl p-8 shadow-sm space-y-8"
      id="scenario-exercise"
    >
      <div className="flex items-center gap-3 border-b border-nava-mint pb-6">
        <div className="w-10 h-10 bg-nava-mint rounded-xl flex items-center justify-center text-nava-green">
          <ListChecks className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold">{copy.title}</h3>
          <p className="text-xs text-gray-500">{copy.blurb}</p>
        </div>
      </div>

      <div className="space-y-6">
        {items.map((item, i) => {
          const correct = results[i];
          return (
            <div
              key={i}
              className={`rounded-2xl border-2 p-5 space-y-4 transition-colors ${
                graded
                  ? correct
                    ? 'border-green-200 bg-green-50/40'
                    : 'border-red-200 bg-red-50/40'
                  : 'border-gray-100'
              }`}
            >
              <p className="text-sm font-semibold text-gray-800 leading-relaxed">{item.prompt}</p>

              <div className="flex flex-col gap-2" role="radiogroup" aria-label={item.prompt}>
                {item.options.map((opt, oi) => {
                  const selected = picks[i] === oi;
                  const isAnswer = graded && oi === item.correctIndex;
                  const wrongPick = graded && selected && oi !== item.correctIndex;
                  return (
                    <button
                      key={oi}
                      role="radio"
                      aria-checked={selected}
                      disabled={graded}
                      onClick={() => setPick(i, oi)}
                      className={`text-left text-sm font-medium rounded-xl px-4 py-2.5 border-2 transition-all ${
                        isAnswer
                          ? 'border-green-600 bg-green-50 text-green-900'
                          : wrongPick
                            ? 'border-red-600 bg-red-50 text-red-900'
                            : selected
                              ? 'border-nava-green bg-nava-mint text-nava-green'
                              : 'border-gray-100 text-gray-700 hover:border-nava-green/30'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span>{opt}</span>
                        {isAnswer && <Check className="w-4 h-4 text-green-600 shrink-0" />}
                        {wrongPick && <X className="w-4 h-4 text-red-600 shrink-0" />}
                      </div>
                      {isAnswer && <span className="sr-only"> (correct answer)</span>}
                      {wrongPick && <span className="sr-only"> (your answer, incorrect)</span>}
                    </button>
                  );
                })}
              </div>

              <AnimatePresence>
                {graded && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    role="status"
                    aria-live="polite"
                    className={`flex gap-3 rounded-xl p-4 ${correct ? 'bg-green-100/60' : 'bg-red-100/50'}`}
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                        correct ? 'bg-green-200' : 'bg-red-200'
                      }`}
                    >
                      {correct ? (
                        <Check className="w-4 h-4 text-green-700" />
                      ) : (
                        <X className="w-4 h-4 text-red-700" />
                      )}
                    </div>
                    <p
                      className={`text-xs leading-relaxed ${correct ? 'text-green-800' : 'text-red-800'}`}
                    >
                      {item.why}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {saveError && <p role="alert" className="text-xs text-red-600 font-medium">{saveError}</p>}

      {/* The keepable cheat-sheet / model response: the correct option text of
          every item, assembled once the learner has submitted. */}
      <AnimatePresence>
        {graded && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border-2 border-nava-plum/20 bg-nava-plum/5 p-6 space-y-4"
          >
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-nava-plum" />
              <h4 className="font-bold text-nava-plum">{takeaway.title}</h4>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">{takeaway.intro}</p>
            <ul className="space-y-2">
              {items.map((item, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-700 leading-relaxed">
                  <Check className="w-4 h-4 text-nava-green shrink-0 mt-0.5" />
                  <span>{item.options[item.correctIndex]}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      {graded ? (
        <div className="flex items-center justify-between border-t border-gray-100 pt-6">
          <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm font-bold text-gray-700">
            <ShieldCheck className="w-5 h-5 text-nava-green" />
            You scored {score} / {maxScore}
          </div>
          <button
            onClick={handleRetry}
            className="px-6 py-2.5 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-black transition-all active:scale-95"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="flex justify-end border-t border-gray-100 pt-6">
          <button
            onClick={handleSubmit}
            disabled={!allAnswered || saving}
            className="flex items-center gap-2 px-10 py-3 bg-nava-green text-white rounded-xl font-bold shadow-lg shadow-nava-green/20 disabled:opacity-50 transition-all active:scale-95"
          >
            {saving ? (
              <>
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                  <Sparkles className="w-4 h-4" />
                </motion.div>
                Submitting…
              </>
            ) : (
              'Submit answers'
            )}
          </button>
        </div>
      )}
    </div>
  );
}

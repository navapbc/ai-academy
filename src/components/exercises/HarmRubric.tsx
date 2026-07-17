import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Check, X, Sparkles, Scale } from 'lucide-react';
import type { HarmRubricConfig } from '../../types';
import { useAuth } from '../../lib/auth';
import { recordLabSubmission } from '../../lib/progress';
import { gradeHarmRubric } from './harmRubric.grade';

interface Props {
  config: HarmRubricConfig;
  labId: string;
}

export default function HarmRubric({ config, labId }: Props) {
  const { user } = useAuth();
  const { patterns, scenarios } = config;
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [graded, setGraded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const labelFor = (id: string) => patterns.find((p) => p.id === id)?.label ?? id;
  const grade = gradeHarmRubric(picks, scenarios);
  const allAnswered = scenarios.every((s) => picks[s.id] !== undefined);

  const pick = (sid: string, pid: string) => {
    if (graded) return;
    setPicks((prev) => ({ ...prev, [sid]: pid }));
  };

  const handleSubmit = async () => {
    if (!allAnswered || graded || saving) return; // guard the async-save window (DATA-04)
    setGraded(true);
    setSaveError(null);
    if (!user) {
      setSaveError('Sign in to record your practice — your answers are graded below.');
      return;
    }
    const answers = scenarios.map((s) => ({
      id: s.id,
      picked: picks[s.id] ?? null,
      correct: s.correct,
      correctness: picks[s.id] === s.correct,
    }));
    setSaving(true);
    try {
      await recordLabSubmission(user.id, {
        labId,
        transcript: { answers, score: grade.correctIds.length, maxScore: scenarios.length },
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
    <div className="bg-white border-2 border-nava-plum/20 rounded-3xl p-8 shadow-sm space-y-8" id="harm-rubric">
      <div className="flex items-center gap-3 border-b border-nava-plum/20 pb-6">
        <div className="w-10 h-10 bg-nava-plum/10 rounded-xl flex items-center justify-center text-nava-plum">
          <Scale className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold">Practice: Name the harm</h3>
          <p className="text-xs text-gray-500">
            For each scenario, pick the civic-tech harm pattern it shows. This is graded practice — it
            doesn&apos;t affect your module completion.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {patterns.map((p) => (
          <div key={p.id} className="text-xs text-gray-600 bg-gray-50 rounded-xl p-3 leading-relaxed">
            <span className="font-bold text-nava-plum">{p.label}</span> — {p.desc}
          </div>
        ))}
      </div>

      <div className="space-y-5">
        {scenarios.map((s, i) => {
          const picked = picks[s.id];
          const correct = graded && picked === s.correct;
          return (
            <div
              key={s.id}
              className={`rounded-2xl border-2 p-5 space-y-3 ${
                graded
                  ? correct
                    ? 'border-green-200 bg-green-50/40'
                    : 'border-red-200 bg-red-50/40'
                  : 'border-gray-100'
              }`}
            >
              <p className="text-sm font-medium text-gray-800">
                <span className="text-gray-500 mr-2">{i + 1}.</span>
                {s.text}
              </p>
              <div className="flex flex-wrap gap-2">
                {patterns.map((p) => {
                  const sel = picked === p.id;
                  const isAns = graded && p.id === s.correct;
                  const wrongPick = graded && sel && p.id !== s.correct;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={sel}
                      disabled={graded}
                      onClick={() => pick(s.id, p.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                        isAns
                          ? 'border-green-600 bg-green-50 text-green-900'
                          : wrongPick
                            ? 'border-red-600 bg-red-50 text-red-900'
                            : sel
                              ? 'border-nava-green bg-nava-mint text-nava-green'
                              : 'border-gray-100 text-gray-600 hover:border-nava-green/30'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <AnimatePresence>
                {graded && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-3 rounded-xl p-4 ${correct ? 'bg-green-100/60' : 'bg-red-100/50'}`}
                  >
                    <div
                      aria-hidden="true"
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
                    <p className={`text-xs leading-relaxed ${correct ? 'text-green-800' : 'text-red-800'}`}>
                      {/* Correctness must not be conveyed by colour + icon alone (D-20). */}
                      <span className="sr-only">{correct ? 'Correct. ' : 'Incorrect. '}</span>
                      <span className="font-bold">{labelFor(s.correct)}.</span> {s.why}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {saveError && <p role="alert" className="text-xs text-red-600 font-medium">{saveError}</p>}

      {graded ? (
        <div className="flex items-center justify-between border-t border-gray-100 pt-6">
          <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm font-bold text-gray-700">
            <ShieldCheck className="w-5 h-5 text-nava-green" />
            You scored {grade.correctIds.length} / {scenarios.length}
          </div>
          <button
            type="button"
            onClick={handleRetry}
            className="px-6 py-2.5 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-black transition-all active:scale-95"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="flex justify-end border-t border-gray-100 pt-6">
          <button
            type="button"
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

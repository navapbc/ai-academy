import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Gauge, Check, X, Sparkles, AlertTriangle, ArrowUp, ArrowDown } from 'lucide-react';
import type { CalibrationConfig } from '../../types';
import { useAuth } from '../../lib/auth';
import { recordLabSubmission } from '../../lib/progress';
import { gradeCalibration } from '../calibration.grade';

interface Props {
  config: CalibrationConfig;
  // The cell id this exercise belongs to (e.g. '2.8'); used as the lab_id on the
  // recorded submission.
  labId: string;
}

// 2.8 calibration (P4.3c): a confidence-calibration exercise that renders after
// the lesson. For each output from the SAME tool the learner picks a
// verification posture on an ordered scale; on Save we auto-grade against the
// answer key, reveal each item's target + why, and show an over-/under-reliance
// SUMMARY. This is NOT the completion gate — the inline quiz still owns
// completion — so it never calls onComplete.
export default function Calibration({ config, labId }: Props) {
  const { user } = useAuth();
  const { intro, scale, items } = config;

  // picks[itemId] = scale id
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [graded, setGraded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const grade = gradeCalibration(picks, config);
  const allAnswered = items.every((i) => picks[i.id] !== undefined);
  const scaleLabel = (id: string) => scale.find((s) => s.id === id)?.label ?? id;

  const setPick = (id: string, value: string) => {
    if (graded) return;
    setPicks((prev) => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async () => {
    if (!allAnswered || graded || saving) return; // guard the async-save window
    setGraded(true);
    setSaveError(null);

    if (!user) {
      setSaveError('Sign in to record your practice — your answers are graded below.');
      return;
    }

    const answers = items.map((item) => {
      const res = grade.results.find((r) => r.id === item.id);
      return {
        id: item.id,
        task: item.task,
        picked: picks[item.id] ?? null,
        target: item.target,
        result: res?.result ?? 'unanswered',
        gap: res?.gap ?? null,
      };
    });

    setSaving(true);
    try {
      await recordLabSubmission(user.id, {
        labId,
        transcript: {
          kind: 'calibration',
          answers,
          score: grade.score,
          maxScore: grade.total,
          summary: grade.summary,
        },
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
    <div className="bg-white border-2 border-nava-plum/20 rounded-3xl p-8 shadow-sm space-y-8" id="calibration">
      <div className="flex items-center gap-3 border-b border-nava-plum/20 pb-6">
        <div className="w-10 h-10 bg-nava-plum/10 rounded-xl flex items-center justify-center text-nava-plum">
          <Gauge className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold">Practice: Calibrate your trust</h3>
          <p className="text-xs text-gray-500">
            Every output below comes from the <em>same</em> AI tool. For each, pick how much you&apos;d
            verify before acting. This is graded practice — it doesn&apos;t affect your module
            completion.
          </p>
        </div>
      </div>

      {intro && <p className="text-sm text-gray-700 leading-relaxed">{intro}</p>}

      <div className="space-y-4">
        {items.map((item) => {
          const picked = picks[item.id];
          const res = graded ? grade.results.find((r) => r.id === item.id) : undefined;
          const calibrated = res?.result === 'calibrated';
          return (
            <div
              key={item.id}
              className={`rounded-2xl border-2 p-5 space-y-4 transition-colors ${
                graded
                  ? calibrated
                    ? 'border-green-200 bg-green-50/40'
                    : 'border-amber-200 bg-amber-50/40'
                  : 'border-gray-100'
              }`}
            >
              <div className="space-y-1">
                <p className="text-sm font-semibold text-gray-800 leading-relaxed">{item.task}</p>
                {item.output && (
                  <p className="text-xs text-gray-500 leading-relaxed italic">{item.output}</p>
                )}
              </div>

              <div
                className="flex flex-col gap-2"
                role="radiogroup"
                aria-label={`Verification posture for: ${item.task}`}
              >
                {scale.map((s) => {
                  const selected = picked === s.id;
                  const isTarget = graded && s.id === item.target;
                  const wrongPick = graded && selected && s.id !== item.target;
                  return (
                    <button
                      key={s.id}
                      role="radio"
                      aria-checked={selected}
                      disabled={graded}
                      onClick={() => setPick(item.id, s.id)}
                      className={`text-left text-sm font-medium rounded-xl px-4 py-2.5 border-2 transition-all ${
                        isTarget
                          ? 'border-green-600 bg-green-50 text-green-900'
                          : wrongPick
                            ? 'border-red-600 bg-red-50 text-red-900'
                            : selected
                              ? 'border-nava-green bg-nava-mint text-nava-green'
                              : 'border-gray-100 text-gray-700 hover:border-nava-green/30'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span>
                          <span className="font-semibold">{s.label}</span>
                          {s.description && (
                            <span className="block text-xs font-normal text-gray-500 mt-0.5">
                              {s.description}
                            </span>
                          )}
                        </span>
                        {isTarget && <Check className="w-4 h-4 text-green-600 shrink-0" />}
                        {wrongPick && <X className="w-4 h-4 text-red-600 shrink-0" />}
                      </div>
                      {isTarget && <span className="sr-only"> (calibrated posture)</span>}
                      {wrongPick && <span className="sr-only"> (your answer, miscalibrated)</span>}
                    </button>
                  );
                })}
              </div>

              <AnimatePresence>
                {graded && res && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    role="status"
                    aria-live="polite"
                    className={`flex gap-3 rounded-xl p-4 ${calibrated ? 'bg-green-100/60' : 'bg-amber-100/50'}`}
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                        calibrated ? 'bg-green-200' : 'bg-amber-200'
                      }`}
                    >
                      {calibrated ? (
                        <Check className="w-4 h-4 text-green-700" />
                      ) : res.result === 'over' ? (
                        <ArrowUp className="w-4 h-4 text-amber-700" />
                      ) : (
                        <ArrowDown className="w-4 h-4 text-amber-700" />
                      )}
                    </div>
                    <div className="space-y-1 text-xs leading-relaxed">
                      <p className={`font-bold ${calibrated ? 'text-green-800' : 'text-amber-800'}`}>
                        {calibrated
                          ? `Calibrated — ${scaleLabel(item.target)}`
                          : res.result === 'over'
                            ? `Over-reliance — the calibrated posture is "${scaleLabel(item.target)}" (you trusted this more than it deserved)`
                            : `Under-reliance — the calibrated posture is "${scaleLabel(item.target)}" (you checked more than needed)`}
                      </p>
                      <p className={calibrated ? 'text-green-800' : 'text-amber-800'}>{item.why}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {saveError && <p role="alert" className="text-xs text-red-600 font-medium">{saveError}</p>}

      {graded ? (
        <div className="space-y-6 border-t border-gray-100 pt-6">
          {/* Over-/under-reliance calibration summary — the heart of the exercise. */}
          <div
            role="status"
            aria-live="polite"
            className="rounded-2xl border-2 border-nava-mint bg-nava-mint/20 p-5 space-y-3"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
              <Gauge className="w-5 h-5 text-nava-green" />
              Your calibration: {grade.score} of {grade.total} matched
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              Good judgment means matching how much you check to how often the tool is actually
              wrong for that task.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl bg-white border border-amber-200 p-4 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-amber-700">
                  <ArrowUp className="w-3.5 h-3.5" />
                  Over-reliance · {grade.summary.over}
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Trusting too much: you trusted the AI on something it can get wrong and didn&apos;t
                  check enough. On high-stakes work this is the costlier miss.
                </p>
              </div>
              <div className="rounded-xl bg-white border border-amber-200 p-4 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-amber-700">
                  <ArrowDown className="w-3.5 h-3.5" />
                  Under-reliance · {grade.summary.under}
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Checking too much: you double-checked work the AI had right and spent effort you
                  didn&apos;t need to.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
              <AlertTriangle className="w-5 h-5 text-nava-green" />
              Match the check to the risk, task by task.
            </div>
            <button
              onClick={handleRetry}
              className="px-6 py-2.5 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-black transition-all active:scale-95"
            >
              Try again
            </button>
          </div>
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

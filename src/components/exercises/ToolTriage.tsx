import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Check, X, Sparkles, Wrench } from 'lucide-react';
import type { ToolTriageConfig } from '../../types';
import { useAuth } from '../../lib/auth';
import { recordLabSubmission } from '../../lib/progress';

interface Props {
  config: ToolTriageConfig;
  // The cell id this exercise belongs to (e.g. '1.5'); used as the lab_id on the
  // recorded submission.
  labId: string;
}

// 1.5 tool-triage (P3.6): graded practice that renders after the lesson. For
// each case the learner picks the best approved tool; on Submit we grade against
// the case's answer, surface the `why` rationale, and record a lab_submissions
// row. Like the classifier, this is practice — the inline quiz remains the
// completion gate — so it never calls onComplete.
export default function ToolTriage({ config, labId }: Props) {
  const { user } = useAuth();
  const { tools, cases } = config;

  const [picks, setPicks] = useState<Record<number, string>>({});
  const [graded, setGraded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const toolLabel = (id: string) => tools.find((t) => t.id === id)?.label ?? id;

  const allAnswered = cases.every((_, i) => picks[i]);
  const results = cases.map((c, i) => picks[i] === c.tool);
  const score = results.filter(Boolean).length;

  const setPick = (i: number, toolId: string) => {
    if (graded) return;
    setPicks((prev) => ({ ...prev, [i]: toolId }));
  };

  const handleSubmit = async () => {
    if (!allAnswered || graded) return;
    setGraded(true);
    setSaveError(null);

    if (!user) {
      setSaveError('Sign in to record your practice — your answers are graded below.');
      return;
    }

    const answers = cases.map((c, i) => ({
      text: c.text,
      pickedTool: picks[i] ?? null,
      correctTool: c.tool,
      correct: results[i],
    }));

    setSaving(true);
    try {
      await recordLabSubmission(user.id, {
        labId,
        transcript: { answers, score, maxScore: cases.length },
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
    <div className="bg-white border-2 border-nava-mint rounded-3xl p-8 shadow-sm space-y-8" id="tool-triage">
      <div className="flex items-center gap-3 border-b border-nava-mint pb-6">
        <div className="w-10 h-10 bg-nava-mint rounded-xl flex items-center justify-center text-nava-green">
          <Wrench className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold">Practice: Pick the right tool</h3>
          <p className="text-xs text-gray-500">
            For each task, choose the best approved tool. This is graded practice — it doesn&apos;t
            affect your module completion.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {cases.map((c, i) => {
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
              <p className="text-sm font-medium text-gray-800 leading-relaxed">{c.text}</p>

              <div className="flex flex-col gap-2" role="radiogroup" aria-label={`Best tool for: ${c.text}`}>
                {tools.map((t) => {
                  const selected = picks[i] === t.id;
                  const isAnswer = graded && t.id === c.tool;
                  const wrongPick = graded && selected && t.id !== c.tool;
                  return (
                    <button
                      key={t.id}
                      role="radio"
                      aria-checked={selected}
                      disabled={graded}
                      onClick={() => setPick(i, t.id)}
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
                      <div className="flex items-center justify-between">
                        <span>{t.label}</span>
                        {isAnswer && <Check className="w-4 h-4 text-green-600" />}
                        {wrongPick && <X className="w-4 h-4 text-red-600" />}
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
                    <div className="space-y-1 text-xs leading-relaxed">
                      {!correct && (
                        <p className="font-bold text-red-800">Best tool: {toolLabel(c.tool)}</p>
                      )}
                      <p className={correct ? 'text-green-800' : 'text-red-800'}>{c.why}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {saveError && <p className="text-xs text-red-600 font-medium">{saveError}</p>}

      {graded ? (
        <div className="flex items-center justify-between border-t border-gray-100 pt-6">
          <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm font-bold text-gray-700">
            <ShieldCheck className="w-5 h-5 text-nava-green" />
            You scored {score} / {cases.length}
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

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Check, X, Sparkles, ListChecks } from 'lucide-react';
import type { DataClassifierConfig } from '../../types';
import { useAuth } from '../../lib/auth';
import { recordLabSubmission } from '../../lib/progress';

interface Props {
  config: DataClassifierConfig;
  // The cell id this exercise belongs to (e.g. '1.4'); used as the lab_id on the
  // recorded submission.
  labId: string;
}

// 1.4 data-classifier (P3.6): graded practice that renders after the lesson.
// For each item the learner picks a data class AND the right tool; on Submit we
// auto-grade both against the item's answer, surface the `why` rationale, and
// record a lab_submissions row. This is NOT the completion gate — the inline
// quiz still owns module completion — so it never calls onComplete.
export default function DataClassifier({ config, labId }: Props) {
  const { user } = useAuth();
  const { tools, classes, items } = config;

  // Per-item selections, keyed by item index.
  const [picks, setPicks] = useState<Record<number, { dataClass?: string; tool?: string }>>({});
  const [graded, setGraded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const toolLabel = (id: string) => tools.find((t) => t.id === id)?.label ?? id;

  const allAnswered = items.every((_, i) => picks[i]?.dataClass && picks[i]?.tool);

  const results = items.map((item, i) => {
    const pick = picks[i] ?? {};
    const classOk = pick.dataClass === item.dataClass;
    const toolOk = pick.tool === item.tool;
    return { classOk, toolOk, correct: classOk && toolOk };
  });
  const score = results.filter((r) => r.correct).length;

  const setPick = (i: number, field: 'dataClass' | 'tool', value: string) => {
    if (graded) return;
    setPicks((prev) => ({ ...prev, [i]: { ...prev[i], [field]: value } }));
  };

  const handleSubmit = async () => {
    if (!allAnswered || graded) return;
    setGraded(true);
    setSaveError(null);

    if (!user) {
      setSaveError('Sign in to record your practice — your answers are graded below.');
      return;
    }

    const answers = items.map((item, i) => ({
      text: item.text,
      pickedClass: picks[i]?.dataClass ?? null,
      pickedTool: picks[i]?.tool ?? null,
      correctClass: item.dataClass,
      correctTool: item.tool,
      correct: results[i].correct,
    }));

    setSaving(true);
    try {
      await recordLabSubmission(user.id, {
        labId,
        transcript: { answers, score, maxScore: items.length },
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
    <div className="bg-white border-2 border-nava-mint rounded-3xl p-8 shadow-sm space-y-8" id="data-classifier">
      <div className="flex items-center gap-3 border-b border-nava-mint pb-6">
        <div className="w-10 h-10 bg-nava-mint rounded-xl flex items-center justify-center text-nava-green">
          <ListChecks className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold">Practice: Classify &amp; route the data</h3>
          <p className="text-xs text-gray-500">
            For each item, pick its data class and the right tool. This is graded practice — it
            doesn&apos;t affect your module completion.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {items.map((item, i) => {
          const pick = picks[i] ?? {};
          const res = results[i];
          return (
            <div
              key={i}
              className={`rounded-2xl border-2 p-5 space-y-4 transition-colors ${
                graded
                  ? res.correct
                    ? 'border-green-200 bg-green-50/40'
                    : 'border-red-200 bg-red-50/40'
                  : 'border-gray-100'
              }`}
            >
              <p className="text-sm font-medium text-gray-800 leading-relaxed">{item.text}</p>

              {/* Data class */}
              <div className="space-y-2">
                <div className="text-[11px] font-black uppercase tracking-widest text-gray-400">
                  Data class
                </div>
                <div className="flex flex-wrap gap-2">
                  {classes.map((c) => {
                    const selected = pick.dataClass === c;
                    const isAnswer = graded && c === item.dataClass;
                    const wrongPick = graded && selected && c !== item.dataClass;
                    return (
                      <button
                        key={c}
                        disabled={graded}
                        onClick={() => setPick(i, 'dataClass', c)}
                        className={`text-xs font-semibold rounded-full px-3 py-1.5 border-2 transition-all ${
                          isAnswer
                            ? 'border-green-600 bg-green-50 text-green-900'
                            : wrongPick
                              ? 'border-red-600 bg-red-50 text-red-900'
                              : selected
                                ? 'border-nava-green bg-nava-mint text-nava-green'
                                : 'border-gray-200 text-gray-600 hover:border-nava-green/40'
                        }`}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tool */}
              <div className="space-y-2">
                <div className="text-[11px] font-black uppercase tracking-widest text-gray-400">
                  Tool
                </div>
                <div className="flex flex-col gap-2">
                  {tools.map((t) => {
                    const selected = pick.tool === t.id;
                    const isAnswer = graded && t.id === item.tool;
                    const wrongPick = graded && selected && t.id !== item.tool;
                    return (
                      <button
                        key={t.id}
                        disabled={graded}
                        onClick={() => setPick(i, 'tool', t.id)}
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
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Per-item feedback */}
              <AnimatePresence>
                {graded && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-3 rounded-xl p-4 ${
                      res.correct ? 'bg-green-100/60' : 'bg-red-100/50'
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                        res.correct ? 'bg-green-200' : 'bg-red-200'
                      }`}
                    >
                      {res.correct ? (
                        <Check className="w-4 h-4 text-green-700" />
                      ) : (
                        <X className="w-4 h-4 text-red-700" />
                      )}
                    </div>
                    <div className="space-y-1 text-xs leading-relaxed">
                      {!res.correct && (
                        <p className="font-bold text-red-800">
                          Answer: {item.dataClass} · {toolLabel(item.tool)}
                        </p>
                      )}
                      <p className={res.correct ? 'text-green-800' : 'text-red-800'}>{item.why}</p>
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
          <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
            <ShieldCheck className="w-5 h-5 text-nava-green" />
            You scored {score} / {items.length}
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

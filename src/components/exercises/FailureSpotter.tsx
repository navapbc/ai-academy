import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ShieldCheck, Check, X, Sparkles, AlertTriangle } from 'lucide-react';
import type { FailureSpotterConfig, FailureSpotterQuestion } from '../../types';
import { useAuth } from '../../lib/auth';
import { recordLabSubmission } from '../../lib/progress';

interface Props {
  config: FailureSpotterConfig;
  labId: string;
}

export default function FailureSpotter({ config, labId }: Props) {
  const { user } = useAuth();
  const { items } = config;

  // picks[itemIndex] = { issue?: optionIndex; mitigation?: optionIndex }
  const [picks, setPicks] = useState<Record<number, { issue?: number; mitigation?: number }>>({});
  const [graded, setGraded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Two MCs per item.
  const maxScore = items.length * 2;

  const results = items.map((item, i) => {
    const pick = picks[i] ?? {};
    const issueOk = pick.issue === item.issue.correctIndex;
    const mitigationOk = pick.mitigation === item.mitigation.correctIndex;
    return { issueOk, mitigationOk };
  });
  const score = results.reduce((sum, r) => sum + (r.issueOk ? 1 : 0) + (r.mitigationOk ? 1 : 0), 0);

  const allAnswered = items.every(
    (_, i) => picks[i]?.issue !== undefined && picks[i]?.mitigation !== undefined,
  );

  const setPick = (i: number, field: 'issue' | 'mitigation', value: number) => {
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
      id: item.id,
      pickedIssue: picks[i]?.issue ?? null,
      correctIssue: item.issue.correctIndex,
      issueCorrect: results[i].issueOk,
      pickedMitigation: picks[i]?.mitigation ?? null,
      correctMitigation: item.mitigation.correctIndex,
      mitigationCorrect: results[i].mitigationOk,
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

  // One MC question block (issue or mitigation) with grading + feedback.
  const renderQuestion = (
    itemIndex: number,
    field: 'issue' | 'mitigation',
    question: FailureSpotterQuestion,
    correct: boolean,
  ) => {
    const picked = picks[itemIndex]?.[field];
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-gray-800 leading-relaxed">{question.prompt}</p>
        <div className="flex flex-col gap-2">
          {question.options.map((opt, oi) => {
            const selected = picked === oi;
            const isAnswer = graded && oi === question.correctIndex;
            const wrongPick = graded && selected && oi !== question.correctIndex;
            return (
              <button
                key={oi}
                disabled={graded}
                onClick={() => setPick(itemIndex, field, oi)}
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
                {question.why}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div
      className="bg-white border-2 border-nava-mint rounded-3xl p-8 shadow-sm space-y-8"
      id="failure-spotter"
    >
      <div className="flex items-center gap-3 border-b border-nava-mint pb-6">
        <div className="w-10 h-10 bg-nava-mint rounded-xl flex items-center justify-center text-nava-green">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold">Practice: Spot the failure</h3>
          <p className="text-xs text-gray-500">
            For each AI-generated artifact, name what&apos;s wrong and pick the best next step. This
            is graded practice — it doesn&apos;t affect your module completion.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {items.map((item, i) => {
          const res = results[i];
          const itemCorrect = res.issueOk && res.mitigationOk;
          return (
            <div
              key={item.id}
              className={`rounded-2xl border-2 p-5 space-y-5 transition-colors ${
                graded
                  ? itemCorrect
                    ? 'border-green-200 bg-green-50/40'
                    : 'border-red-200 bg-red-50/40'
                  : 'border-gray-100'
              }`}
            >
              <div className="prose prose-sm prose-slate max-w-none rounded-xl bg-gray-50 border border-gray-100 p-4 prose-p:text-gray-700 prose-li:text-gray-700 prose-strong:text-gray-800 prose-code:text-nava-plum prose-code:bg-gray-100 prose-code:rounded prose-code:px-1 prose-code:font-normal prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-blockquote:border-l-nava-plum prose-blockquote:text-gray-500">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.artifactMd}</ReactMarkdown>
              </div>

              {renderQuestion(i, 'issue', item.issue, res.issueOk)}
              {renderQuestion(i, 'mitigation', item.mitigation, res.mitigationOk)}
            </div>
          );
        })}
      </div>

      {saveError && <p className="text-xs text-red-600 font-medium">{saveError}</p>}

      {graded ? (
        <div className="flex items-center justify-between border-t border-gray-100 pt-6">
          <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
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

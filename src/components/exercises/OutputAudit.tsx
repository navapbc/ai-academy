import { AnimatePresence, motion } from 'motion/react';
import type { AuditStatus, OutputAuditConfig } from '../../types';
import { Check, ScanSearch, ShieldCheck, Sparkles, X } from 'lucide-react';

import ReactMarkdown from 'react-markdown';
import { gradeOutputAudit } from '../outputAudit.grade';
import { recordLabSubmission } from '../../lib/progress';
import remarkGfm from 'remark-gfm';
import { markdownComponents } from '../../lib/markdownComponents';
import { useAuth } from '../../lib/auth';
import { useState } from 'react';

interface Props {
  config: OutputAuditConfig;
  // The cell id this exercise belongs to (e.g. '1.2'); used as the lab_id on the
  // recorded submission.
  labId: string;
}

const VERDICTS: { value: AuditStatus; label: string }[] = [
  { value: 'supported', label: 'Supported' },
  { value: 'fabricated', label: 'Fabricated / unverifiable' },
];

// 1.2 output-audit (P4.3a): a "spot the confabulation" exercise that renders
// after the lesson. The learner reads a polished AI artifact and marks each
// claim Supported vs Fabricated/unverifiable; on Submit we auto-grade against
// the answer key, surface each claim's `why`, and record a lab_submissions row.
// This is NOT the completion gate — the inline quiz still owns completion — so
// it never calls onComplete.
export default function OutputAudit({ config, labId }: Props) {
  const { user } = useAuth();
  const { intro, artifact, claims } = config;

  // picks[claimId] = 'supported' | 'fabricated'
  const [picks, setPicks] = useState<Record<string, AuditStatus>>({});
  const [graded, setGraded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const grade = gradeOutputAudit(picks, claims);
  const allAnswered = claims.every((c) => picks[c.id] !== undefined);

  const setPick = (id: string, value: AuditStatus) => {
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

    const answers = claims.map((c) => ({
      id: c.id,
      text: c.text,
      picked: picks[c.id] ?? null,
      answer: c.status,
      correct: grade.results.find((r) => r.id === c.id)?.correct ?? false,
    }));

    setSaving(true);
    try {
      await recordLabSubmission(user.id, {
        labId,
        transcript: { kind: 'output-audit', answers, score: grade.score, maxScore: grade.total },
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
    <div className="bg-white border-2 border-nava-plum/20 rounded-3xl p-8 shadow-sm space-y-8" id="output-audit">
      <div className="flex items-center gap-3 border-b border-nava-plum/20 pb-6">
        <div className="w-10 h-10 bg-nava-plum/10 rounded-xl flex items-center justify-center text-nava-plum">
          <ScanSearch className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold">Practice: Audit the AI output</h3>
          <p className="text-xs text-gray-500">
            Read the polished draft below, then judge each claim: is it supported, or is it
            confabulated/unverifiable? This is graded practice — it doesn&apos;t affect your module
            completion.
          </p>
        </div>
      </div>

      {intro && <p className="text-sm text-gray-700 leading-relaxed">{intro}</p>}

      {/* The artifact under audit */}
      <div className="space-y-2">
        <div className="text-[11px] font-black uppercase tracking-widest text-gray-500">
          {artifact.label}
        </div>
        <div className="prose prose-sm prose-slate max-w-none rounded-2xl bg-gray-50 border border-gray-100 p-5 prose-headings:text-gray-800 prose-p:text-gray-700 prose-li:text-gray-700 prose-strong:text-gray-800 prose-code:text-nava-plum prose-code:bg-gray-100 prose-code:rounded prose-code:px-1 prose-code:font-normal prose-blockquote:border-l-nava-plum prose-blockquote:text-gray-500">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{artifact.bodyMd}</ReactMarkdown>
        </div>
      </div>

      {/* Claim-by-claim audit */}
      <div className="space-y-4">
        <div className="text-[11px] font-black uppercase tracking-widest text-gray-500">
          Audit each claim
        </div>
        {claims.map((claim) => {
          const picked = picks[claim.id];
          const res = graded ? grade.results.find((r) => r.id === claim.id) : undefined;
          const itemCorrect = res?.correct ?? false;
          return (
            <div
              key={claim.id}
              className={`rounded-2xl border-2 p-5 space-y-3 transition-colors ${
                graded
                  ? itemCorrect
                    ? 'border-green-200 bg-green-50/40'
                    : 'border-red-200 bg-red-50/40'
                  : 'border-gray-100'
              }`}
            >
              <p className="text-sm font-medium text-gray-800 leading-relaxed">{claim.text}</p>

              <div
                className="flex flex-wrap gap-2"
                role="radiogroup"
                aria-label={`Verdict for claim: ${claim.text}`}
              >
                {VERDICTS.map((v) => {
                  const selected = picked === v.value;
                  const isAnswer = graded && v.value === claim.status;
                  const wrongPick = graded && selected && v.value !== claim.status;
                  return (
                    <button
                      key={v.value}
                      role="radio"
                      aria-checked={selected}
                      disabled={graded}
                      onClick={() => setPick(claim.id, v.value)}
                      className={`text-sm font-semibold rounded-xl px-4 py-2 border-2 transition-all ${
                        isAnswer
                          ? 'border-green-600 bg-green-50 text-green-900'
                          : wrongPick
                            ? 'border-red-600 bg-red-50 text-red-900'
                            : selected
                              ? 'border-nava-plum bg-nava-plum/10 text-nava-plum'
                              : 'border-gray-100 text-gray-700 hover:border-nava-plum/30'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {v.label}
                        {isAnswer && <Check className="w-4 h-4 text-green-600 shrink-0" />}
                        {wrongPick && <X className="w-4 h-4 text-red-600 shrink-0" />}
                      </span>
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
                    className={`flex gap-3 rounded-xl p-4 ${itemCorrect ? 'bg-green-100/60' : 'bg-red-100/50'}`}
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                        itemCorrect ? 'bg-green-200' : 'bg-red-200'
                      }`}
                    >
                      {itemCorrect ? (
                        <Check className="w-4 h-4 text-green-700" />
                      ) : (
                        <X className="w-4 h-4 text-red-700" />
                      )}
                    </div>
                    <div className="space-y-1 text-xs leading-relaxed">
                      {!itemCorrect && (
                        <p className="font-bold text-red-800">
                          Answer: {claim.status === 'supported' ? 'Supported' : 'Fabricated / unverifiable'}
                        </p>
                      )}
                      <p className={itemCorrect ? 'text-green-800' : 'text-red-800'}>{claim.why}</p>
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
        <div className="flex items-center justify-between border-t border-gray-100 pt-6">
          <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm font-bold text-gray-700">
            <ShieldCheck className="w-5 h-5 text-nava-green" />
            You scored {grade.score} / {grade.total}
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

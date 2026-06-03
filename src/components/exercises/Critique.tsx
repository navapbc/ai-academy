import { useState } from 'react';
import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ScanSearch, Save, Sparkles } from 'lucide-react';
import type { CritiqueConfig } from '../../types';
import { useAuth } from '../../lib/auth';
import { recordLabSubmission, saveGrade } from '../../lib/progress';
import { requestLlmGrade, type GradeResult } from '../../lib/grading';
import GradeResultCard from '../GradeResultCard';

interface Props {
  config: CritiqueConfig;
  labId: string;
}

// The soft floor for submitting a critique — enough to express a real
// validation, not a one-liner. The counter shows it as a target; Save is gated
// below it. The inline quiz remains the module's completion gate; this records a
// graded lab_submissions row only (no onComplete).
const MIN_CRITIQUE_WORDS = 40;

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

export default function Critique({ config, labId }: Props) {
  const { user } = useAuth();
  const { title, subtitle, brief, artifact, rubric } = config;

  const [critique, setCritique] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [grading, setGrading] = useState(false);
  const [gradeResult, setGradeResult] = useState<GradeResult | null>(null);
  const [gradeError, setGradeError] = useState<string | null>(null);

  const wordCount = countWords(critique);
  const reachedTarget = wordCount >= MIN_CRITIQUE_WORDS;
  const canSave = reachedTarget && !saving && !saved;

  const handleSave = async () => {
    if (!canSave) return;
    setSaveError(null);
    setGradeError(null);

    if (!user) {
      setSaveError('Sign in to save your critique — it’s graded below.');
      return;
    }

    setSaving(true);
    try {
      const id = await recordLabSubmission(user.id, {
        labId,
        transcript: { kind: 'critique', critique: critique.trim(), wordCount },
        status: 'submitted',
      });
      setSaved(true);

      // Grade in place against the rubric (P4.2 judge). Completion never depends
      // on grading — the inline quiz is the gate, so a grading failure is a quiet,
      // non-blocking note rather than an error.
      setGrading(true);
      try {
        const result = await requestLlmGrade({
          rubric,
          submission: {
            brief: brief.instruction,
            sections: [
              { label: 'Artifact under review', text: artifact.bodyMd },
              { label: "The learner's critique", text: critique.trim() },
            ],
          },
        });
        await saveGrade(id, result, 'reviewable');
        setGradeResult(result);
      } catch {
        setGradeError('Grading is unavailable right now — your critique is saved.');
      } finally {
        setGrading(false);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save your critique.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border-2 border-nava-mint rounded-3xl p-8 shadow-sm space-y-6" id="critique">
      <div className="flex items-center gap-3 border-b border-nava-mint pb-6">
        <div className="w-10 h-10 bg-nava-mint rounded-xl flex items-center justify-center text-nava-green">
          <ScanSearch className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold">{title ?? 'Practice: Critique the artifact'}</h3>
          <p className="text-xs text-gray-500">
            {subtitle ??
              'Read the AI-generated artifact and write a critique. This is graded practice — it doesn’t affect your module completion.'}
          </p>
        </div>
      </div>

      {/* The polished artifact under review. */}
      <div className="space-y-2">
        <div className="text-[11px] font-black uppercase tracking-widest text-gray-500">
          {artifact.label}
        </div>
        <div className="prose prose-sm prose-slate max-w-none rounded-xl bg-gray-50 border border-gray-100 p-5 prose-p:text-gray-700 prose-li:text-gray-700 prose-headings:text-gray-800 prose-strong:text-gray-800 prose-code:text-nava-plum prose-code:bg-gray-100 prose-code:rounded prose-code:px-1 prose-code:font-normal prose-blockquote:border-l-nava-plum prose-blockquote:text-gray-500">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{artifact.bodyMd}</ReactMarkdown>
        </div>
      </div>

      <p className="text-sm font-semibold text-gray-800 leading-relaxed">{brief.instruction}</p>

      {saved ? (
        <div className="rounded-2xl border-2 border-nava-green/20 bg-nava-mint/30 p-5 whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
          {critique.trim()}
        </div>
      ) : (
        <>
          <textarea
            value={critique}
            onChange={(e) => setCritique(e.target.value)}
            rows={9}
            aria-label="Your critique"
            placeholder="Which claims can you trust? Which can’t you verify from this document alone? What would you check first?"
            className="w-full rounded-2xl border-2 border-gray-100 focus:border-nava-green focus:outline-none p-4 text-sm text-gray-700 leading-relaxed resize-y transition-colors"
          />

          {saveError && <p role="alert" className="text-xs text-red-600 font-medium">{saveError}</p>}

          <div className="flex items-center justify-between border-t border-gray-100 pt-6">
            <span className={`text-xs font-semibold ${reachedTarget ? 'text-nava-green' : 'text-gray-500'}`}>
              {wordCount} / {MIN_CRITIQUE_WORDS} words
            </span>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="flex items-center gap-2 px-8 py-3 bg-nava-green text-white rounded-xl font-bold shadow-lg shadow-nava-green/20 disabled:opacity-50 transition-all active:scale-95"
            >
              {saving ? (
                <>
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                    <Sparkles className="w-4 h-4" />
                  </motion.div>
                  Saving…
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save critique
                </>
              )}
            </button>
          </div>
          {!reachedTarget && (
            <p className="text-xs text-gray-500 -mt-2 text-right">
              Write at least {MIN_CRITIQUE_WORDS} words to submit.
            </p>
          )}
        </>
      )}

      {/* Anchor-scored result (P4.2 judge) — provisional, pending review (P5.1). */}
      {grading && (
        <div role="status" aria-live="polite" className="text-xs text-gray-500 flex items-center gap-2">
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
            <Sparkles className="w-3.5 h-3.5" />
          </motion.div>
          Grading your critique…
        </div>
      )}
      {gradeError && <p role="status" aria-live="polite" className="text-xs text-gray-500">{gradeError}</p>}
      {gradeResult && <GradeResultCard result={gradeResult} />}
    </div>
  );
}

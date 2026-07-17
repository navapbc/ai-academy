import { useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Save, Sparkles } from 'lucide-react';
import type { GradingRubric } from '../../types';
import { useAuth } from '../../lib/auth';
import { recordLabSubmission } from '../../lib/progress';
import { useLabGrading } from '../../lib/useLabGrading';
import GradeResultCard from '../GradeResultCard';
import GradeError from '../GradeError';
import PiiNotice from '../PiiNotice';

// Shared "read one sourced markdown block → write free text → LLM-graded in place"
// exercise. Both the 2.2/2.3 critique (P4.3b) and the 2.7 synthesis (P4.4a) are
// the same shape — a brief, one rendered source block, a min-words-gated textarea,
// and the P4.2 judge flow → GradeResultCard — so they share this component and
// differ only in copy, the grade section label, and the transcript discriminant
// (`noun`). Like the other Stage-1b/2 exercises this is graded PRACTICE that records
// a lab_submissions row but is NOT the completion gate (the inline quiz is) —
// structurally enforced by the absence of an onComplete prop.
interface Props {
  labId: string;
  /**
   * The transcript discriminant (`'critique'` | `'synthesis'`). Also derives the
   * grade response-section label (`The learner's <noun>`) and all "your <noun>"
   * copy, so a thin wrapper only supplies the parts that genuinely differ.
   */
  noun: string;
  containerId: string; // the section's #id (used by existing assertions/anchors)
  icon: ReactNode;
  title: string; // already-resolved by the wrapper (with its own default)
  subtitle: string;
  source: { label: string; bodyMd: string }; // the markdown block under the brief
  sourceSectionLabel: string; // grade section label for the source block
  brief: { instruction: string };
  rubric: GradingRubric;
  textareaPlaceholder: string;
  minWords: number; // soft floor: gates Save + drives the live counter
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

export default function SourcedFreeTextLab({
  labId,
  noun,
  containerId,
  icon,
  title,
  subtitle,
  source,
  sourceSectionLabel,
  brief,
  rubric,
  textareaPlaceholder,
  minWords,
}: Props) {
  const { user } = useAuth();

  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { grading, gradeResult, gradeError, grade, retry, reset: resetGrade } = useLabGrading();

  const wordCount = countWords(text);
  const reachedTarget = wordCount >= minWords;
  const canSave = reachedTarget && !saving && !saved;

  const handleSave = async () => {
    if (!canSave) return;
    setSaveError(null);
    resetGrade();

    if (!user) {
      setSaveError(`Sign in to save your ${noun} — it’s graded below.`);
      return;
    }

    setSaving(true);
    try {
      const id = await recordLabSubmission(user.id, {
        labId,
        transcript: { kind: noun, [noun]: text.trim(), wordCount },
        status: 'submitted',
      });
      setSaved(true);

      // Grade in place against the rubric (P4.2 judge). Completion never depends
      // on grading — the inline quiz is the gate, so a grading failure is a quiet,
      // non-blocking note, retryable in place (D-17).
      await grade({
        submissionId: id,
        rubric,
        submission: {
          brief: brief.instruction,
          sections: [
            { label: sourceSectionLabel, text: source.bodyMd },
            { label: `The learner's ${noun}`, text: text.trim() },
          ],
        },
        failureNote: `Grading is unavailable right now — your ${noun} is saved.`,
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : `Could not save your ${noun}.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border-2 border-nava-plum/20 rounded-3xl p-8 shadow-sm space-y-6" id={containerId}>
      <div className="flex items-center gap-3 border-b border-nava-plum/20 pb-6">
        <div className="w-10 h-10 bg-nava-plum/10 rounded-xl flex items-center justify-center text-nava-plum">
          {icon}
        </div>
        <div>
          <h3 className="font-bold">{title}</h3>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>

      {/* The source material the learner works from. */}
      <div className="space-y-2">
        <div className="text-[11px] font-black uppercase tracking-widest text-gray-500">
          {source.label}
        </div>
        <div className="prose prose-sm prose-slate max-w-none rounded-xl bg-gray-50 border border-gray-100 p-5 prose-p:text-gray-700 prose-li:text-gray-700 prose-headings:text-gray-800 prose-strong:text-gray-800 prose-code:text-nava-plum prose-code:bg-gray-100 prose-code:rounded prose-code:px-1 prose-code:font-normal prose-blockquote:border-l-nava-plum prose-blockquote:text-gray-500">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{source.bodyMd}</ReactMarkdown>
        </div>
      </div>

      <p className="text-sm font-semibold text-gray-800 leading-relaxed">{brief.instruction}</p>

      {saved ? (
        <div className="rounded-2xl border-2 border-nava-green/20 bg-nava-mint/30 p-5 whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
          {text.trim()}
        </div>
      ) : (
        <>
          <PiiNotice />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={9}
            aria-label={`Your ${noun}`}
            placeholder={textareaPlaceholder}
            className="w-full rounded-2xl border-2 border-gray-100 focus:border-nava-plum focus:outline-none p-4 text-sm text-gray-700 leading-relaxed resize-y transition-colors"
          />

          {saveError && <p role="alert" className="text-xs text-red-600 font-medium">{saveError}</p>}

          <div className="flex items-center justify-between border-t border-gray-100 pt-6">
            <span className={`text-xs font-semibold ${reachedTarget ? 'text-nava-green' : 'text-gray-500'}`}>
              {wordCount} / {minWords} words
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
                  Save {noun}
                </>
              )}
            </button>
          </div>
          {!reachedTarget && (
            <p className="text-xs text-gray-500 -mt-2 text-right">
              Write at least {minWords} words to submit.
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
          Grading your {noun}…
        </div>
      )}
      {gradeError && <GradeError note={gradeError} onRetry={retry} />}
      {gradeResult && <GradeResultCard result={gradeResult} />}
    </div>
  );
}

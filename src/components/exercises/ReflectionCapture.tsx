import { useState } from 'react';
import { motion } from 'motion/react';
import { PenLine, Check, Sparkles, Eye } from 'lucide-react';
import type { ReflectionConfig } from '../../types';
import { useAuth } from '../../lib/auth';
import { recordLabSubmission } from '../../lib/progress';

interface Props {
  config: ReflectionConfig;
  labId: string;
}

// The hard floor for submitting a reflection. minWords is the (softer) target
// shown in the counter — we don't block at minWords, only below this floor, so
// the prompt stays an invitation rather than a gate. The inline quiz remains
// the module's completion gate; this records an ungraded submission only.
const MIN_SUBMIT_WORDS = 50;

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

export default function ReflectionCapture({ config, labId }: Props) {
  const { user } = useAuth();
  const { prompt, guidance, minWords } = config;

  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const wordCount = countWords(text);
  const reachedTarget = wordCount >= minWords;
  const canSubmit = wordCount >= MIN_SUBMIT_WORDS && !saving && !saved;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaveError(null);

    if (!user) {
      setSaveError('Sign in to save your reflection so a Champion can review it.');
      return;
    }

    setSaving(true);
    try {
      await recordLabSubmission(user.id, {
        labId,
        transcript: { kind: 'reflection', reflection: text.trim(), wordCount },
        status: 'submitted',
      });
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save your reflection.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="bg-white border-2 border-nava-mint rounded-3xl p-8 shadow-sm space-y-6"
      id="reflection-capture"
    >
      <div className="flex items-center gap-3 border-b border-nava-mint pb-6">
        <div className="w-10 h-10 bg-nava-mint rounded-xl flex items-center justify-center text-nava-green">
          <PenLine className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold">Reflection</h3>
          <p className="text-xs text-gray-500">
            A written reflection for your Champion to read. There&apos;s no right answer and it
            isn&apos;t graded — it doesn&apos;t affect your module completion.
          </p>
        </div>
      </div>

      <p className="text-sm font-semibold text-gray-800 leading-relaxed">{prompt}</p>
      <p className="text-xs text-gray-500 leading-relaxed">{guidance}</p>

      {saved ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          role="status"
          aria-live="polite"
          className="rounded-2xl border-2 border-nava-green/20 bg-nava-mint/40 p-6 space-y-3"
        >
          <div className="flex items-center gap-2 text-nava-green font-bold">
            <Check className="w-5 h-5" />
            Reflection saved
          </div>
          <p className="flex items-start gap-2 text-sm text-gray-600 leading-relaxed">
            <Eye className="w-4 h-4 text-nava-green shrink-0 mt-0.5" />
            <span>
              Your reflection has been recorded and a Champion can review it. You wrote{' '}
              {wordCount} {wordCount === 1 ? 'word' : 'words'}.
            </span>
          </p>
          <div className="prose prose-sm prose-slate max-w-none rounded-xl bg-white border border-gray-100 p-4 whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
            {text.trim()}
          </div>
        </motion.div>
      ) : (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder="Write your reflection here…"
            className="w-full rounded-2xl border-2 border-gray-100 focus:border-nava-green focus:outline-none p-4 text-sm text-gray-700 leading-relaxed resize-y transition-colors"
          />

          {saveError && <p className="text-xs text-red-600 font-medium">{saveError}</p>}

          <div className="flex items-center justify-between border-t border-gray-100 pt-6">
            <span
              className={`text-xs font-semibold ${
                reachedTarget ? 'text-nava-green' : 'text-gray-500'
              }`}
            >
              {wordCount} / {minWords} words
              {reachedTarget && (
                <span className="inline-flex items-center gap-1 ml-2">
                  <Check className="w-3.5 h-3.5" />
                  target reached
                </span>
              )}
            </span>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex items-center gap-2 px-10 py-3 bg-nava-green text-white rounded-xl font-bold shadow-lg shadow-nava-green/20 disabled:opacity-50 transition-all active:scale-95"
            >
              {saving ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1 }}
                  >
                    <Sparkles className="w-4 h-4" />
                  </motion.div>
                  Saving…
                </>
              ) : (
                'Submit reflection'
              )}
            </button>
          </div>
          {wordCount < MIN_SUBMIT_WORDS && (
            <p className="text-xs text-gray-400 -mt-2 text-right">
              Write at least {MIN_SUBMIT_WORDS} words to submit.
            </p>
          )}
        </>
      )}
    </div>
  );
}

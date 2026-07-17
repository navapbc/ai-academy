import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Shuffle, Check, Sparkles, ClipboardCheck } from 'lucide-react';
import type { PredictionSortConfig } from '../../types';
import { useAuth } from '../../lib/auth';
import { recordLabSubmission } from '../../lib/progress';

interface Props {
  config: PredictionSortConfig;
  labId: string;
}

type Bucket = 'lookup' | 'predict';

// Course 1, Week 1 intuition-then-reveal sort (1.01). The learner places each task
// into one of two buckets by what it FEELS like; on submit every card reveals the
// same truth — it was all prediction, never lookup. No score, no wrong answer. The
// recorded submission auto-completes the module via the participation seam (via='lab'),
// so there is no onComplete prop (matches chat-compare / decision-scenario).
export default function PredictionSort({ config, labId }: Props) {
  const { user } = useAuth();
  const { items, bucketLabels, takeaway } = config;

  const [placements, setPlacements] = useState<Record<string, Bucket>>({});
  const [graded, setGraded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const allPlaced = items.every((it) => placements[it.id] !== undefined);

  const place = (id: string, bucket: Bucket) => {
    if (graded) return;
    setPlacements((prev) => ({ ...prev, [id]: bucket }));
  };

  const handleSubmit = async () => {
    if (!allPlaced || graded || saving) return; // guard the async-save window (DATA-04)
    setGraded(true);
    setSaveError(null);

    if (!user) {
      setSaveError('Sign in to record your work — the reveal is shown below.');
      return;
    }

    setSaving(true);
    try {
      await recordLabSubmission(user.id, {
        labId,
        transcript: {
          placements,
          items: items.map((it) => ({ id: it.id, prompt: it.prompt })),
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
    setPlacements({});
    setGraded(false);
    setSaveError(null);
  };

  return (
    <div className="bg-white border-2 border-nava-plum/20 rounded-3xl p-8 shadow-sm space-y-8" id="prediction-sort">
      <div className="flex items-center gap-3 border-b border-nava-plum/20 pb-6">
        <div className="w-10 h-10 bg-nava-plum/10 rounded-xl flex items-center justify-center text-nava-plum">
          <Shuffle className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold">Lookup or Predict?</h3>
          <p className="text-xs text-gray-500">Sort by gut feel — there is no wrong answer here.</p>
        </div>
      </div>

      {config.introMd && (
        <div className="prose prose-sm max-w-none text-gray-700">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{config.introMd}</ReactMarkdown>
        </div>
      )}

      <div className="space-y-6">
        {items.map((item) => {
          const chosen = placements[item.id];
          return (
            <div
              key={item.id}
              className={`rounded-2xl border-2 p-5 space-y-4 transition-colors ${
                graded ? 'border-nava-plum/20 bg-nava-plum/5' : 'border-gray-100'
              }`}
            >
              <p className="text-sm font-semibold text-gray-800 leading-relaxed">{item.prompt}</p>

              <div className="flex flex-col sm:flex-row gap-2" role="radiogroup" aria-label={item.prompt}>
                {(['lookup', 'predict'] as Bucket[]).map((bucket) => {
                  const selected = chosen === bucket;
                  return (
                    <button
                      key={bucket}
                      role="radio"
                      aria-checked={selected}
                      disabled={graded}
                      onClick={() => place(item.id, bucket)}
                      className={`flex-1 text-left text-sm font-medium rounded-xl px-4 py-2.5 border-2 transition-all ${
                        selected
                          ? 'border-nava-green bg-nava-mint text-nava-green'
                          : 'border-gray-100 text-gray-700 hover:border-nava-green/30'
                      }`}
                    >
                      {bucketLabels[bucket]}
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
                    className="flex gap-3 rounded-xl bg-nava-mint/40 p-4"
                  >
                    <div className="w-7 h-7 rounded-full bg-nava-mint flex items-center justify-center shrink-0">
                      <Check className="w-4 h-4 text-nava-green" />
                    </div>
                    <p className="text-xs leading-relaxed text-gray-700">{item.reveal}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {saveError && <p role="alert" className="text-xs text-red-600 font-medium">{saveError}</p>}

      <AnimatePresence>
        {graded && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border-2 border-nava-plum/20 bg-nava-plum/5 p-6 space-y-3"
          >
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-nava-plum" />
              <h4 className="font-bold text-nava-plum">{takeaway.title}</h4>
            </div>
            <p className="text-sm font-semibold text-gray-800">
              Every one of these was Claude predicting the next word — it never looked anything up.
            </p>
            <p className="text-sm text-gray-600 leading-relaxed">{takeaway.body}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The reveal (graded) shows immediately on submit, but the footer reflects the
          save state: while the submission is in flight we show the "Submitting…" spinner
          and withhold "Try again", so a reset can't race the async save (DATA-04). */}
      {saving ? (
        <div className="flex justify-end border-t border-gray-100 pt-6">
          <button
            type="button"
            disabled
            aria-busy="true"
            className="flex items-center gap-2 px-10 py-3 bg-nava-green text-white rounded-xl font-bold shadow-lg shadow-nava-green/20 opacity-50 transition-all"
          >
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
              <Sparkles className="w-4 h-4" />
            </motion.div>
            Submitting…
          </button>
        </div>
      ) : graded ? (
        <div className="flex justify-end border-t border-gray-100 pt-6">
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
            disabled={!allPlaced}
            className="flex items-center gap-2 px-10 py-3 bg-nava-green text-white rounded-xl font-bold shadow-lg shadow-nava-green/20 disabled:opacity-50 transition-all active:scale-95"
          >
            Submit
          </button>
        </div>
      )}
    </div>
  );
}

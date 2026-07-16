import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ListChecks, Check, Sparkles, ClipboardCheck } from 'lucide-react';
import type { DelegationSortConfig } from '../../types';
import { useAuth } from '../../lib/auth';
import { recordLabSubmission } from '../../lib/progress';

interface Props {
  config: DelegationSortConfig;
  labId: string;
}

// Course 1, Week 2 delegation sort (1.03). The learner sorts each scenario into a
// category bucket (Full-AI / AI-assisted / Human-only); on submit every card reveals a
// SUGGESTED categorization + rationale, framed as a defensible call (never scored or
// gated). The recorded submission auto-completes the module via the participation seam
// (via='lab'), so there is no onComplete prop (matches prediction-sort / chat-compare).
export default function DelegationSort({ config, labId }: Props) {
  const { user } = useAuth();
  const { categories, items, takeaway } = config;

  const [placements, setPlacements] = useState<Record<string, string>>({});
  const [graded, setGraded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const labelFor = (id: string) => categories.find((c) => c.id === id)?.label ?? id;
  const allPlaced = items.every((it) => placements[it.id] !== undefined);

  const place = (id: string, categoryId: string) => {
    if (graded) return;
    setPlacements((prev) => ({ ...prev, [id]: categoryId }));
  };

  const handleSubmit = async () => {
    if (!allPlaced || graded || saving) return; // guard the async-save window (DATA-04)
    setGraded(true);
    setSaveError(null);

    if (!user) {
      setSaveError('Sign in to record your work — the suggested calls are shown below.');
      return;
    }

    setSaving(true);
    try {
      await recordLabSubmission(user.id, {
        labId,
        transcript: {
          placements,
          items: items.map((it) => ({ id: it.id, scenario: it.scenario, suggested: it.suggested })),
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
    <div className="bg-white border-2 border-nava-mint rounded-3xl p-8 shadow-sm space-y-8" id="delegation-sort">
      <div className="flex items-center gap-3 border-b border-nava-mint pb-6">
        <div className="w-10 h-10 bg-nava-mint rounded-xl flex items-center justify-center text-nava-green">
          <ListChecks className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold">Full-AI, Assisted, or Human-Only?</h3>
          <p className="text-xs text-gray-500">Sort each task, then see a defensible call — gray areas are worth debating.</p>
        </div>
      </div>

      {config.introMd && (
        <div className="prose prose-sm max-w-none text-gray-700">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{config.introMd}</ReactMarkdown>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {categories.map((c) => (
          <div key={c.id} className="text-xs text-gray-600 bg-gray-50 rounded-xl p-3 leading-relaxed">
            <span className="font-bold text-nava-plum">{c.label}</span> — {c.desc}
          </div>
        ))}
      </div>

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
              <p className="text-sm font-semibold text-gray-800 leading-relaxed">{item.scenario}</p>

              <div className="flex flex-col sm:flex-row gap-2" role="radiogroup" aria-label={item.scenario}>
                {categories.map((c) => {
                  const selected = chosen === c.id;
                  return (
                    <button
                      key={c.id}
                      role="radio"
                      aria-checked={selected}
                      disabled={graded}
                      onClick={() => place(item.id, c.id)}
                      className={`flex-1 text-left text-sm font-medium rounded-xl px-4 py-2.5 border-2 transition-all ${
                        selected
                          ? 'border-nava-green bg-nava-mint text-nava-green'
                          : 'border-gray-100 text-gray-700 hover:border-nava-green/30'
                      }`}
                    >
                      {c.label}
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
                    <p className="text-xs leading-relaxed text-gray-700">
                      <span className="font-bold">A defensible call: {labelFor(item.suggested)}.</span> {item.rationale}
                    </p>
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
            <p className="text-sm text-gray-600 leading-relaxed">{takeaway.body}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {graded ? (
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
            disabled={!allPlaced || saving}
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
              'Submit'
            )}
          </button>
        </div>
      )}
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Shuffle, Check, Sparkles, ClipboardCheck, Bot } from 'lucide-react';
import type { PredictionSortConfig, PredictionSortItem } from '../../types';
import { useAuth } from '../../lib/auth';
import { streamChat } from '../../lib/llm';
import { DEFAULT_MODEL_ID } from '../../lib/models';
import { recordLabSubmission } from '../../lib/progress';

interface Props {
  config: PredictionSortConfig;
  labId: string;
}

type Bucket = 'lookup' | 'predict';

// Per-item "Run prompt" state, keyed by item id. An absent key means the learner
// has never run that prompt (idle). Running streams Claude's live answer into a
// small window between the question and the two buckets, so the learner can see
// what Claude actually produces before choosing "looking it up" vs "making it up".
type RunStatus = 'streaming' | 'done' | 'error';
interface RunState {
  status: RunStatus;
  text: string;
  error: string | null;
}

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
  const [runs, setRuns] = useState<Record<string, RunState>>({});

  // One AbortController per item so a re-run (or unmount) cancels that item's
  // stream without touching any other item's in-flight run.
  const runAbortRef = useRef<Record<string, AbortController>>({});
  // Abort every in-flight run on unmount so no orphan stream writes into a dead
  // component (mirrors PairedCalibration's abort-on-unmount, scaled to N runs).
  useEffect(
    () => () => {
      for (const c of Object.values(runAbortRef.current)) c.abort();
    },
    [],
  );

  const allPlaced = items.every((it) => placements[it.id] !== undefined);

  const place = (id: string, bucket: Bucket) => {
    if (graded) return;
    setPlacements((prev) => ({ ...prev, [id]: bucket }));
  };

  // Run an item's prompt through Claude Haiku and stream the answer live. Runnable
  // regardless of `graded` (and while signed out — streamChat falls back to the anon
  // key): the point is to try the prompt BEFORE choosing a bucket. Only re-running
  // the same item mid-stream is blocked (the button disables while it streams).
  const runPrompt = async (item: PredictionSortItem) => {
    runAbortRef.current[item.id]?.abort(); // cancel a prior run of THIS item
    const controller = new AbortController();
    runAbortRef.current[item.id] = controller;

    setRuns((prev) => ({ ...prev, [item.id]: { status: 'streaming', text: '', error: null } }));

    try {
      await streamChat(
        [{ role: 'user', content: item.prompt }],
        // Cap output so long answers (e.g. "three offsite ideas") stay slim.
        { model: DEFAULT_MODEL_ID, maxTokens: 300, signal: controller.signal },
        (chunk) =>
          setRuns((prev) => ({
            ...prev,
            [item.id]: {
              status: 'streaming',
              text: (prev[item.id]?.text ?? '') + chunk,
              error: null,
            },
          })),
      );
      // Aborting resolves streamChat cleanly (no throw); a superseded/unmounted run
      // must not flip its stale controller's result to "done".
      if (controller.signal.aborted) return;
      setRuns((prev) => ({
        ...prev,
        [item.id]: { status: 'done', text: prev[item.id]?.text ?? '', error: null },
      }));
    } catch (err) {
      if (controller.signal.aborted) return;
      setRuns((prev) => ({
        ...prev,
        [item.id]: {
          status: 'error',
          text: prev[item.id]?.text ?? '',
          error: err instanceof Error ? err.message : 'Request to Claude failed.',
        },
      }));
    }
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
    // Kill any orphan streams so they can't append into a reset card.
    for (const c of Object.values(runAbortRef.current)) c.abort();
    runAbortRef.current = {};
    setRuns({});
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
          const run = runs[item.id];
          const running = run?.status === 'streaming';
          return (
            <div
              key={item.id}
              className={`rounded-2xl border-2 p-5 space-y-4 transition-colors ${
                graded ? 'border-nava-plum/20 bg-nava-plum/5' : 'border-gray-100'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-gray-800 leading-relaxed">{item.prompt}</p>
                <button
                  type="button"
                  onClick={() => runPrompt(item)}
                  disabled={running}
                  aria-busy={running}
                  aria-label={`Run prompt: ${item.prompt}`}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-nava-green text-white rounded-lg font-bold text-xs hover:bg-nava-green/90 disabled:opacity-50 transition-all active:scale-95"
                >
                  {running ? (
                    <>
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                        <Sparkles className="w-3.5 h-3.5" />
                      </motion.div>
                      Running…
                    </>
                  ) : (
                    <>
                      <Bot className="w-3.5 h-3.5" /> {run ? 'Run again' : 'Run prompt'}
                    </>
                  )}
                </button>
              </div>

              {/* Claude's live answer — small and scrollable so long answers can't
                  blow out the card — shown between the question and the buckets. */}
              <AnimatePresence>
                {run && (running || run.text) && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    role="status"
                    aria-live="polite"
                    aria-busy={running}
                    className="max-h-40 overflow-y-auto bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-700 whitespace-pre-wrap leading-relaxed"
                  >
                    {run.text || <span className="text-gray-500 italic">Waiting for Claude…</span>}
                  </motion.div>
                )}
              </AnimatePresence>
              {run?.status === 'error' && (
                <p role="alert" className="text-xs text-red-600 font-medium">{run.error}</p>
              )}

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
                          ? 'border-nava-plum bg-nava-plum/10 text-nava-plum'
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

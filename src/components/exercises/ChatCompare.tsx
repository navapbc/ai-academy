import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Columns3, Send, Sparkles, RotateCcw, Bot, MessageCircleQuestion } from 'lucide-react';
import type { ChatCompareConfig, ChatComparePane } from '../../types';
import { useAuth } from '../../lib/auth';
import { streamChat } from '../../lib/llm';
import { DEFAULT_MODEL_ID } from '../../lib/models';
import { recordLabSubmission } from '../../lib/progress';
import PiiNotice from '../PiiNotice';

// The chat-compare exercise (cohort-restructure U6): 1–4 side-by-side LIVE
// Claude panes answering ONE shared learner prompt. Each pane can carry a
// hidden system prompt ("rigged" — sent via StreamOptions.system) and/or a
// grounding source ("grounded" — prepended to the learner's message content,
// mirroring how VoiceEdit/PromptEval build prompts). One parameterized kind
// powers Week 1 (3-pane rigged; 1-pane confidently-wrong) and Week 2
// (bare-vs-grounded). UNGRADED: every submit — including a partial-failure
// run — records a lab_submissions row (`transcript.kind:'chat-compare'`) but
// never gates completion (participation completion is U9) — structurally
// enforced by Props being { config, labId } only (no onComplete, no
// useLabGrading). Suggested prompts are chips that FILL the input, never
// auto-submit. Failure spec: pane-local error + Retry that re-runs only that
// pane while siblings' output stays; every pane runs on its own
// AbortController, all aborted on unmount (LLM-05, mirroring IterationLab's
// cleanup); pane starts are staggered ~200ms as rate-limit courtesy.
interface Props {
  config: ChatCompareConfig;
  labId: string;
}

/** Delay between pane starts — a rate-limit courtesy for the N-fan-out. */
export const PANE_STAGGER_MS = 200;

type PaneStatus = 'idle' | 'streaming' | 'done' | 'error';

interface PaneRun {
  status: PaneStatus;
  text: string;
  error: string | null;
}

const IDLE_RUN: PaneRun = { status: 'idle', text: '', error: null };

/** The visible pane heading (config label, or a positional fallback). */
function paneLabel(pane: ChatComparePane, index: number): string {
  return pane.label ?? `Response ${index + 1}`;
}

// Builds the pane's user message: grounded panes get their source PREPENDED to
// the learner's shared prompt (the same content-assembly posture as VoiceEdit's
// buildDraftPrompt / PromptEval's buildCasePrompt). Kept small + pure so tests
// pin exactly what each pane was asked.
function buildPaneUserContent(pane: ChatComparePane, prompt: string): string {
  if (!pane.sourceMd) return prompt;
  return `Use the following source material to answer.\n\nSource:\n${pane.sourceMd}\n\n---\n\n${prompt}`;
}

/** Abort-aware sleep: resolves early (cleanly) when the signal aborts. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(t);
      resolve();
    };
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

// Tailwind needs literal class strings, so the reflow map is a lookup, not a
// template. Everything is a single column below desktop width (the app's
// responsive convention — cf. PromptEval's case grid).
const GRID_BY_COUNT: Record<number, string> = {
  1: 'grid grid-cols-1 gap-4',
  2: 'grid grid-cols-1 md:grid-cols-2 gap-4',
  3: 'grid grid-cols-1 md:grid-cols-3 gap-4',
  4: 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4',
};

/** The recorded shape of one pane's outcome: streamed text, or its error. */
type PaneResult = { label: string; text: string } | { label: string; error: string };

export default function ChatCompare({ config, labId }: Props) {
  const { user } = useAuth();
  const { panes } = config;
  const title = config.title ?? 'Compare Claude side by side';
  const subtitle =
    config.subtitle ??
    'One prompt, every pane. Read the responses against each other — this doesn’t affect your module completion.';

  const [prompt, setPrompt] = useState('');
  const [runs, setRuns] = useState<PaneRun[]>(() => panes.map(() => IDLE_RUN));
  // The ONE polite live region's current message ("Response 2 of 3 streaming /
  // complete / failed") — a single announcer, not per-pane competing regions
  // (the W2-8/W2-9 posture, cf. PairedCalibration's phase announcer).
  const [announcement, setAnnouncement] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Every pane streams on its OWN controller so a pane-local Retry can cancel
  // and re-run just that pane; unmount aborts them all (LLM-05). mountedRef
  // gates the post-fan-out submission write + state updates so an unmount
  // mid-stream leaves nothing behind.
  const controllersRef = useRef<(AbortController | null)[]>([]);
  const mountedRef = useRef(true);
  // The prompt the visible outputs belong to — a per-pane Retry must re-ask
  // the SUBMITTED prompt even if the learner has since edited the textarea.
  const activePromptRef = useRef('');
  // The recorded transcript reads THIS ref — written by BOTH the fan-out and
  // any pane Retry at the moment a pane reaches a terminal state — instead of
  // Promise.all's return array, so a Retry that finishes before its siblings
  // records the retried outcome, not the stale pre-retry result (FIX B-1).
  const resultsRef = useRef<PaneResult[]>([]);
  // Submission generation counter (FIX B-2): an in-flight submission's late
  // failure must never write save-error state over a newer submission's run.
  const submissionRef = useRef(0);
  useEffect(() => {
    mountedRef.current = true;
    const controllers = controllersRef.current;
    return () => {
      mountedRef.current = false;
      controllers.forEach((c) => c?.abort());
    };
  }, []);

  const anyStreaming = runs.some((r) => r.status === 'streaming');
  const hasRun = runs.some((r) => r.status !== 'idle');
  // Double-submit is guarded while ANY pane streams; an empty prompt is blocked.
  const canSubmit = prompt.trim().length > 0 && !anyStreaming;

  const setRun = (index: number, run: PaneRun) => {
    if (!mountedRef.current) return;
    setRuns((prev) => prev.map((r, i) => (i === index ? run : r)));
  };

  const announce = (index: number, phase: 'streaming' | 'complete' | 'failed') => {
    if (!mountedRef.current) return;
    setAnnouncement(`Response ${index + 1} of ${panes.length} ${phase}`);
  };

  // Runs ONE pane against the shared prompt: stagger → stream → done/error.
  // Never throws — the outcome (text or error) is the return value, so the
  // fan-out's Promise.all always settles and partial failures still record.
  const runPane = async (index: number, promptText: string, staggerMs: number): Promise<PaneResult> => {
    const pane = panes[index];
    const label = paneLabel(pane, index);

    controllersRef.current[index]?.abort();
    const controller = new AbortController();
    controllersRef.current[index] = controller;

    setRun(index, { status: 'streaming', text: '', error: null });
    await wait(staggerMs, controller.signal);
    if (controller.signal.aborted) return { label, text: '' };
    announce(index, 'streaming');

    let acc = '';
    try {
      await streamChat(
        [{ role: 'user', content: buildPaneUserContent(pane, promptText) }],
        // Rigged panes carry their hidden per-pane system prompt here.
        { model: DEFAULT_MODEL_ID, system: pane.systemPromptMd, signal: controller.signal },
        (chunk) => {
          acc += chunk;
          setRun(index, { status: 'streaming', text: acc, error: null });
        },
      );
      // An abort (unmount / superseded run) resolves cleanly — don't stamp a
      // terminal state (or a resultsRef entry) over whatever superseded this run.
      if (controller.signal.aborted) return { label, text: acc };
      const result: PaneResult = { label, text: acc };
      resultsRef.current[index] = result;
      setRun(index, { status: 'done', text: acc, error: null });
      announce(index, 'complete');
      return result;
    } catch (err) {
      if (controller.signal.aborted) return { label, text: acc };
      const message = err instanceof Error ? err.message : 'Request to Claude failed.';
      const result: PaneResult = { label, error: message };
      resultsRef.current[index] = result;
      setRun(index, { status: 'error', text: acc, error: message });
      announce(index, 'failed');
      return result;
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const submission = ++submissionRef.current; // FIX B-2: this run's generation
    const submittedPrompt = prompt.trim();
    activePromptRef.current = submittedPrompt;
    setSaveError(null);
    resultsRef.current = []; // a fresh run owns the whole results slate

    // Fan out one streamChat call per pane, staggered ~200ms apart. A
    // resubmission replaces every pane's output in place (runPane resets each
    // pane before it streams).
    const settled = await Promise.all(
      panes.map((_, i) => runPane(i, submittedPrompt, i * PANE_STAGGER_MS)),
    );
    // Unmounted mid-stream, or a newer submission superseded this one — the
    // newer run owns all state and recording from here on.
    if (!mountedRef.current || submission !== submissionRef.current) return;

    // Record from resultsRef — kept current by pane Retries (FIX B-1) — with
    // the fan-out's own settled value as a fallback for any pane that never
    // reached a terminal write (belt-and-braces; aborted panes only).
    const results = panes.map((_, i) => resultsRef.current[i] ?? settled[i]);

    // EVERY submit records — including a partial-failure run (a pane's error
    // is part of the transcript). Each resubmit appends a NEW row (history
    // survives server-side); Retry alone doesn't re-record.
    if (!user) {
      setSaveError('Sign in to record your comparison.');
      return;
    }
    try {
      await recordLabSubmission(user.id, {
        labId,
        transcript: { kind: 'chat-compare', prompt: submittedPrompt, panes: results },
        status: 'submitted',
      });
    } catch (err) {
      // A late failure from a superseded submission must not clobber the newer
      // run's state (FIX B-2).
      if (mountedRef.current && submission === submissionRef.current) {
        setSaveError(err instanceof Error ? err.message : 'Could not record your submission.');
      }
    }
  };

  // Pane-local Retry: re-runs ONLY this pane (no stagger — it's a single call)
  // against the already-submitted prompt; siblings' output stays untouched.
  const handleRetry = (index: number) => {
    void runPane(index, activePromptRef.current, 0);
  };

  return (
    <div className="bg-white border-2 border-nava-plum/20 rounded-3xl p-8 shadow-sm space-y-6" id="chat-compare">
      <div className="flex items-center gap-3 border-b border-nava-plum/20 pb-6">
        <div className="w-10 h-10 bg-nava-plum/10 rounded-xl flex items-center justify-center text-nava-plum">
          <Columns3 className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold">{title}</h3>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>

      {config.introMd && (
        <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{config.introMd}</ReactMarkdown>
        </div>
      )}

      {/* Suggested prompts: chips that FILL the input — never auto-submit. */}
      {config.suggestedPrompts?.length ? (
        <div className="space-y-2">
          <div className="text-[11px] font-black uppercase tracking-widest text-gray-500">
            Try one of these
          </div>
          <div className="flex flex-wrap gap-2">
            {config.suggestedPrompts.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setPrompt(s)}
                className="text-xs font-semibold bg-white border border-nava-plum/20 text-nava-plum rounded-full px-3 py-1.5 hover:border-nava-plum hover:bg-nava-plum/5 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* The shared prompt — one input fans out to every pane. */}
      <div className="space-y-3">
        <label htmlFor="chat-compare-input" className="text-[11px] font-black uppercase tracking-widest text-nava-plum">
          Your prompt — every pane gets the same one
        </label>
        <PiiNotice />
        <textarea
          id="chat-compare-input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          aria-label="Your prompt for every pane"
          placeholder="Ask one question — each pane answers it side by side…"
          className="w-full rounded-2xl border-2 border-gray-100 focus:border-nava-green focus:outline-none p-4 text-sm text-gray-700 leading-relaxed resize-y transition-colors"
        />
        <div className="flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex items-center gap-2 px-6 py-2.5 bg-nava-green text-white rounded-xl font-bold text-sm shadow-lg shadow-nava-green/20 hover:bg-nava-plum disabled:opacity-50 transition-all active:scale-95"
          >
            {anyStreaming ? (
              <>
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                  <Sparkles className="w-4 h-4" />
                </motion.div>
                Claude is answering…
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                {hasRun ? 'Ask again' : 'Send prompt'}
              </>
            )}
          </button>
        </div>
        {saveError && <p role="alert" className="text-xs text-red-600 font-medium">{saveError}</p>}
      </div>

      {/* ONE polite live region announcing pane lifecycle — a single announcer,
          not per-pane competing regions (W2-8/W2-9 posture). */}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {/* The panes. Pre-submit: labeled empty placeholders. Single column below
          desktop width. */}
      <div className={GRID_BY_COUNT[panes.length] ?? GRID_BY_COUNT[4]}>
        {panes.map((pane, i) => {
          const run = runs[i] ?? IDLE_RUN;
          const label = paneLabel(pane, i);
          return (
            <div key={i} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-2 min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-bold text-gray-600">
                <Bot className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                {label}
              </div>
              {run.status === 'idle' && (
                <p className="text-sm text-gray-500 italic">Send a prompt to see this response.</p>
              )}
              {run.status === 'streaming' && (
                <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap" aria-busy="true">
                  {run.text || <span className="text-gray-500 italic">Waiting for Claude…</span>}
                </div>
              )}
              {run.status === 'done' && (
                <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{run.text}</div>
              )}
              {run.status === 'error' && (
                <div className="space-y-2">
                  <p role="alert" className="text-xs text-red-600 font-medium">
                    This pane couldn’t answer: {run.error}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleRetry(i)}
                    aria-label={`Retry ${label}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg font-bold text-xs hover:border-nava-green hover:text-nava-green transition-colors active:scale-95"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    Retry
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Reflection prompts — static discussion copy, not captured. */}
      {config.reflectionMd && (
        <div className="bg-nava-plum/5 border-2 border-nava-plum/20 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-nava-plum">
            <MessageCircleQuestion className="w-3.5 h-3.5" aria-hidden="true" />
            Talk it through
          </div>
          <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{config.reflectionMd}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

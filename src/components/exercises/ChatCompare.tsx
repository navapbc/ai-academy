import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Columns3,
  Send,
  Sparkles,
  RotateCcw,
  Bot,
  BookOpen,
  ChevronDown,
  MessageCircleQuestion,
  Paperclip,
} from 'lucide-react';
import type {
  ChatCompareConfig,
  ChatCompareExample,
  ChatComparePane,
  ChatCompareSuggestedPrompt,
} from '../../types';
import { useAuth } from '../../lib/auth';
import { streamChat } from '../../lib/llm';
import { DEFAULT_MODEL_ID } from '../../lib/models';
import { recordLabSubmission } from '../../lib/progress';
import PiiNotice from '../PiiNotice';

// The chat-compare exercise (cohort-restructure U6): 1–4 side-by-side LIVE
// Claude panes. Each pane can carry a hidden system prompt ("rigged" — sent via
// StreamOptions.system) and/or a grounding source ("grounded" — prepended to
// the learner's message content, mirroring how VoiceEdit/PromptEval build
// prompts). One parameterized kind powers Week 1 (3-pane rigged; 1-pane
// confidently-wrong) and Week 2 (numbered prompt variants of one task).
// UNGRADED: every submit — including a partial-failure run — records a
// lab_submissions row (`transcript.kind:'chat-compare'`) but never gates
// completion (participation completion is U9) — structurally enforced by Props
// being { config, labId } only (no onComplete, no useLabGrading). Failure spec:
// pane-local error + Retry that re-runs only that pane while siblings' output
// stays; every pane runs on its own AbortController, all aborted on unmount
// (LLM-05, mirroring IterationLab's cleanup); pane starts are staggered ~200ms
// as rate-limit courtesy.
//
// L&D content pass (Sarah Grayvin `[6]`–`[15]`, plan items W5.2/W5.3). The
// component was EXTENDED IN PLACE rather than cloned into a new lab kind
// (human Decision 6) — duplicating the streaming abort/generation-counter logic
// would risk reintroducing the fixed B-1/B-2 bugs. Everything below is gated on
// new OPTIONAL config, so Week 1's two configs render byte-identically:
//
// - `promptMode: 'shared'` (the DEFAULT) is exactly the old behavior: one
//   textarea fanned to every pane, suggested prompts as chips that FILL it.
// - `promptMode: 'per-pane'` (`[6]`) gives each pane its OWN editable textarea,
//   so a pod can alter one prompt as an experiment while the other stays put.
//   Suggested prompts become a NUMBERED list (`[8]`) whose per-pane "Use in
//   Pane N" buttons fill one pane's box; the pane heading then names that
//   prompt's number (`[7]`).
// - Grounding (`[9]`, human Decision 6b) is an explicit per-pane "attach the
//   source material" CHECKBOX over one authored `groundingSourceMd`. Picking a
//   numbered prompt SETS that checkbox from the prompt's `usesSource` flag; the
//   learner can then override it. There is deliberately no marker-phrase
//   sniffing of typed prompts and no always-attach-then-tell-it-to-ignore: the
//   grounded-vs-ungrounded contrast has to be reproducible in front of a live
//   cohort. `[9]`'s literal ask (let Claude decide to pull the bulletin in) is
//   NOT buildable — src/lib/llm.ts has no tool or retrieval channel.
// - `examples[]` (`[15]`, human Decision 5) renders a TAB STRIP of examples
//   inside this one exercise, because a module row carries exactly one
//   lab_config_json. The active tab's content fields override the config-level
//   ones; switching tabs aborts in-flight streams and clears the panes, since
//   outputs belong to the example that produced them.
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

/** The content fields an `examples[]` entry overrides on the config. */
type ChatCompareContent = Pick<
  ChatCompareExample,
  'introMd' | 'sourceIntroMd' | 'groundingSourceMd' | 'suggestedPrompts' | 'reflectionMd'
>;

/** A suggested prompt in its normalized object form. */
export interface NormalizedPrompt {
  text: string;
  usesSource: boolean;
  systemPromptMd?: string;
}

/**
 * Widens the `string | { text, … }` union to one object shape (W5.2). A bare
 * string is an ungrounded, unrigged prompt — which is exactly what Week 1's
 * existing chip arrays mean.
 */
export function normalizeSuggestedPrompts(
  prompts: ChatCompareSuggestedPrompt[] | undefined,
): NormalizedPrompt[] {
  return (prompts ?? []).map((p) =>
    typeof p === 'string'
      ? { text: p, usesSource: false }
      : { text: p.text, usesSource: p.usesSource ?? false, systemPromptMd: p.systemPromptMd },
  );
}

/**
 * Resolves the ACTIVE content: an `examples[]` entry is an override bundle, so
 * any field it declares wins over the config-level one. With no `examples` the
 * config is itself the single implicit example.
 */
export function resolveContent(config: ChatCompareConfig, exampleIndex: number): ChatCompareContent {
  const example = config.examples?.[exampleIndex];
  if (!example) return config;
  return {
    introMd: example.introMd ?? config.introMd,
    sourceIntroMd: example.sourceIntroMd ?? config.sourceIntroMd,
    groundingSourceMd: example.groundingSourceMd ?? config.groundingSourceMd,
    suggestedPrompts: example.suggestedPrompts ?? config.suggestedPrompts,
    reflectionMd: example.reflectionMd ?? config.reflectionMd,
  };
}

/**
 * The visible pane heading. Base = the config label or a positional fallback;
 * `[7]` appends the NUMBER of the prompt the learner picked for this pane (or
 * "Your prompt" once they've typed their own), so the heading always names what
 * that pane was actually asked.
 */
function paneLabel(
  pane: ChatComparePane,
  index: number,
  promptIdx: number | null | undefined,
  hasPrompt: boolean,
): string {
  const base = pane.label ?? `Response ${index + 1}`;
  if (promptIdx != null) return `${base}: Prompt #${promptIdx + 1}`;
  if (hasPrompt) return `${base}: Your prompt`;
  return base;
}

/**
 * Builds the pane's user message: a grounded pane gets its resolved source
 * PREPENDED to its prompt (the same content-assembly posture as VoiceEdit's
 * buildDraftPrompt / PromptEval's buildCasePrompt). The source is decided by
 * the CALLER (pane checkbox over `groundingSourceMd`, else the pane's legacy
 * unconditional `sourceMd`) rather than read off the pane, which is what makes
 * `[9]`'s per-prompt grounding possible. Kept small + pure so tests pin exactly
 * what each pane was asked.
 */
export function buildPaneUserContent(source: string | undefined, prompt: string): string {
  if (!source) return prompt;
  return `Use the following source material to answer.\n\nSource:\n${source}\n\n---\n\n${prompt}`;
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

/**
 * The recorded shape of one pane's outcome: streamed text, or its error, plus
 * WHAT that pane was asked (W5.3 — the run is no longer describable by one
 * shared prompt). `promptIdx` is 1-based to match the numbered chips the
 * learner saw; null means they typed their own.
 */
type PaneOutcome = { text: string } | { error: string };
type PaneResult = PaneOutcome & {
  label: string;
  promptText: string;
  promptIdx: number | null;
  groundingUsed: boolean;
};

export default function ChatCompare({ config, labId }: Props) {
  const { user } = useAuth();
  const { panes } = config;
  const perPane = config.promptMode === 'per-pane';
  const examples = config.examples;
  const title = config.title ?? 'Compare Claude side by side';
  const subtitle =
    config.subtitle ??
    (perPane
      ? 'Give each pane its own prompt, then read the responses against each other — this doesn’t affect your module completion.'
      : 'One prompt, every pane. Read the responses against each other — this doesn’t affect your module completion.');

  // The active tab (`[15]`). Index 0 when there are no examples.
  const [exampleIndex, setExampleIndex] = useState(0);
  const content = resolveContent(config, exampleIndex);
  const suggested = useMemo(
    () => normalizeSuggestedPrompts(content.suggestedPrompts),
    [content.suggestedPrompts],
  );
  const groundingSourceMd = content.groundingSourceMd;

  // Per-pane state. In 'shared' mode index 0 is the single input and every pane
  // mirrors it, so the old single-textarea path stays byte-identical.
  const [prompts, setPrompts] = useState<string[]>(() => panes.map(() => ''));
  // Which numbered prompt each pane is currently showing (null = learner's own).
  const [selectedIdx, setSelectedIdx] = useState<(number | null)[]>(() => panes.map(() => null));
  // `[9]` / Decision 6b: the explicit per-pane "attach the source material" box.
  const [attached, setAttached] = useState<boolean[]>(() => panes.map(() => false));
  const [sourceOpen, setSourceOpen] = useState(false);
  const [runs, setRuns] = useState<PaneRun[]>(() => panes.map(() => IDLE_RUN));
  // The ONE polite live region's current message ("Response 2 of 3 streaming /
  // complete / failed") — a single announcer, not per-pane competing regions
  // (the W2-8/W2-9 posture, cf. PairedCalibration's phase announcer).
  const [announcement, setAnnouncement] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  // The selection each pane's VISIBLE output belongs to — frozen at submit so a
  // heading can never change mid-stream while the learner picks another chip.
  const [submittedIdx, setSubmittedIdx] = useState<(number | null)[]>(() => panes.map(() => null));

  // Every pane streams on its OWN controller so a pane-local Retry can cancel
  // and re-run just that pane; unmount aborts them all (LLM-05). mountedRef
  // gates the post-fan-out submission write + state updates so an unmount
  // mid-stream leaves nothing behind.
  const controllersRef = useRef<(AbortController | null)[]>([]);
  const mountedRef = useRef(true);
  // What the visible outputs were ASKED — a per-pane Retry must re-ask the
  // submitted prompt (and its grounding) even if the learner has since edited
  // that textarea or toggled its checkbox.
  const activeAskRef = useRef<
    { prompt: string; source: string | undefined; system: string | undefined; promptIdx: number | null }[]
  >([]);
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
  // Every pane that will actually be asked needs a prompt. In 'shared' mode
  // that's the single input; in 'per-pane' mode it's all of them.
  const promptFor = (i: number) => (perPane ? (prompts[i] ?? '') : (prompts[0] ?? ''));
  const canSubmit =
    !anyStreaming && panes.every((_, i) => promptFor(i).trim().length > 0);

  const setRun = (index: number, run: PaneRun) => {
    if (!mountedRef.current) return;
    setRuns((prev) => prev.map((r, i) => (i === index ? run : r)));
  };

  const announce = (index: number, phase: 'streaming' | 'complete' | 'failed') => {
    if (!mountedRef.current) return;
    setAnnouncement(`Response ${index + 1} of ${panes.length} ${phase}`);
  };

  /** Edits one pane's textarea. Typing clears its numbered-prompt selection so
   *  the heading never claims a prompt the learner has since rewritten. */
  const editPrompt = (index: number, value: string) => {
    setPrompts((prev) => prev.map((p, i) => (i === index ? value : p)));
    setSelectedIdx((prev) => prev.map((s, i) => (i === index ? null : s)));
  };

  /** Applies numbered prompt `p` to pane `index`: fills the box, remembers the
   *  number for the heading (`[7]`), and SETS the attach box from `usesSource`
   *  (`[9]`) — which the learner may then override. Never auto-submits. */
  const applyPrompt = (index: number, p: NormalizedPrompt, promptIdx: number) => {
    setPrompts((prev) => prev.map((v, i) => (i === index ? p.text : v)));
    setSelectedIdx((prev) => prev.map((v, i) => (i === index ? promptIdx : v)));
    if (groundingSourceMd) {
      setAttached((prev) => prev.map((v, i) => (i === index ? p.usesSource : v)));
    }
  };

  const toggleAttached = (index: number) => {
    setAttached((prev) => prev.map((v, i) => (i === index ? !v : v)));
  };

  /** The grounding actually sent for pane `i`: the attachable source when that
   *  pane's box is checked, else the pane's legacy unconditional `sourceMd`.
   *  The checkbox only exists in 'per-pane' mode, so 'shared' resolves exactly
   *  as it always did. */
  const sourceFor = (i: number): string | undefined =>
    perPane && groundingSourceMd && attached[i] ? groundingSourceMd : panes[i].sourceMd;

  /** The system prompt actually sent for pane `i`: a selected numbered prompt's
   *  rig wins over the pane's own (that rig is what makes `[10]`–`[13]`'s
   *  authored weaknesses reproducible rather than probabilistic). */
  const systemFor = (i: number): string | undefined => {
    const idx = perPane ? selectedIdx[i] : selectedIdx[0];
    const rig = idx != null ? suggested[idx]?.systemPromptMd : undefined;
    return rig ?? panes[i].systemPromptMd;
  };

  /** The heading for pane `i`. Only 'per-pane' mode decorates it with the
   *  selected prompt number (`[7]`); 'shared' keeps the original bare label. */
  const headingFor = (i: number, promptIdx: number | null, hasPrompt: boolean): string =>
    perPane
      ? paneLabel(panes[i], i, promptIdx, hasPrompt)
      : paneLabel(panes[i], i, null, false);

  // Switching examples starts a clean slate: abort in-flight streams and clear
  // every pane, since the outputs belong to the example that produced them.
  const selectExample = (next: number) => {
    if (next === exampleIndex) return;
    submissionRef.current++;
    controllersRef.current.forEach((c) => c?.abort());
    controllersRef.current = [];
    resultsRef.current = [];
    activeAskRef.current = [];
    setExampleIndex(next);
    setPrompts(panes.map(() => ''));
    setSelectedIdx(panes.map(() => null));
    setSubmittedIdx(panes.map(() => null));
    setAttached(panes.map(() => false));
    setRuns(panes.map(() => IDLE_RUN));
    setSourceOpen(false);
    setAnnouncement('');
    setSaveError(null);
  };

  // Runs ONE pane against ITS ask: stagger → stream → done/error. Never throws
  // — the outcome (text or error) is the return value, so the fan-out's
  // Promise.all always settles and partial failures still record.
  const runPane = async (index: number, staggerMs: number): Promise<PaneResult> => {
    const ask = activeAskRef.current[index];
    const label = headingFor(index, ask?.promptIdx ?? null, Boolean(ask?.prompt));
    const meta = {
      label,
      promptText: ask?.prompt ?? '',
      promptIdx: ask?.promptIdx != null ? ask.promptIdx + 1 : null,
      groundingUsed: Boolean(ask?.source),
    };

    controllersRef.current[index]?.abort();
    const controller = new AbortController();
    controllersRef.current[index] = controller;

    setRun(index, { status: 'streaming', text: '', error: null });
    await wait(staggerMs, controller.signal);
    if (controller.signal.aborted) return { ...meta, text: '' };
    announce(index, 'streaming');

    let acc = '';
    try {
      await streamChat(
        [{ role: 'user', content: buildPaneUserContent(ask?.source, ask?.prompt ?? '') }],
        // Rigged panes (or rigged prompts) carry their hidden system prompt here.
        { model: DEFAULT_MODEL_ID, system: ask?.system, signal: controller.signal },
        (chunk) => {
          acc += chunk;
          setRun(index, { status: 'streaming', text: acc, error: null });
        },
      );
      // An abort (unmount / superseded run) resolves cleanly — don't stamp a
      // terminal state (or a resultsRef entry) over whatever superseded this run.
      if (controller.signal.aborted) return { ...meta, text: acc };
      const result: PaneResult = { ...meta, text: acc };
      resultsRef.current[index] = result;
      setRun(index, { status: 'done', text: acc, error: null });
      announce(index, 'complete');
      return result;
    } catch (err) {
      if (controller.signal.aborted) return { ...meta, text: acc };
      const message = err instanceof Error ? err.message : 'Request to Claude failed.';
      const result: PaneResult = { ...meta, error: message };
      resultsRef.current[index] = result;
      setRun(index, { status: 'error', text: acc, error: message });
      announce(index, 'failed');
      return result;
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const submission = ++submissionRef.current; // FIX B-2: this run's generation
    // Freeze WHAT each pane is asked, so a later chip click or checkbox toggle
    // can't retroactively change a running pane's heading, grounding, or rig.
    const frozenIdx = panes.map((_, i) => (perPane ? (selectedIdx[i] ?? null) : (selectedIdx[0] ?? null)));
    activeAskRef.current = panes.map((_, i) => ({
      prompt: promptFor(i).trim(),
      source: sourceFor(i),
      system: systemFor(i),
      promptIdx: perPane ? frozenIdx[i] : null,
    }));
    setSubmittedIdx(frozenIdx);
    setSaveError(null);
    resultsRef.current = []; // a fresh run owns the whole results slate

    // Fan out one streamChat call per pane, staggered ~200ms apart. A
    // resubmission replaces every pane's output in place (runPane resets each
    // pane before it streams).
    const settled = await Promise.all(panes.map((_, i) => runPane(i, i * PANE_STAGGER_MS)));
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
        transcript: {
          kind: 'chat-compare',
          promptMode: perPane ? 'per-pane' : 'shared',
          // 'shared' mode keeps the single top-level prompt it always recorded.
          ...(perPane ? {} : { prompt: promptFor(0).trim() }),
          ...(examples?.[exampleIndex] ? { exampleId: examples[exampleIndex].id } : {}),
          panes: results,
        },
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
  // against its already-submitted ask; siblings' output stays untouched.
  const handleRetry = (index: number) => {
    void runPane(index, 0);
  };

  const promptListId = 'chat-compare-prompts';

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

      {/* Example tab strip (`[15]`) — only when the config carries examples. */}
      {examples?.length ? (
        <div role="tablist" aria-label="Examples" className="flex flex-wrap gap-2 border-b border-gray-100 pb-4">
          {examples.map((ex, i) => (
            <button
              key={ex.id}
              type="button"
              role="tab"
              id={`chat-compare-tab-${ex.id}`}
              aria-selected={i === exampleIndex}
              aria-controls="chat-compare-example-panel"
              onClick={() => selectExample(i)}
              className={`text-xs font-bold rounded-xl px-4 py-2 border-2 transition-colors ${
                i === exampleIndex
                  ? 'bg-nava-plum text-white border-nava-plum'
                  : 'bg-white text-nava-plum border-nava-plum/20 hover:border-nava-plum'
              }`}
            >
              {ex.label}
            </button>
          ))}
        </div>
      ) : null}

      <div
        id="chat-compare-example-panel"
        role={examples?.length ? 'tabpanel' : undefined}
        aria-labelledby={
          examples?.length ? `chat-compare-tab-${examples[exampleIndex].id}` : undefined
        }
        className="space-y-6"
      >
        {content.introMd && (
          <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content.introMd}</ReactMarkdown>
          </div>
        )}

        {/* The ONE authored copy of the grounding source: read it here, attach
            it per pane below. Collapsed by default so the prompts stay above
            the fold — it is long, and `[9]` asked for it not to dominate. */}
        {groundingSourceMd && (
          <div className="border-2 border-nava-plum/15 rounded-2xl overflow-hidden">
            {content.sourceIntroMd && (
              <div className="px-5 pt-4 text-xs text-gray-600 leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content.sourceIntroMd}</ReactMarkdown>
              </div>
            )}
            <button
              type="button"
              onClick={() => setSourceOpen((o) => !o)}
              aria-expanded={sourceOpen}
              className="w-full flex items-center justify-between gap-2 px-5 py-3 text-left text-xs font-black uppercase tracking-widest text-nava-plum hover:bg-nava-plum/5 transition-colors"
            >
              <span className="flex items-center gap-2">
                <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                Source material
              </span>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${sourceOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
            {sourceOpen && (
              <div className="px-5 pb-5 prose prose-sm max-w-none text-gray-700 leading-relaxed border-t border-nava-plum/10 pt-4">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{groundingSourceMd}</ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {/* Suggested prompts. 'per-pane': a NUMBERED list (`[8]`) whose buttons
            fill ONE pane's box. 'shared': the original flex-wrap chips. Neither
            auto-submits, and the ordinal is a rendered badge — never baked into
            the prompt string, which would end up in Claude's transcript. */}
        {suggested.length ? (
          perPane ? (
            <div className="space-y-2">
              <div id={promptListId} className="text-[11px] font-black uppercase tracking-widest text-gray-500">
                Suggested prompts — send any two side by side
              </div>
              <ol aria-labelledby={promptListId} className="space-y-2">
                {suggested.map((p, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 rounded-2xl border border-nava-plum/20 bg-white p-3"
                  >
                    <span
                      aria-hidden="true"
                      className="shrink-0 w-6 h-6 rounded-full bg-nava-plum/10 text-nava-plum text-xs font-black flex items-center justify-center"
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 space-y-2">
                      <p className="text-sm text-gray-700 leading-relaxed">{p.text}</p>
                      <div className="flex flex-wrap gap-2">
                        {panes.map((pane, paneIdx) => (
                          <button
                            key={paneIdx}
                            type="button"
                            onClick={() => applyPrompt(paneIdx, p, i)}
                            className="text-xs font-semibold bg-white border border-nava-plum/20 text-nava-plum rounded-full px-3 py-1 hover:border-nava-plum hover:bg-nava-plum/5 transition-colors"
                          >
                            Use prompt {i + 1} in {pane.label ?? `Response ${paneIdx + 1}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-[11px] font-black uppercase tracking-widest text-gray-500">
                Try one of these
              </div>
              <div className="flex flex-wrap gap-2">
                {suggested.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => applyPrompt(0, s, i)}
                    className="text-xs font-semibold bg-white border border-nava-plum/20 text-nava-plum rounded-full px-3 py-1.5 hover:border-nava-plum hover:bg-nava-plum/5 transition-colors"
                  >
                    {s.text}
                  </button>
                ))}
              </div>
            </div>
          )
        ) : null}

        {/* The prompt input(s). 'shared': one textarea for every pane (byte
            identical to the pre-content-pass component). 'per-pane': one
            SEPARATELY EDITABLE box per pane (`[6]`) with its own grounding
            checkbox (`[9]`). */}
        <div className="space-y-3">
          {perPane ? (
            <>
            <PiiNotice />
            <div className={GRID_BY_COUNT[panes.length] ?? GRID_BY_COUNT[4]}>
              {panes.map((pane, i) => {
                const base = pane.label ?? `Response ${i + 1}`;
                const selected = selectedIdx[i];
                return (
                  <div key={i} className="space-y-2 min-w-0">
                    <label
                      htmlFor={`chat-compare-input-${i}`}
                      className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-nava-plum"
                    >
                      {base} prompt
                      {selected != null && (
                        <span className="normal-case tracking-normal font-bold text-gray-500">
                          (prompt #{selected + 1})
                        </span>
                      )}
                    </label>
                    <textarea
                      id={`chat-compare-input-${i}`}
                      value={prompts[i] ?? ''}
                      onChange={(e) => editPrompt(i, e.target.value)}
                      rows={5}
                      aria-label={`Prompt for ${base}`}
                      placeholder="Pick a suggested prompt above, or write your own…"
                      className="w-full rounded-2xl border-2 border-gray-100 focus:border-nava-plum focus:outline-none p-4 text-sm text-gray-700 leading-relaxed resize-y transition-colors"
                    />
                    {groundingSourceMd && (
                      <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={attached[i] ?? false}
                          onChange={() => toggleAttached(i)}
                          aria-label={`Attach the source material to ${base}`}
                          className="mt-0.5 w-4 h-4 accent-nava-plum"
                        />
                        <span className="flex items-center gap-1.5">
                          <Paperclip className="w-3 h-3 shrink-0" aria-hidden="true" />
                          Attach the source material to this prompt
                        </span>
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
            </>
          ) : (
            <>
              <label
                htmlFor="chat-compare-input"
                className="text-[11px] font-black uppercase tracking-widest text-nava-plum"
              >
                Your prompt — every pane gets the same one
              </label>
              <PiiNotice />
              <textarea
                id="chat-compare-input"
                value={prompts[0] ?? ''}
                onChange={(e) => editPrompt(0, e.target.value)}
                rows={3}
                aria-label="Your prompt for every pane"
                placeholder="Ask one question — each pane answers it side by side…"
                className="w-full rounded-2xl border-2 border-gray-100 focus:border-nava-plum focus:outline-none p-4 text-sm text-gray-700 leading-relaxed resize-y transition-colors"
              />
            </>
          )}
          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex items-center gap-2 px-6 py-2.5 bg-nava-green text-white rounded-xl font-bold text-sm shadow-lg shadow-nava-green/20 hover:bg-nava-green/90 disabled:opacity-50 transition-all active:scale-95"
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
                  {hasRun ? 'Ask again' : perPane ? 'Send prompts' : 'Send prompt'}
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
          {panes.map((_pane, i) => {
            const run = runs[i] ?? IDLE_RUN;
            // Idle panes show the LIVE selection (so a chip click is visible
            // immediately); once a pane has run, the heading names the ask its
            // output actually belongs to.
            const shownIdx =
              run.status === 'idle'
                ? (perPane ? selectedIdx[i] : selectedIdx[0]) ?? null
                : submittedIdx[i] ?? null;
            const hasPrompt = promptFor(i).trim().length > 0;
            const label = headingFor(i, shownIdx, hasPrompt);
            const retryLabel = headingFor(i, submittedIdx[i] ?? null, true);
            const grounded =
              run.status === 'idle'
                ? Boolean(sourceFor(i))
                : Boolean(activeAskRef.current[i]?.source);
            return (
              <div key={i} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-2 min-w-0">
                <div className="flex items-center gap-2 text-[11px] font-bold text-gray-600">
                  <Bot className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  {label}
                </div>
                {/* An honest per-pane grounding indicator — before this pass the
                    source was attached silently and never shown at all. */}
                {groundingSourceMd && grounded && (
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-nava-plum">
                    <Paperclip className="w-3 h-3 shrink-0" aria-hidden="true" />
                    Source material attached
                  </div>
                )}
                {run.status === 'idle' && (
                  <p className="text-sm text-gray-500 italic">Send a prompt to see this response.</p>
                )}
                {run.status === 'streaming' && (
                  <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed" aria-busy="true">
                    {run.text ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{run.text}</ReactMarkdown>
                    ) : (
                      <span className="text-gray-500 italic">Waiting for Claude…</span>
                    )}
                  </div>
                )}
                {run.status === 'done' && (
                  <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{run.text}</ReactMarkdown>
                  </div>
                )}
                {run.status === 'error' && (
                  <div className="space-y-2">
                    <p role="alert" className="text-xs text-red-600 font-medium">
                      This pane couldn’t answer: {run.error}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleRetry(i)}
                      aria-label={`Retry ${retryLabel}`}
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
        {content.reflectionMd && (
          <div className="bg-nava-plum/5 border-2 border-nava-plum/20 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-nava-plum">
              <MessageCircleQuestion className="w-3.5 h-3.5" aria-hidden="true" />
              Talk it through
            </div>
            <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content.reflectionMd}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

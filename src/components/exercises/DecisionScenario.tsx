import { useState } from 'react';
import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Footprints,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Flag,
  RotateCcw,
  Sparkles,
  MessageCircleQuestion,
} from 'lucide-react';
import type { DecisionCheckpoint, DecisionScenarioConfig } from '../../types';
import { useAuth } from '../../lib/auth';
import { recordLabSubmission } from '../../lib/progress';

// The decision-scenario exercise (cohort-restructure U7): "Walk the Workflow" —
// a LINEAR checkpoint scenario (DELEGATE → GROUND → SCOPE → VERIFY; no
// branching graph in v1). Flow: introMd → checkpoints strictly in order →
// closingMd. Single-select checkpoints reveal the chosen option's authored
// feedback immediately; multi-select checkpoints reveal feedback for EVERY
// checked option via a "Check answer" button. Either way the choice is then
// immutable — Previous re-reads completed checkpoints (locked choice + revealed
// feedback) but never re-answers. Finishing records ONE lab_submissions row
// (`transcript.kind:'decision-scenario'`, choices as option indexes per
// checkpoint) and then shows the full read-through: every checkpoint with its
// locked choice and feedback, read-only. UNGRADED: the submission never gates
// completion (participation completion lands in U9) — structurally enforced by
// Props being { config, labId } only (no onComplete, no useLabGrading).
// State is in-memory only: a refresh mid-scenario restarts the walk (documented
// v1 behavior — the recorded submission on finish is the durable artifact).
interface Props {
  config: DecisionScenarioConfig;
  labId: string;
}

/** Per-checkpoint play state: what's checked, and whether feedback is revealed. */
interface CheckpointState {
  selected: number[];
  /** Once true the choice is immutable and Continue unlocks. */
  revealed: boolean;
}

/** The uppercase workflow-phase label (style cue from the program doc). */
function phaseLabel(cp: DecisionCheckpoint): string {
  return cp.phase.toUpperCase();
}

export default function DecisionScenario({ config, labId }: Props) {
  const { user } = useAuth();
  const { checkpoints } = config;
  const total = checkpoints.length;
  const title = config.title ?? 'Walk the workflow';
  const subtitle =
    config.subtitle ??
    'A choose-your-response story. Your choices are recorded for discussion — there are no wrong answers and this doesn’t affect your module completion.';

  // step -1 = intro screen; 0..total-1 = that checkpoint. `finished` supersedes
  // step and shows the closing + full read-through.
  const [step, setStep] = useState(-1);
  const [finished, setFinished] = useState(false);
  const [answers, setAnswers] = useState<CheckpointState[]>(() =>
    checkpoints.map(() => ({ selected: [], revealed: false })),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const setAnswer = (index: number, next: CheckpointState) =>
    setAnswers((prev) => prev.map((a, i) => (i === index ? next : a)));

  // Single-select: choosing reveals that option's feedback and locks the choice.
  const choose = (index: number, optionIndex: number) => {
    if (answers[index].revealed) return; // immutable once revealed
    setAnswer(index, { selected: [optionIndex], revealed: true });
  };

  // Multi-select: toggle freely until "Check answer" reveals and locks.
  const toggle = (index: number, optionIndex: number) => {
    if (answers[index].revealed) return;
    const current = answers[index].selected;
    const next = current.includes(optionIndex)
      ? current.filter((i) => i !== optionIndex)
      : [...current, optionIndex];
    setAnswer(index, { selected: next, revealed: false });
  };

  const checkAnswer = (index: number) => {
    const a = answers[index];
    if (a.revealed || a.selected.length === 0) return;
    setAnswer(index, { ...a, revealed: true });
  };

  // ONE submission on finish; Retry after a failure re-records the same choices
  // (the finished state and every choice are kept — cf. FailureLog's careful
  // save pattern, not fire-and-forget).
  const recordRun = async () => {
    if (saving || saved) return;
    setSaveError(null);
    if (!user) {
      setSaveError('Sign in to record your choices so a Champion can review them.');
      return;
    }
    setSaving(true);
    try {
      await recordLabSubmission(user.id, {
        labId,
        transcript: {
          kind: 'decision-scenario',
          choices: checkpoints.map((cp, i) => ({
            checkpointId: cp.id,
            selected: [...answers[i].selected].sort((a, b) => a - b),
          })),
        },
        status: 'submitted',
      });
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not record your choices.');
    } finally {
      setSaving(false);
    }
  };

  const handleContinue = () => {
    if (step < 0) {
      setStep(0);
      return;
    }
    if (!answers[step].revealed) return; // Continue is locked until feedback shows
    if (step < total - 1) {
      setStep(step + 1);
    } else {
      setFinished(true);
      void recordRun();
    }
  };

  const handlePrevious = () => {
    if (step >= 0) setStep(step - 1); // step -1 re-reads the intro
  };

  // One checkpoint card. `interactive` is false in the post-finish read-through
  // (and its feedback drops the live region — nothing new is being revealed).
  const renderCheckpoint = (cp: DecisionCheckpoint, index: number, interactive: boolean) => {
    const a = answers[index];
    const locked = a.revealed || !interactive;
    const feedback = (
      <div className="space-y-3">
        {a.revealed &&
          a.selected
            .slice()
            .sort((x, y) => x - y)
            .map((oi) => (
              <div
                key={oi}
                className="rounded-2xl border-2 border-nava-plum/20 bg-nava-plum/5 p-4 space-y-2"
              >
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-nava-plum">
                  <MessageCircleQuestion className="w-3.5 h-3.5" aria-hidden="true" />
                  Feedback — {cp.options[oi].text}
                </div>
                <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {cp.options[oi].feedbackMd}
                  </ReactMarkdown>
                </div>
              </div>
            ))}
      </div>
    );

    return (
      <div key={cp.id} className="space-y-5">
        {/* Progress indicator + uppercase phase label — plain text, so it's
            readable by screen readers as-is. */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-bold text-gray-500">
            Checkpoint {index + 1} of {total}
          </p>
          <span className="text-[11px] font-black uppercase tracking-widest bg-nava-mint text-nava-green rounded-full px-3 py-1">
            {phaseLabel(cp)}
          </span>
        </div>

        <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{cp.setupMd}</ReactMarkdown>
        </div>

        <p className="text-sm font-bold text-gray-800">{cp.prompt}</p>

        {cp.multiSelect ? (
          <div className="space-y-2">
            {cp.options.map((opt, oi) => {
              const checked = a.selected.includes(oi);
              return (
                <label
                  key={oi}
                  className={`flex items-start gap-3 rounded-2xl border-2 p-4 text-sm leading-relaxed transition-colors ${
                    checked ? 'border-nava-green bg-nava-mint/30' : 'border-gray-100 bg-white'
                  } ${locked ? 'opacity-90' : 'cursor-pointer hover:border-nava-green/50'}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(index, oi)}
                    disabled={locked}
                    className="mt-0.5 accent-nava-green"
                  />
                  <span className="text-gray-700">{opt.text}</span>
                  {locked && checked && (
                    <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold text-nava-green shrink-0">
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      Your choice
                    </span>
                  )}
                </label>
              );
            })}
            {interactive && !a.revealed && (
              <button
                type="button"
                onClick={() => checkAnswer(index)}
                disabled={a.selected.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-nava-green text-white rounded-xl font-bold text-sm shadow-lg shadow-nava-green/20 hover:bg-nava-plum disabled:opacity-50 transition-all active:scale-95"
              >
                <Check className="w-4 h-4" aria-hidden="true" />
                Check answer
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {cp.options.map((opt, oi) => {
              const chosen = a.selected.includes(oi);
              return (
                <button
                  key={oi}
                  type="button"
                  onClick={() => choose(index, oi)}
                  disabled={locked}
                  aria-pressed={chosen}
                  className={`w-full flex items-start gap-3 text-left rounded-2xl border-2 p-4 text-sm leading-relaxed transition-colors ${
                    chosen ? 'border-nava-green bg-nava-mint/30' : 'border-gray-100 bg-white'
                  } ${locked ? 'opacity-90' : 'hover:border-nava-green/50'}`}
                >
                  <span className="text-gray-700">{opt.text}</span>
                  {chosen && (
                    <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold text-nava-green shrink-0">
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      Your choice
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* During play the feedback area is a polite live region so the reveal
            is announced; keyed per checkpoint so Previous/Continue navigation
            (which mounts a fresh region with old content) is not re-announced. */}
        {interactive ? (
          <div role="status" aria-live="polite">
            {feedback}
          </div>
        ) : (
          feedback
        )}
      </div>
    );
  };

  return (
    <div
      className="bg-white border-2 border-nava-plum/20 rounded-3xl p-8 shadow-sm space-y-6"
      id="decision-scenario"
    >
      <div className="flex items-center gap-3 border-b border-nava-plum/20 pb-6">
        <div className="w-10 h-10 bg-nava-plum/10 rounded-xl flex items-center justify-center text-nava-plum">
          <Footprints className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold">{title}</h3>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>

      {finished ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {config.closingMd && (
            <div className="rounded-2xl border-2 border-nava-green/20 bg-nava-mint/40 p-6 space-y-3">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-nava-green">
                <Flag className="w-3.5 h-3.5" aria-hidden="true" />
                The story ends
              </div>
              <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{config.closingMd}</ReactMarkdown>
              </div>
            </div>
          )}

          {/* Submission status: recorded / recording / failed + Retry. A failed
              record keeps the finished state and every choice on screen. */}
          {saved && (
            <p role="status" className="flex items-center gap-2 text-sm font-bold text-nava-green">
              <CheckCircle className="w-4 h-4" aria-hidden="true" />
              Choices recorded — a Champion can review your walk-through.
            </p>
          )}
          {saving && (
            <p role="status" className="flex items-center gap-2 text-sm font-semibold text-gray-500">
              <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="inline-flex">
                <Sparkles className="w-4 h-4" aria-hidden="true" />
              </motion.span>
              Recording your choices…
            </p>
          )}
          {saveError && (
            <div className="space-y-2">
              <p role="alert" className="text-xs text-red-600 font-medium">
                {saveError}
              </p>
              <button
                type="button"
                onClick={() => void recordRun()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg font-bold text-xs hover:border-nava-green hover:text-nava-green transition-colors active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                Retry
              </button>
            </div>
          )}

          {/* The full read-through: every checkpoint with its locked choice and
              revealed feedback, read-only (the stepper is done). */}
          <div className="space-y-8 border-t border-gray-100 pt-6">
            <h4 className="text-xs font-black uppercase tracking-widest text-gray-500">
              Your walk-through
            </h4>
            {checkpoints.map((cp, i) => renderCheckpoint(cp, i, false))}
          </div>
        </motion.div>
      ) : step < 0 ? (
        <div className="space-y-6">
          <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{config.introMd}</ReactMarkdown>
          </div>
          <div className="flex justify-end border-t border-gray-100 pt-6">
            <button
              type="button"
              onClick={handleContinue}
              className="flex items-center gap-2 px-6 py-2.5 bg-nava-green text-white rounded-xl font-bold text-sm shadow-lg shadow-nava-green/20 hover:bg-nava-plum transition-all active:scale-95"
            >
              Start the scenario
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {renderCheckpoint(checkpoints[step], step, true)}

          <div className="flex items-center justify-between border-t border-gray-100 pt-6">
            <button
              type="button"
              onClick={handlePrevious}
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-xl font-bold text-sm hover:border-nava-green hover:text-nava-green transition-colors active:scale-95"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              Previous
            </button>
            <button
              type="button"
              onClick={handleContinue}
              disabled={!answers[step].revealed}
              className="flex items-center gap-2 px-6 py-2.5 bg-nava-green text-white rounded-xl font-bold text-sm shadow-lg shadow-nava-green/20 hover:bg-nava-plum disabled:opacity-50 transition-all active:scale-95"
            >
              {step < total - 1 ? 'Continue' : 'Finish'}
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

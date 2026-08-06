import { useState } from 'react';
import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  BookOpen,
  Footprints,
  Check,
  CheckCircle,
  ChevronDown,
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
// closingMd. Finishing records ONE lab_submissions row
// (`transcript.kind:'decision-scenario'`, choices as option indexes per
// checkpoint) and then shows the full read-through: every checkpoint with its
// choice and feedback, read-only. UNGRADED: the submission never gates
// completion — structurally enforced by Props being { config, labId } only (no
// onComplete, no useLabGrading). State is in-memory only: a refresh
// mid-scenario restarts the walk (documented v1 behavior — the recorded
// submission on finish is the durable artifact).
//
// L&D content pass (Sarah Grayvin `[19]`–`[28]`, plan items W3.1–W3.4). Four
// behaviors changed here; all four are SCENARIO-AGNOSTIC — no authored content
// is required and no config shape changed, so the Weeks 3-4 scenario swap can
// land later without touching this file:
//
// - W3.1 `[19]` `[20]` `[27]` — a collapsible "Scenario recap" (config.introMd)
//   rides along on EVERY checkpoint, so the premise is always one click away
//   instead of vanishing when the walk starts. Component-level open state, so
//   it stays open across checkpoints; collapsed by default so the decision
//   prompt stays above the fold.
// - W3.2 `[22]` `[24]` `[25]` `[26]` — a Submit gate on BOTH selection modes.
//   Selecting is no longer submitting: single-select now stages the pick
//   (changeable) and one shared "Submit" control reveals the feedback, the
//   same gate multi-select already had (formerly labelled "Check answer").
// - W3.3 `[23]` `[28]` — on multi-select, revealing shows the ENTIRE answer
//   key: every option's authored feedback, not only the checked ones, with the
//   learner's own picks marked. Scoped to multi-select on purpose (see below).
// - W3.4 `[21]` `[23]`–`[26]` (human Decision 7) — retake, at BOTH grains:
//   a per-checkpoint "Try again" that clears the reveal so the checkpoint can
//   be re-answered, and a whole-scenario "Start over" from the finished screen.
//   This REVERSES the previous immutable-once-revealed invariant (the old
//   header comment said "Previous re-reads completed checkpoints but never
//   re-answers"); the immutability is now scoped to "revealed answers cannot be
//   mutated silently" — `choose`/`toggle` still refuse to edit a revealed
//   answer, and only an explicit retake reopens it. The transcript records the
//   FINAL answer per checkpoint, which is what the pod stands behind.
//
// Why W3.3 does not apply to single-select: `[23]`/`[28]` are both anchored on
// the multi-select GROUND checkpoints, where "check all that apply" makes a
// partial key genuinely confusing (you cannot tell whether an unchecked option
// was a miss). On single-select the unchosen options' feedback is a separate
// pedagogical call nobody asked for, and the content pass (W2.4) delivers the
// same signal as prose inside each option's own feedback.
//
// Why retake is offered on the GROUND checkpoints too, where Sarah hedged
// "less relevant for this one": after W3.3 the whole key is already on screen,
// so a retake there is arguably answer-copying — but nothing in this exercise
// is scored (there are no `correct` flags in the data model and the submission
// never gates completion), so there is no score to inflate and nothing to
// protect. Suppressing the button on exactly the checkpoints where the learner
// most wants to revise would be an inconsistency with no payoff. Instead the
// multi-select retake carries a one-line caption naming what it is for
// (re-deciding as a pod), so the affordance is honest rather than absent.
//
// Completion timing is UNCHANGED by all of the above: `recordLabSubmission` is
// still called from exactly one place (`recordRun`, from the Finish branch of
// `handleContinue`). Submit does not record anything. A "Start over" + second
// finish appends a second `lab_submissions` row and re-emits participation,
// which `useProgress` short-circuits for an already-completed module.
interface Props {
  config: DecisionScenarioConfig;
  labId: string;
}

/** Per-checkpoint play state: what's checked, and whether feedback is revealed. */
interface CheckpointState {
  selected: number[];
  /**
   * True once Submit has revealed the feedback: Continue unlocks and the answer
   * can no longer be edited in place. Reopening it takes an explicit retake
   * (W3.4) — the guards below never let a revealed answer change silently.
   */
  revealed: boolean;
}

/** A fresh, unanswered play state for every checkpoint. */
const freshAnswers = (count: number): CheckpointState[] =>
  Array.from({ length: count }, () => ({ selected: [], revealed: false }));

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
  const [answers, setAnswers] = useState<CheckpointState[]>(() => freshAnswers(total));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // W3.1: one recap toggle for the whole walk (NOT per checkpoint) so a learner
  // who opens it on DELEGATE still has it open on VERIFY — that is what [20]
  // ("easy to revisit on each page/slide") asks for.
  const [contextOpen, setContextOpen] = useState(false);

  const setAnswer = (index: number, next: CheckpointState) =>
    setAnswers((prev) => prev.map((a, i) => (i === index ? next : a)));

  // Single-select: choosing STAGES the pick. W3.2 — selecting is no longer
  // submitting, so a pod can change its mind while it discusses; Submit is what
  // reveals the feedback.
  const choose = (index: number, optionIndex: number) => {
    if (answers[index].revealed) return; // reopen with "Try again", not by clicking
    setAnswer(index, { selected: [optionIndex], revealed: false });
  };

  // Multi-select: toggle freely until Submit reveals.
  const toggle = (index: number, optionIndex: number) => {
    if (answers[index].revealed) return;
    const current = answers[index].selected;
    const next = current.includes(optionIndex)
      ? current.filter((i) => i !== optionIndex)
      : [...current, optionIndex];
    setAnswer(index, { selected: next, revealed: false });
  };

  // The shared Submit gate for both selection modes (W3.2). Records nothing —
  // the only lab_submissions write is `recordRun` on Finish.
  const submitAnswer = (index: number) => {
    const a = answers[index];
    if (a.revealed || a.selected.length === 0) return;
    setAnswer(index, { ...a, revealed: true });
  };

  // W3.4 (Decision 7, grain 1): per-checkpoint retake. Clears the reveal AND
  // the selection so the learner re-decides rather than nudging a locked answer;
  // Continue re-locks until they Submit again.
  const retake = (index: number) => {
    if (!answers[index].revealed) return;
    setAnswer(index, { selected: [], revealed: false });
  };

  // W3.4 (Decision 7, grain 2): whole-scenario restart from the finished screen.
  // Withheld while `saving` so a reset cannot race the in-flight insert (the
  // DelegationSort DATA-04 guard), and `saved` MUST be cleared or `recordRun`'s
  // `if (saving || saved) return` would silently swallow the second run.
  const restart = () => {
    if (saving) return;
    setAnswers(freshAnswers(total));
    setStep(-1);
    setFinished(false);
    setSaved(false);
    setSaveError(null);
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
    // W3.3 [23] [28]: a multi-select reveal shows the ENTIRE answer key — every
    // option's authored feedback in the same order as the checkboxes above, so
    // an unchecked option's verdict is legible instead of ambiguous. Options are
    // NOT reordered: keeping authored order makes the block read as a key
    // against the list the learner just answered. Single-select still shows only
    // the chosen option (see the header comment for why).
    const feedbackIndexes = !a.revealed
      ? []
      : cp.multiSelect
        ? cp.options.map((_, oi) => oi)
        : a.selected.slice().sort((x, y) => x - y);
    const feedback = (
      <div className="space-y-3">
        {a.revealed && cp.multiSelect && (
          <p className="text-[11px] font-black uppercase tracking-widest text-gray-500">
            The full answer key — every option, whether or not you picked it
          </p>
        )}
        {feedbackIndexes.map((oi) => {
          const picked = a.selected.includes(oi);
          return (
            <div
              key={oi}
              className={`rounded-2xl border-2 p-4 space-y-2 ${
                picked
                  ? 'border-nava-plum/20 bg-nava-plum/5'
                  : 'border-gray-100 bg-gray-50/70'
              }`}
            >
              <div
                className={`flex items-center gap-2 text-[11px] font-black uppercase tracking-widest ${
                  picked ? 'text-nava-plum' : 'text-gray-500'
                }`}
              >
                <MessageCircleQuestion className="w-3.5 h-3.5" aria-hidden="true" />
                Feedback — {cp.options[oi].text}
                {cp.multiSelect && picked && (
                  <span className="ml-auto shrink-0 rounded-full bg-nava-plum/10 px-2 py-0.5 text-nava-plum">
                    You chose this
                  </span>
                )}
              </div>
              <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {cp.options[oi].feedbackMd}
                </ReactMarkdown>
              </div>
            </div>
          );
        })}
      </div>
    );

    // W3.2/W3.4: one Submit control for both selection modes, swapped for the
    // retake once the feedback is on screen. Rendered outside the live region so
    // a control is never announced as newly-revealed feedback.
    const controls = interactive && (
      <div className="space-y-1.5">
        {a.revealed ? (
          <>
            <button
              type="button"
              onClick={() => retake(index)}
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-xl font-bold text-sm hover:border-nava-green hover:text-nava-green transition-colors active:scale-95"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              Try again
            </button>
            {cp.multiSelect && (
              <p className="text-xs text-gray-500">
                The full key is already above and nothing here is scored — retake to re-decide as
                a pod, not to correct the record.
              </p>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => submitAnswer(index)}
            disabled={a.selected.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-nava-green text-white rounded-xl font-bold text-sm shadow-lg shadow-nava-green/20 hover:bg-nava-green/90 disabled:opacity-50 transition-all active:scale-95"
          >
            <Check className="w-4 h-4" aria-hidden="true" />
            Submit
          </button>
        )}
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
                  {/* Symmetric with multi-select: the "Your choice" marker is the
                      record of a SUBMITTED answer, so it appears on reveal. Before
                      Submit the staged pick reads from the highlight + aria-pressed. */}
                  {locked && chosen && (
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

        {/* Controls sit BELOW the feedback: pre-reveal the region is empty so
            this reads options → Submit; post-reveal it reads feedback → Try
            again, which is the order a learner decides in. */}
        {controls}
      </div>
    );
  };

  // Graceful fallback for a malformed authored row: with no checkpoints, "Start
  // the scenario" would step to checkpoints[0] / answers[0] — both undefined —
  // and throw. Show a clear message instead (all hooks run above this guard),
  // mirroring Lab.tsx's "Lab not configured" card.
  if (total === 0) {
    return (
      <div
        className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm text-center space-y-2"
        id="decision-scenario"
      >
        <h3 className="font-bold text-gray-800">Scenario not configured</h3>
        <p className="text-sm text-gray-500">
          This walk-through is missing its checkpoints. Please check back later or report an issue if
          this seems wrong.
        </p>
      </div>
    );
  }

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

          {/* W3.4 (Decision 7, grain 2): a clean second pass through the whole
              scenario. Withheld while the submission is in flight so the reset
              cannot race the insert; the recorded run above stays on file
              (lab_submissions is append-only), a second finish just appends
              another row. */}
          {!saving && (
            <div>
              <button
                type="button"
                onClick={restart}
                className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-xl font-bold text-sm hover:border-nava-green hover:text-nava-green transition-colors active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                Start over
              </button>
              <p className="mt-1.5 text-xs text-gray-500">
                Walks the scenario again from the beginning. Your recorded run stays on file.
              </p>
            </div>
          )}

          {/* The full read-through: every checkpoint with its choice and
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
              className="flex items-center gap-2 px-6 py-2.5 bg-nava-green text-white rounded-xl font-bold text-sm shadow-lg shadow-nava-green/20 hover:bg-nava-green/90 transition-all active:scale-95"
            >
              Start the scenario
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* W3.1 [19] [20] [27]: the premise travels with the learner. Same
              chevron + aria-expanded/aria-controls shape as CollapsibleSection
              in LearnerDashboard.tsx, so the two surfaces read as one system.
              Collapsed by default — the decision prompt keeps the fold. */}
          <div className="rounded-2xl border border-gray-200 bg-gray-50/70">
            <button
              type="button"
              onClick={() => setContextOpen((open) => !open)}
              aria-expanded={contextOpen}
              aria-controls="decision-scenario-context"
              className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
            >
              <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-gray-600">
                <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                Scenario recap
              </span>
              <ChevronDown
                className={`w-4 h-4 shrink-0 text-gray-500 transition-transform ${contextOpen ? '' : '-rotate-90'}`}
                aria-hidden="true"
              />
            </button>
            {contextOpen && (
              <div
                id="decision-scenario-context"
                className="border-t border-gray-200 px-4 py-3 prose prose-sm max-w-none text-gray-700 leading-relaxed"
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{config.introMd}</ReactMarkdown>
              </div>
            )}
          </div>

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
              className="flex items-center gap-2 px-6 py-2.5 bg-nava-green text-white rounded-xl font-bold text-sm shadow-lg shadow-nava-green/20 hover:bg-nava-green/90 disabled:opacity-50 transition-all active:scale-95"
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

import {
  AlertTriangle,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { FailureShapeIdConfig, FailureShapeScenario } from '../../types';
import { markdownComponents } from '../../lib/markdownComponents';
import { recordLabSubmission } from '../../lib/progress';
import { useAuth } from '../../lib/auth';

// The failure-shape-id exercise (Course 1, Weeks 6–7): "Find-the-Failure".
//
// Presentation deliberately mirrors decision-scenario ("Walk the Workflow",
// Weeks 3–4) so the two pod activities read as one system: an intro screen,
// then ONE scenario at a time with a "Scenario X of Y" progress line,
// full-width stacked option cards, Submit-to-reveal, a per-scenario "Try
// again", Previous/Continue nav, and a finished screen with a read-only
// read-through of the whole run.
//
// It stays its own kind rather than reusing decision-scenario for two reasons
// that are about content, not looks: DecisionCheckpoint.phase is constrained to
// delegate|ground|scope|verify (there is no honest pill for "which failure
// shape is this?"), and decision-scenario is deliberately ungraded with no
// `correct` at all — whereas this source authors one "Correct —" and three
// "Not quite —" strings per scenario, so correctness and a score are the point.
//
// Two divergences from decision-scenario's markup, both intentional:
//   - options are role="radio" inside an owning role="radiogroup" (the
//     DataClassifier pattern) rather than aria-pressed buttons: the pick is
//     mutually exclusive, so radio semantics are the accurate ones.
//   - each card carries its shape's `desc`, so a full-width option is
//     self-sufficient and no separate reference grid is needed.
//
// Completion: finishing records ONE lab_submissions row
// (`transcript.kind:'failure-shape-id'`), which auto-completes the module
// through the participation seam (via='lab'). It never gates — structurally
// enforced by Props being { config, labId } only (no onComplete, no
// useLabGrading). State is in-memory: a refresh restarts the activity, and the
// recorded submission on finish is the durable artifact.

interface Props {
  config: FailureShapeIdConfig;
  labId: string;
}

export default function FailureShapeId({ config, labId }: Props) {
  const { user } = useAuth();
  const { shapes, scenarios } = config;
  const total = scenarios.length;

  /** step -1 = intro screen; 0..total-1 = that scenario. `finished` supersedes. */
  const [step, setStep] = useState(-1);
  const [finished, setFinished] = useState(false);
  /** Staged (not yet revealed) pick per scenario id. */
  const [picks, setPicks] = useState<Record<string, string>>({});
  /** Scenario ids whose feedback is on screen. A revealed pick is locked. */
  const [revealed, setRevealed] = useState<Record<string, true>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const shapeFor = (id: string) => shapes.find((s) => s.id === id);
  const correctCount = scenarios.filter((s) => picks[s.id] === s.correct).length;

  const choose = (sid: string, shapeId: string) => {
    if (revealed[sid]) return; // a revealed answer only reopens via "Try again"
    setPicks((prev) => ({ ...prev, [sid]: shapeId }));
  };

  const submit = (sid: string) => {
    if (picks[sid] === undefined || revealed[sid]) return;
    setRevealed((prev) => ({ ...prev, [sid]: true }));
  };

  /** Per-scenario retake, available DURING the walk only (see `restart`). */
  const retry = (sid: string) => {
    setRevealed((prev) => {
      const next = { ...prev };
      delete next[sid];
      return next;
    });
    setPicks((prev) => {
      const next = { ...prev };
      delete next[sid];
      return next;
    });
  };

  const recordRun = async () => {
    if (!user) {
      setSaveError('Sign in to record your practice — your answers stay on screen either way.');
      return;
    }
    setSaveError(null);
    setSaving(true);
    try {
      await recordLabSubmission(user.id, {
        labId,
        transcript: {
          kind: 'failure-shape-id',
          answers: scenarios.map((s) => ({
            id: s.id,
            picked: picks[s.id] ?? null,
            correct: s.correct,
            correctness: picks[s.id] === s.correct,
          })),
          score: correctCount,
          maxScore: total,
        },
        status: 'submitted',
      });
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not record your submission.');
    } finally {
      setSaving(false);
    }
  };

  const handleContinue = () => {
    if (step < total - 1) {
      setStep(step + 1);
      return;
    }
    setFinished(true);
    void recordRun();
  };

  const handlePrevious = () => setStep((s) => Math.max(-1, s - 1));

  /** The only reset once a run is finished — mirrors decision-scenario's
   *  "Start over", and is withheld while the insert is in flight so the reset
   *  cannot race it. The recorded run stays on file (lab_submissions is
   *  append-only); a second finish just appends another row. */
  const restart = () => {
    setPicks({});
    setRevealed({});
    setFinished(false);
    setSaved(false);
    setSaveError(null);
    setStep(0);
  };

  const renderScenario = (scenario: FailureShapeScenario, index: number, interactive: boolean) => {
    const picked = picks[scenario.id];
    const isRevealed = Boolean(revealed[scenario.id]);
    const correct = isRevealed && picked === scenario.correct;
    const pickedOption = scenario.options.find((o) => o.shapeId === picked);

    const feedback = isRevealed && pickedOption && (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex gap-3 rounded-2xl p-4 ${correct ? 'bg-green-100/60' : 'bg-red-100/50'}`}
        >
          <div
            aria-hidden="true"
            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
              correct ? 'bg-green-200' : 'bg-red-200'
            }`}
          >
            {correct ? (
              <Check className="w-4 h-4 text-green-700" />
            ) : (
              <X className="w-4 h-4 text-red-700" />
            )}
          </div>
          <div
            className={`prose prose-sm max-w-none text-xs leading-relaxed ${
              correct ? 'prose-p:text-green-800' : 'prose-p:text-red-800'
            }`}
          >
            {/* Correctness must not be conveyed by colour + icon alone (D-20). */}
            <span className="sr-only">{correct ? 'Correct. ' : 'Incorrect. '}</span>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {pickedOption.feedbackMd}
            </ReactMarkdown>
          </div>
        </motion.div>
      </AnimatePresence>
    );

    return (
      <div key={scenario.id} className="space-y-5">
        <p className="text-xs font-bold text-gray-500">
          Scenario {index + 1} of {total}
        </p>

        <div className="prose prose-sm max-w-none bg-gray-50 rounded-2xl p-4">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {scenario.exchangeMd}
          </ReactMarkdown>
        </div>

        <p className="text-sm font-bold text-gray-800" id={`fsi-prompt-${scenario.id}`}>
          {scenario.prompt}
        </p>

        {/* role="radio" needs an owning radiogroup to carry group membership and
            "x of y" to a screen reader — the DataClassifier pattern. */}
        <div
          className="space-y-2"
          role="radiogroup"
          aria-labelledby={`fsi-prompt-${scenario.id}`}
        >
          {scenario.options.map((opt) => {
            const shape = shapeFor(opt.shapeId);
            const sel = picked === opt.shapeId;
            const isAnswer = isRevealed && opt.shapeId === scenario.correct;
            const wrongPick = isRevealed && sel && opt.shapeId !== scenario.correct;
            return (
              <button
                key={opt.shapeId}
                type="button"
                role="radio"
                aria-checked={sel}
                disabled={isRevealed}
                onClick={() => choose(scenario.id, opt.shapeId)}
                className={`w-full flex items-start gap-3 text-left rounded-2xl border-2 p-4 text-sm leading-relaxed transition-colors ${
                  isAnswer
                    ? 'border-green-600 bg-green-50'
                    : wrongPick
                      ? 'border-red-600 bg-red-50'
                      : sel
                        ? 'border-nava-green bg-nava-mint/30'
                        : 'border-gray-100 bg-white hover:border-nava-plum/50'
                }`}
              >
                <span className="text-gray-700">
                  <span className="font-bold text-gray-900">{shape?.label ?? opt.shapeId}</span>
                  {shape?.desc ? ` — ${shape.desc}` : null}
                </span>
                {isRevealed && sel && (
                  <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold text-gray-600 shrink-0">
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    Your choice
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* During the walk the feedback area is a polite live region so the
            reveal is announced; the read-only read-through renders it plainly. */}
        {interactive ? (
          <div role="status" aria-live="polite">
            {feedback}
          </div>
        ) : (
          feedback
        )}

        {interactive && (
          <div>
            {isRevealed ? (
              <button
                type="button"
                onClick={() => retry(scenario.id)}
                className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-xl font-bold text-sm hover:border-nava-green hover:text-nava-green transition-colors active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                Try again
              </button>
            ) : (
              <button
                type="button"
                onClick={() => submit(scenario.id)}
                disabled={picked === undefined}
                className="flex items-center gap-2 px-5 py-2.5 bg-nava-green text-white rounded-xl font-bold text-sm shadow-lg shadow-nava-green/20 hover:bg-nava-green/90 disabled:opacity-50 transition-all active:scale-95"
              >
                <Check className="w-4 h-4" aria-hidden="true" />
                Submit
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  // Graceful fallback for a malformed authored row (mirrors decision-scenario):
  // with no scenarios the stepper would index undefined and throw.
  if (total === 0) {
    return (
      <div
        className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm text-center space-y-2"
        id="failure-shape-id"
      >
        <h3 className="font-bold text-gray-800">Activity not configured</h3>
        <p className="text-sm text-gray-500">
          This activity is missing its scenarios. Please check back later or report an issue if this
          seems wrong.
        </p>
      </div>
    );
  }

  return (
    <div
      className="bg-white border-2 border-nava-plum/20 rounded-3xl p-8 shadow-sm space-y-6"
      id="failure-shape-id"
    >
      <div className="flex items-center gap-3 border-b border-nava-plum/20 pb-6">
        <div className="w-10 h-10 bg-nava-plum/10 rounded-xl flex items-center justify-center text-nava-plum">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold">{config.title ?? 'Find-the-Failure'}</h3>
          <p className="text-xs text-gray-500">
            Name the failure shape, one scenario at a time. This is practice — it doesn&apos;t
            affect your module completion.
          </p>
        </div>
      </div>

      {finished ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div
            role="status"
            aria-live="polite"
            className="rounded-2xl border-2 border-nava-green/20 bg-nava-mint/40 p-6"
          >
            <p className="font-bold text-gray-800">
              You named {correctCount} of {total} failure shapes.
            </p>
            <p className="mt-1 text-sm text-gray-600">
              Discuss any that split your pod. Remember: any of these showing up in your own work is
              an escalation, not a quiet fix.
            </p>
          </div>

          {saved && (
            <p role="status" className="flex items-center gap-2 text-sm font-bold text-nava-green">
              <CheckCircle className="w-4 h-4" aria-hidden="true" />
              Answers recorded — a Champion can review your run.
            </p>
          )}
          {saving && (
            <p role="status" className="flex items-center gap-2 text-sm font-semibold text-gray-500">
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1 }}
                className="inline-flex"
              >
                <Sparkles className="w-4 h-4" aria-hidden="true" />
              </motion.span>
              Recording your answers…
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

          {/* Withheld while the submission is in flight so the reset cannot race
              the insert. */}
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
                Runs the scenarios again from the beginning. Your recorded answers stay on file.
              </p>
            </div>
          )}

          {/* The full read-through: every scenario with its choice and revealed
              feedback, read-only (the stepper is done). */}
          <div className="space-y-8 border-t border-gray-100 pt-6">
            <h4 className="text-xs font-black uppercase tracking-widest text-gray-500">
              Your answers
            </h4>
            {scenarios.map((s, i) => renderScenario(s, i, false))}
          </div>
        </motion.div>
      ) : step < 0 ? (
        <div className="space-y-6">
          {config.introMd && (
            <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {config.introMd}
              </ReactMarkdown>
            </div>
          )}
          <div className="flex justify-end border-t border-gray-100 pt-6">
            <button
              type="button"
              onClick={handleContinue}
              className="flex items-center gap-2 px-6 py-2.5 bg-nava-green text-white rounded-xl font-bold text-sm shadow-lg shadow-nava-green/20 hover:bg-nava-green/90 transition-all active:scale-95"
            >
              Start the activity
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {renderScenario(scenarios[step], step, true)}

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
              disabled={!revealed[scenarios[step].id]}
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

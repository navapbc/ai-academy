import { AlertTriangle, Check, RotateCcw, ShieldCheck, Sparkles, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { FailureShapeIdConfig } from '../../types';
import { markdownComponents } from '../../lib/markdownComponents';
import { recordLabSubmission } from '../../lib/progress';
import { useAuth } from '../../lib/auth';

// The failure-shape-id exercise (Course 1, Weeks 6–7): "Find-the-Failure".
//
// Per scenario the learner reads a realistic prompt/response exchange and names
// which of the four civic-tech failure shapes it shows. Selecting STAGES a pick
// (changeable); an explicit "Check answer" reveals the feedback authored for
// THAT option — right or wrong — which is the whole reason this is its own kind
// rather than harm-rubric (one `why` per scenario, so a wrong pick reads the
// correct answer's rationale instead of its own). The Submit-to-reveal gate and
// the per-item "Try again" mirror decision-scenario (W3.2 / W3.4): a revealed
// answer is never mutated silently, only reopened deliberately.
//
// Completion: finishing records ONE lab_submissions row
// (`transcript.kind:'failure-shape-id'`), which auto-completes the module
// through the participation seam (via='lab'). It never gates — structurally
// enforced by Props being { config, labId } only (no onComplete, no
// useLabGrading). State is in-memory: a refresh restarts the activity, and the
// recorded submission on finish is the durable artifact (matches
// decision-scenario's documented v1 behaviour).

interface Props {
  config: FailureShapeIdConfig;
  labId: string;
}

export default function FailureShapeId({ config, labId }: Props) {
  const { user } = useAuth();
  const { shapes, scenarios } = config;

  /** Staged (not yet revealed) pick per scenario id. */
  const [picks, setPicks] = useState<Record<string, string>>({});
  /** Scenario ids whose feedback is on screen. A revealed pick is locked. */
  const [revealed, setRevealed] = useState<Record<string, true>>({});
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const labelFor = (id: string) => shapes.find((s) => s.id === id)?.label ?? id;
  const correctCount = scenarios.filter((s) => revealed[s.id] && picks[s.id] === s.correct).length;
  const allRevealed = scenarios.every((s) => revealed[s.id]);

  const choose = (sid: string, shapeId: string) => {
    if (revealed[sid]) return; // a revealed answer only reopens via "Try again"
    setPicks((prev) => ({ ...prev, [sid]: shapeId }));
  };

  const reveal = (sid: string) => {
    if (picks[sid] === undefined || revealed[sid]) return;
    setRevealed((prev) => ({ ...prev, [sid]: true }));
  };

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
    setFinished(false);
  };

  const handleFinish = async () => {
    if (!allRevealed || finished || saving) return; // guard the async-save window (DATA-04)
    setFinished(true);
    setSaveError(null);

    if (!user) {
      setSaveError('Sign in to record your practice — your answers are shown below either way.');
      return;
    }

    const answers = scenarios.map((s) => ({
      id: s.id,
      picked: picks[s.id] ?? null,
      correct: s.correct,
      correctness: picks[s.id] === s.correct,
    }));

    setSaving(true);
    try {
      await recordLabSubmission(user.id, {
        labId,
        transcript: {
          kind: 'failure-shape-id',
          answers,
          score: correctCount,
          maxScore: scenarios.length,
        },
        status: 'submitted',
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not record your submission.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="bg-white border-2 border-nava-plum/20 rounded-3xl p-8 shadow-sm space-y-8"
      id="failure-shape-id"
    >
      <div className="flex items-center gap-3 border-b border-nava-plum/20 pb-6">
        <div className="w-10 h-10 bg-nava-plum/10 rounded-xl flex items-center justify-center text-nava-plum">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold">{config.title ?? 'Find-the-Failure'}</h3>
          <p className="text-xs text-gray-500">
            Name the failure shape in each exchange, then read the feedback for the call you made.
            This is practice — it doesn&apos;t affect your module completion.
          </p>
        </div>
      </div>

      {config.introMd && (
        <div className="prose prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {config.introMd}
          </ReactMarkdown>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {shapes.map((s) => (
          <div key={s.id} className="text-xs text-gray-600 bg-gray-50 rounded-xl p-3 leading-relaxed">
            <span className="font-bold text-nava-plum">{s.label}</span> — {s.desc}
          </div>
        ))}
      </div>

      <div className="space-y-5">
        {scenarios.map((scenario, i) => {
          const picked = picks[scenario.id];
          const isRevealed = Boolean(revealed[scenario.id]);
          const correct = isRevealed && picked === scenario.correct;
          const pickedOption = scenario.options.find((o) => o.shapeId === picked);

          return (
            <div
              key={scenario.id}
              className={`rounded-2xl border-2 p-5 space-y-4 ${
                isRevealed
                  ? correct
                    ? 'border-green-200 bg-green-50/40'
                    : 'border-red-200 bg-red-50/40'
                  : 'border-gray-100'
              }`}
            >
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Scenario {i + 1} of {scenarios.length}
              </p>

              <div className="prose prose-sm max-w-none bg-gray-50 rounded-xl p-4">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {scenario.exchangeMd}
                </ReactMarkdown>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-800 mb-2">{scenario.prompt}</p>
                {/* role="radio" needs an owning radiogroup to carry group membership
                    and "x of y" to a screen reader — the DataClassifier pattern. */}
                <div
                  className="flex flex-wrap gap-2"
                  role="radiogroup"
                  aria-label={`Failure shape for scenario ${i + 1}`}
                >
                  {scenario.options.map((opt) => {
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
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                          isAnswer
                            ? 'border-green-600 bg-green-50 text-green-900'
                            : wrongPick
                              ? 'border-red-600 bg-red-50 text-red-900'
                              : sel
                                ? 'border-nava-plum bg-nava-plum/10 text-nava-plum'
                                : 'border-gray-100 text-gray-600 hover:border-nava-plum/30'
                        }`}
                      >
                        {labelFor(opt.shapeId)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <AnimatePresence>
                {isRevealed && pickedOption && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-3 rounded-xl p-4 ${correct ? 'bg-green-100/60' : 'bg-red-100/50'}`}
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
                )}
              </AnimatePresence>

              <div className="flex justify-end">
                {isRevealed ? (
                  <button
                    type="button"
                    onClick={() => retry(scenario.id)}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-gray-700 rounded-lg border-2 border-gray-200 hover:border-gray-400 transition-all active:scale-95"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    Try again
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => reveal(scenario.id)}
                    disabled={picked === undefined}
                    className="px-5 py-2 bg-gray-900 text-white rounded-lg font-bold text-xs hover:bg-black disabled:opacity-50 transition-all active:scale-95"
                  >
                    Check answer
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {saveError && (
        <p role="alert" className="text-xs text-red-600 font-medium">
          {saveError}
        </p>
      )}

      <div className="flex items-center justify-between gap-4 border-t border-gray-100 pt-6">
        <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm font-bold text-gray-700">
          {finished ? (
            <>
              <ShieldCheck className="w-5 h-5 text-nava-green" />
              You named {correctCount} of {scenarios.length} failure shapes. Discuss any that split
              your pod.
            </>
          ) : (
            <span className="text-gray-500 font-medium text-xs">
              {Object.keys(revealed).length} of {scenarios.length} scenarios checked.
            </span>
          )}
        </div>
        {!finished && (
          <button
            type="button"
            onClick={handleFinish}
            disabled={!allRevealed || saving}
            className="flex items-center gap-2 px-10 py-3 bg-nava-green text-white rounded-xl font-bold shadow-lg shadow-nava-green/20 disabled:opacity-50 transition-all active:scale-95 shrink-0"
          >
            {saving ? (
              <>
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                  <Sparkles className="w-4 h-4" />
                </motion.div>
                Recording…
              </>
            ) : (
              'Finish activity'
            )}
          </button>
        )}
      </div>
    </div>
  );
}

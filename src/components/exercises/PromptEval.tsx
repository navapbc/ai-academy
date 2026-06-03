import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FlaskConical, Sparkles, Play, Save, Terminal, Target, AlertTriangle } from 'lucide-react';
import type { PromptEvalConfig } from '../../types';
import { useAuth } from '../../lib/auth';
import { streamChat } from '../../lib/llm';
import { CLAUDE_MODELS, DEFAULT_MODEL_ID } from '../../lib/models';
import { recordLabSubmission, saveGrade } from '../../lib/progress';
import { requestLlmGrade, type GradeResult } from '../../lib/grading';
import GradeResultCard from '../GradeResultCard';

// The reusable-prompt eval (P4.5b) on cell 2.10 "Test-driven and constraint-first
// prompting". The learner reads a RECURRING task + the constraints to encode + a
// small seeded test set (2 complete records + 1 edge case = a record with a missing
// field), writes ONE reusable, constraint-first prompt, then RUNS it live against
// each test input (streamChat through the chat Edge Function, one call per case,
// mirroring VoiceEdit's AbortController + cleanup). After every case has an output,
// "Submit for grading" sends the prompt + its per-case outputs to the P4.2/#48
// LLM-judge as {brief, sections} — one section for the prompt plus one per case —
// and the anchor-scored result renders in place via GradeResultCard (reused as-is).
// This is graded PRACTICE that records a lab_submissions row but is NOT the
// completion gate (the inline quiz is) — structurally enforced by Props being
// { config, labId } only (no onComplete).
interface Props {
  config: PromptEvalConfig;
  labId: string;
}

// Builds the per-case run prompt: the learner's reusable prompt, then the record to
// run it against. Kept small + pure so the live run uses exactly what the rubric
// then scores. Mirrors VoiceEdit's buildDraftPrompt.
function buildCasePrompt(prompt: string, input: string): string {
  return `${prompt}\n\n---\nInput:\n${input}`;
}

export default function PromptEval({ config, labId }: Props) {
  const { user } = useAuth();
  const { brief, testCases, rubric } = config;
  const title = config.title ?? 'Practice: write one reusable, constraint-first prompt';
  const subtitle =
    config.subtitle ??
    'Encode the rules, then test the prompt against every case. This is graded practice — it doesn’t affect your module completion.';

  const [model, setModel] = useState<string>(DEFAULT_MODEL_ID);
  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [runningCaseId, setRunningCaseId] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  const [runError, setRunError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [grading, setGrading] = useState(false);
  const [gradeResult, setGradeResult] = useState<GradeResult | null>(null);
  const [gradeError, setGradeError] = useState<string | null>(null);

  // Cancels the in-flight run on unmount / re-run (LLM-05), mirroring Lab/VoiceEdit.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  // Every case has been run when each has a non-empty collected output. Gates Submit —
  // you can't grade outputs you haven't produced.
  const allCasesRun =
    !running && testCases.length > 0 && testCases.every((c) => (outputs[c.id] ?? '').trim().length > 0);
  const canRun = prompt.trim().length > 0 && !running;
  const canSubmit = allCasesRun && !saving && !saved;

  const handleRun = async () => {
    if (!canRun) return;
    setRunning(true);
    setOutputs({});
    setRunError(null);
    // A re-run replaces the outputs, so any prior grade no longer matches.
    setSaved(false);
    setGradeResult(null);
    setGradeError(null);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Run sequentially — the chat function is rate-limited per user, and ~3
      // cases keep this to a handful of calls.
      for (const tc of testCases) {
        if (controller.signal.aborted) return;
        setRunningCaseId(tc.id);
        let acc = '';
        await streamChat(
          [{ role: 'user', content: buildCasePrompt(prompt, tc.input) }],
          { model, signal: controller.signal },
          (chunk) => {
            acc += chunk;
            setOutputs((prev) => ({ ...prev, [tc.id]: acc }));
          },
        );
      }
    } catch (err) {
      setRunError(
        `Couldn’t finish running the cases: ${err instanceof Error ? err.message : 'request to Claude failed.'}`,
      );
    } finally {
      setRunningCaseId(null);
      setRunning(false);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaveError(null);
    setGradeError(null);

    if (!user) {
      setSaveError('Sign in to submit your prompt — it’s graded below.');
      return;
    }

    setSaving(true);
    try {
      const id = await recordLabSubmission(user.id, {
        labId,
        transcript: { kind: 'prompt-eval', prompt, outputs },
        status: 'submitted',
      });
      setSaved(true);

      // Grade the prompt + its outputs across the cases (P4.2 judge). Completion
      // never depends on grading — the inline quiz is the gate — so a grading
      // failure is a quiet, non-blocking note rather than an error.
      setGrading(true);
      try {
        const result = await requestLlmGrade({
          rubric,
          submission: {
            brief: brief.instruction,
            sections: [
              { label: "The learner's reusable prompt", text: prompt },
              ...testCases.map((c) => ({
                label: `Case: ${c.label}`,
                text: `INPUT:\n${c.input}\n\nOUTPUT:\n${outputs[c.id] ?? ''}`,
              })),
            ],
          },
        });
        await saveGrade(id, result, 'reviewable');
        setGradeResult(result);
      } catch {
        setGradeError('Grading is unavailable right now — your prompt is saved.');
      } finally {
        setGrading(false);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save your submission.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border-2 border-nava-mint rounded-3xl p-8 shadow-sm space-y-6" id="prompt-eval">
      <div className="flex items-center justify-between gap-3 border-b border-nava-mint pb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-nava-mint rounded-xl flex items-center justify-center text-nava-green">
            <FlaskConical className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold">{title}</h3>
            <p className="text-xs text-gray-500">{subtitle}</p>
          </div>
        </div>

        {/* Model selector — mirrors the prompt lab. Disabled mid-run. */}
        <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5 shrink-0">
          <span className="text-[9px] text-gray-500 uppercase font-black tracking-tighter">Model</span>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={running}
            aria-label="Run model"
            className="bg-transparent border-none outline-none text-xs font-bold text-nava-green cursor-pointer disabled:opacity-50"
          >
            {CLAUDE_MODELS.map((m) => (
              <option key={m.id} value={m.id} className="text-gray-900">{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* The recurring task + the constraints to encode. */}
      <div className="bg-nava-plum/5 border-2 border-nava-plum/20 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-nava-plum">
          <Target className="w-3.5 h-3.5" />
          The recurring task
        </div>
        <p className="text-sm font-semibold text-gray-800 leading-relaxed">{brief.instruction}</p>
        {brief.constraints?.length ? (
          <ul className="flex flex-wrap items-center gap-2">
            {brief.constraints.map((c) => (
              <li
                key={c}
                className="text-[11px] font-semibold bg-white border border-nava-plum/20 text-nava-plum rounded-full px-2.5 py-1"
              >
                {c}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* The seeded test set — edge case visibly marked. */}
      <div className="space-y-3">
        <div className="text-[11px] font-black uppercase tracking-widest text-gray-500">
          Test records ({testCases.length})
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {testCases.map((tc) => (
            <div
              key={tc.id}
              className={`rounded-2xl border p-4 space-y-2 ${
                tc.isEdge ? 'border-nava-gold/60 bg-nava-gold/5' : 'border-gray-100 bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-gray-700">{tc.label}</span>
                {tc.isEdge && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-nava-gold bg-white border border-nava-gold/40 rounded-full px-2 py-0.5">
                    <AlertTriangle className="w-3 h-3" />
                    Edge case
                  </span>
                )}
              </div>
              <pre className="whitespace-pre-wrap text-xs text-gray-600 leading-relaxed font-sans">{tc.input}</pre>
              {tc.note && <p className="text-[11px] text-nava-gold/90 font-medium leading-snug">{tc.note}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* The learner's reusable prompt. */}
      <div className="space-y-3">
        <div className="space-y-1">
          <label htmlFor="prompt-eval-input" className="text-[11px] font-black uppercase tracking-widest text-nava-plum">
            Your reusable prompt
          </label>
          <p className="text-xs text-gray-500">
            State your rules first — length and format, what every summary must include, and what it must
            never invent — then describe the task. Write it to work on any record, not just one.
          </p>
        </div>
        <textarea
          id="prompt-eval-input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={8}
          aria-label="Your reusable prompt"
          placeholder="Rules first (length · format · must-include · must-not-invent), then the task…"
          className="w-full rounded-2xl border-2 border-gray-100 focus:border-nava-green focus:outline-none p-4 text-sm text-gray-700 leading-relaxed resize-y transition-colors"
        />

        <button
          onClick={handleRun}
          disabled={!canRun}
          className="flex items-center gap-2 px-6 py-2.5 bg-nava-green text-white rounded-xl font-bold text-sm shadow-lg shadow-nava-green/20 hover:bg-nava-plum disabled:opacity-50 transition-all active:scale-95"
        >
          {running ? (
            <>
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                <Sparkles className="w-4 h-4" />
              </motion.div>
              Running cases…
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Run against test cases
            </>
          )}
        </button>
        {runError && <p role="alert" className="text-xs text-red-600 font-medium">{runError}</p>}
      </div>

      {/* The per-case outputs (announced to screen readers as they stream). */}
      <AnimatePresence>
        {(running || Object.keys(outputs).length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
            role="status"
            aria-live="polite"
            aria-busy={running}
          >
            <div className="flex items-center gap-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              <Terminal className="w-3.5 h-3.5" />
              Outputs — check each against your rules
            </div>
            {testCases.map((tc) => {
              const out = outputs[tc.id];
              if (out === undefined && !(running && runningCaseId === tc.id)) return null;
              return (
                <div key={tc.id} className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-[11px] font-bold text-gray-600">
                    {tc.label}
                    {tc.isEdge && <span className="text-nava-gold">· edge case</span>}
                  </div>
                  <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {out || <span className="text-gray-500 italic">Waiting for Claude…</span>}
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit for grading — gated until every case has been run. */}
      {(allCasesRun || saved) && (
        <div className="flex flex-col items-end gap-2 border-t border-gray-100 pt-6">
          {saveError && <p role="alert" className="text-xs text-red-600 font-medium">{saveError}</p>}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex items-center gap-2 px-8 py-3 bg-nava-green text-white rounded-xl font-bold shadow-lg shadow-nava-green/20 disabled:opacity-50 transition-all active:scale-95"
          >
            {saved ? (
              <>Submitted <Save className="w-4 h-4" /></>
            ) : saving ? (
              <>
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                  <Sparkles className="w-4 h-4" />
                </motion.div>
                Submitting…
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Submit for grading
              </>
            )}
          </button>
        </div>
      )}

      {/* Anchor-scored result (P4.2 judge) — provisional, pending review (P5.1). */}
      {grading && (
        <div role="status" aria-live="polite" className="text-xs text-gray-500 flex items-center gap-2">
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
            <Sparkles className="w-3.5 h-3.5" />
          </motion.div>
          Grading your prompt and its outputs…
        </div>
      )}
      {gradeError && <p role="status" aria-live="polite" className="text-xs text-gray-500">{gradeError}</p>}
      {gradeResult && <GradeResultCard result={gradeResult} />}
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PenLine, Sparkles, Wand2, Save, Terminal } from 'lucide-react';
import type { VoiceEditConfig } from '../../types';
import { useAuth } from '../../lib/auth';
import { streamChat } from '../../lib/llm';
import { CLAUDE_MODELS, DEFAULT_MODEL_ID } from '../../lib/models';
import { recordLabSubmission, saveGrade } from '../../lib/progress';
import { requestLlmGrade, type GradeResult } from '../../lib/grading';
import GradeResultCard from '../GradeResultCard';

// The voice-edit exercise (P4.4b) on cell 2.6 "AI for writing tasks". Two phases:
//   1. Generate — read a dense source + a writing brief, then generate an AI FIRST
//      DRAFT live (streamChat through the chat Edge Function), mirroring Lab.tsx's
//      streaming flow + AbortController cleanup.
//   2. Revise — the AI draft is shown read-only and the revision textarea is
//      PREFILLED with it; the learner edits "AI off," in their own voice, to
//      restore specifics the draft dropped/generalized and fix reading level/tone.
// The revision is graded in place by the P4.2/#48 LLM-judge against three sections
// (Source + AI first draft + the revision), reusing GradeResultCard as-is. This is
// graded PRACTICE that records a lab_submissions row but is NOT the completion gate
// (the inline quiz is) — structurally enforced by Props being { config, labId }
// only (no onComplete).
interface Props {
  config: VoiceEditConfig;
  labId: string;
}

// Soft floor: gates Save + drives the live counter. The box is prefilled with the
// draft, so this mainly prevents submitting an emptied box; a plain-language notice
// that keeps the source's specifics runs well past it.
const MIN_REVISION_WORDS = 50;

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

// Builds the phase-1 draft prompt from the source + brief, so the live draft is
// generated against the same task the learner sees (and the same constraints the
// rubric scores). Kept small + pure so it's easy to read and test.
function buildDraftPrompt(
  source: VoiceEditConfig['source'],
  brief: VoiceEditConfig['brief'],
): string {
  const constraints = brief.constraints?.length
    ? `\n\nConstraints:\n${brief.constraints.map((c) => `- ${c}`).join('\n')}`
    : '';
  return (
    `${brief.instruction}\n\n` +
    `Source — ${source.label}:\n${source.bodyMd}` +
    `${constraints}\n\n` +
    `Write the draft now. Output only the notice itself, with no preamble.`
  );
}

export default function VoiceEdit({ config, labId }: Props) {
  const { user } = useAuth();
  const { source, brief, rubric } = config;
  const title = config.title ?? 'Practice: voice-edit the AI draft';
  const subtitle =
    config.subtitle ??
    'Generate a first draft, then revise it in your own voice. This is graded practice — it doesn’t affect your module completion.';

  const [model, setModel] = useState<string>(DEFAULT_MODEL_ID);
  const [draft, setDraft] = useState('');
  const [generating, setGenerating] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  const [revision, setRevision] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [grading, setGrading] = useState(false);
  const [gradeResult, setGradeResult] = useState<GradeResult | null>(null);
  const [gradeError, setGradeError] = useState<string | null>(null);

  // Cancels the in-flight draft stream on unmount / re-run (LLM-05), mirroring Lab.tsx.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const draftReady = draft.trim().length > 0 && !generating;
  const wordCount = countWords(revision);
  const reachedTarget = wordCount >= MIN_REVISION_WORDS;
  const canSave = draftReady && reachedTarget && !saving && !saved;

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    setDraft('');
    setDraftError(null);
    // A re-generate replaces the draft and re-seeds the revision below.
    setSaved(false);
    setGradeResult(null);
    setGradeError(null);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let acc = '';
    try {
      await streamChat(
        [{ role: 'user', content: buildDraftPrompt(source, brief) }],
        { model, signal: controller.signal },
        (chunk) => {
          acc += chunk;
          setDraft(acc);
        },
      );
      // Prefill the revision with the completed draft — phase 2 starts "AI off"
      // from exactly what the model produced, so the edit is the visible work.
      setRevision(acc);
    } catch (err) {
      setDraftError(
        `Couldn’t generate a draft: ${err instanceof Error ? err.message : 'request to Claude failed.'}`,
      );
      // Discard any partial stream: a non-empty draft would flip `draftReady`,
      // unmounting the phase-1 block that holds this error message and the only
      // regenerate button — presenting a truncated draft as finished (D-03).
      setDraft('');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaveError(null);
    setGradeError(null);

    if (!user) {
      setSaveError('Sign in to save your revision — it’s graded below.');
      return;
    }

    setSaving(true);
    try {
      const id = await recordLabSubmission(user.id, {
        labId,
        transcript: { kind: 'voice-edit', draft, revision: revision.trim(), wordCount },
        status: 'submitted',
      });
      setSaved(true);

      // Grade the revision against the source + the draft (P4.2 judge). Completion
      // never depends on grading — the inline quiz is the gate — so a grading
      // failure is a quiet, non-blocking note rather than an error.
      setGrading(true);
      try {
        const result = await requestLlmGrade({
          rubric,
          submission: {
            brief: brief.instruction,
            sections: [
              { label: 'Source', text: source.bodyMd },
              { label: 'AI first draft', text: draft },
              { label: "The learner's revision", text: revision.trim() },
            ],
          },
        });
        await saveGrade(id, result, 'reviewable');
        setGradeResult(result);
      } catch {
        setGradeError('Grading is unavailable right now — your revision is saved.');
      } finally {
        setGrading(false);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save your revision.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border-2 border-nava-mint rounded-3xl p-8 shadow-sm space-y-6" id="voice-edit">
      <div className="flex items-center justify-between gap-3 border-b border-nava-mint pb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-nava-mint rounded-xl flex items-center justify-center text-nava-green">
            <PenLine className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold">{title}</h3>
            <p className="text-xs text-gray-500">{subtitle}</p>
          </div>
        </div>

        {/* Model selector — mirrors the prompt lab (P1.2). Disabled mid-stream. */}
        <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5 shrink-0">
          <span className="text-[9px] text-gray-500 uppercase font-black tracking-tighter">Model</span>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={generating}
            aria-label="Draft model"
            className="bg-transparent border-none outline-none text-xs font-bold text-nava-green cursor-pointer disabled:opacity-50"
          >
            {CLAUDE_MODELS.map((m) => (
              <option key={m.id} value={m.id} className="text-gray-900">{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* The dense source the learner rewrites. */}
      <div className="space-y-2">
        <div className="text-[11px] font-black uppercase tracking-widest text-gray-500">{source.label}</div>
        <div className="prose prose-sm prose-slate max-w-none rounded-xl bg-gray-50 border border-gray-100 p-5 prose-p:text-gray-700 prose-li:text-gray-700 prose-headings:text-gray-800 prose-strong:text-gray-800 prose-code:text-nava-plum prose-code:bg-gray-100 prose-code:rounded prose-code:px-1 prose-code:font-normal prose-blockquote:border-l-nava-plum prose-blockquote:text-gray-500">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{source.bodyMd}</ReactMarkdown>
        </div>
      </div>

      {/* The brief + constraints. */}
      <div className="bg-nava-plum/5 border-2 border-nava-plum/20 rounded-2xl p-5 space-y-3">
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

      {/* Phase 1: generate the AI first draft. */}
      {!draftReady && (
        <div className="space-y-3">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-6 py-2.5 bg-nava-green text-white rounded-xl font-bold text-sm shadow-lg shadow-nava-green/20 hover:bg-nava-plum disabled:opacity-50 transition-all active:scale-95"
          >
            {generating ? (
              <>
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                  <Sparkles className="w-4 h-4" />
                </motion.div>
                Generating draft…
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                Generate AI first draft
              </>
            )}
          </button>
          {draftError && <p role="alert" className="text-xs text-red-600 font-medium">{draftError}</p>}
        </div>
      )}

      {/* The streaming draft (announced to screen readers as it arrives). */}
      <AnimatePresence>
        {(draft || generating) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-50 border border-gray-200 rounded-2xl p-5 space-y-2"
          >
            <div className="flex items-center gap-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              <Terminal className="w-3.5 h-3.5" />
              AI first draft
            </div>
            <div
              role="status"
              aria-live="polite"
              aria-busy={generating}
              className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap"
            >
              {draft || <span className="text-gray-500 italic">Waiting for Claude…</span>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Phase 2: revise the draft "AI off," in the learner's own voice. */}
      {draftReady && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="voice-edit-revision" className="text-[11px] font-black uppercase tracking-widest text-nava-plum">
              Your revision — AI off
            </label>
            <p className="text-xs text-gray-500">
              Edit in your own voice; restore anything the draft dropped or generalized, and verify every specific against the source.
            </p>
          </div>

          {saved ? (
            <div className="rounded-2xl border-2 border-nava-green/20 bg-nava-mint/30 p-5 whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
              {revision.trim()}
            </div>
          ) : (
            <>
              <textarea
                id="voice-edit-revision"
                value={revision}
                onChange={(e) => setRevision(e.target.value)}
                rows={10}
                aria-label="Your revision"
                placeholder="Rewrite the draft for the person who will actually read it…"
                className="w-full rounded-2xl border-2 border-gray-100 focus:border-nava-green focus:outline-none p-4 text-sm text-gray-700 leading-relaxed resize-y transition-colors"
              />

              {saveError && <p role="alert" className="text-xs text-red-600 font-medium">{saveError}</p>}

              <div className="flex items-center justify-between border-t border-gray-100 pt-6">
                <span className={`text-xs font-semibold ${reachedTarget ? 'text-nava-green' : 'text-gray-500'}`}>
                  {wordCount} / {MIN_REVISION_WORDS} words
                </span>
                <button
                  onClick={handleSave}
                  disabled={!canSave}
                  className="flex items-center gap-2 px-8 py-3 bg-nava-green text-white rounded-xl font-bold shadow-lg shadow-nava-green/20 disabled:opacity-50 transition-all active:scale-95"
                >
                  {saving ? (
                    <>
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                        <Sparkles className="w-4 h-4" />
                      </motion.div>
                      Saving…
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save revision
                    </>
                  )}
                </button>
              </div>
              {!reachedTarget && (
                <p className="text-xs text-gray-500 -mt-2 text-right">
                  Write at least {MIN_REVISION_WORDS} words to submit.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Anchor-scored result (P4.2 judge) — provisional, pending review (P5.1). */}
      {grading && (
        <div role="status" aria-live="polite" className="text-xs text-gray-500 flex items-center gap-2">
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
            <Sparkles className="w-3.5 h-3.5" />
          </motion.div>
          Grading your revision…
        </div>
      )}
      {gradeError && <p role="status" aria-live="polite" className="text-xs text-gray-500">{gradeError}</p>}
      {gradeResult && <GradeResultCard result={gradeResult} />}
    </div>
  );
}

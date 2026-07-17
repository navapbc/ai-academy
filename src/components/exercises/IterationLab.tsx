import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, Sparkles, Send, Save, Target, Lightbulb, User, Bot } from 'lucide-react';
import type { IterationConfig } from '../../types';
import { useAuth } from '../../lib/auth';
import { streamChat, type ChatMessage } from '../../lib/llm';
import { CLAUDE_MODELS, DEFAULT_MODEL_ID } from '../../lib/models';
import { recordLabSubmission } from '../../lib/progress';
import { useLabGrading } from '../../lib/useLabGrading';
import GradeResultCard from '../GradeResultCard';
import GradeError from '../GradeError';
import PiiNotice from '../PiiNotice';

// The iteration lab (P4.5c) on cell 2.4 "Iteration as the literate behavior". The
// learner conducts a real MULTI-TURN refinement conversation with Claude toward a
// constrained goal: each turn appends to a growing messages[] array and sends the
// whole array to streamChat (which already takes a messages[] history), mirroring
// VoiceEdit's AbortController + unmount cleanup. Once they've taken at least
// `minTurns` turns, "Submit iteration for grading" sends the conversation to the
// P4.2/#48 LLM-judge as {brief, sections} — the goal, the learner's turns in order,
// and the full transcript — and the judge scores the QUALITY OF THE LEARNER'S
// ITERATION (their steering turns), NOT the non-deterministic final output. The
// anchor-scored result renders in place via GradeResultCard (reused as-is). This is
// graded PRACTICE that records a lab_submissions row but is NOT the completion gate
// (the inline quiz is) — structurally enforced by Props being { config, labId } only
// (no onComplete).
interface Props {
  config: IterationConfig;
  labId: string;
}

// Builds the "goal" judge section: the instruction + the constraints the iteration
// is steering toward. Kept small + pure.
function buildGoalText(brief: IterationConfig['brief']): string {
  if (!brief.constraints?.length) return brief.instruction;
  return `${brief.instruction}\n\nConstraints:\n${brief.constraints.map((c) => `- ${c}`).join('\n')}`;
}

export default function IterationLab({ config, labId }: Props) {
  const { user } = useAuth();
  const { brief, rubric, starter, minTurns } = config;
  const title = config.title ?? 'Practice: iterate toward a usable draft';
  const subtitle =
    config.subtitle ??
    'Steer across a few turns — refine, push back, critique. This is graded practice — it doesn’t affect your module completion.';

  const [model, setModel] = useState<string>(DEFAULT_MODEL_ID);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streaming, setStreaming] = useState(''); // the in-progress assistant reply
  const [runError, setRunError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { grading, gradeResult, gradeError, grade, retry, reset: resetGrade } = useLabGrading();

  // Cancels the in-flight turn on unmount / re-send (LLM-05), mirroring Lab/VoiceEdit.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  // A "turn" is one learner message (committed once its reply lands). The Submit
  // gate enforces the lesson: you can't treat the first answer as final.
  const turnCount = messages.filter((m) => m.role === 'user').length;
  const reachedMinTurns = turnCount >= minTurns;
  const canSend = input.trim().length > 0 && !isStreaming;
  const canSubmit = reachedMinTurns && !isStreaming && !saving && !saved;

  const handleSend = async () => {
    if (!canSend) return;
    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setIsStreaming(true);
    setStreaming('');
    setRunError(null);
    // A new turn changes the conversation, so any prior grade no longer matches.
    setSaved(false);
    resetGrade();

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let acc = '';
    try {
      await streamChat(
        next,
        { model, signal: controller.signal },
        (chunk) => {
          acc += chunk;
          setStreaming(acc);
        },
      );
      // Commit the assistant reply as a turn (only if not aborted mid-stream).
      if (!controller.signal.aborted) {
        setMessages([...next, { role: 'assistant', content: acc }]);
      }
    } catch (err) {
      setRunError(
        `Claude couldn’t reply: ${err instanceof Error ? err.message : 'request failed.'}`,
      );
      // Roll back the unanswered user turn so the conversation stays consistent,
      // and put the learner's text back in the composer — their steering message
      // is the graded artifact and must survive a transient failure (D-15).
      setMessages(messages);
      setInput(userMsg.content);
    } finally {
      setStreaming('');
      setIsStreaming(false);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaveError(null);
    resetGrade();

    if (!user) {
      setSaveError('Sign in to submit your iteration — it’s graded below.');
      return;
    }

    const learnerTurns = messages
      .filter((m) => m.role === 'user')
      .map((m, i) => `${i + 1}. ${m.content}`)
      .join('\n\n');
    const fullTranscript = messages
      .map((m) => `${m.role === 'user' ? 'You' : 'Claude'}: ${m.content}`)
      .join('\n\n');

    setSaving(true);
    try {
      const id = await recordLabSubmission(user.id, {
        labId,
        transcript: { kind: 'iteration', messages, turnCount },
        status: 'submitted',
      });
      setSaved(true);

      // Grade the QUALITY OF THE ITERATION (the learner's turns), not the model's
      // output. Completion never depends on grading — the inline quiz is the gate —
      // so a grading failure is a quiet, non-blocking note, retryable in place (D-17).
      await grade({
        submissionId: id,
        rubric,
        submission: {
          brief: brief.instruction,
          sections: [
            { label: 'The goal', text: buildGoalText(brief) },
            { label: "The learner's turns, in order", text: learnerTurns },
            { label: 'Full transcript', text: fullTranscript },
          ],
        },
        failureNote: 'Grading is unavailable right now — your conversation is saved.',
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save your submission.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border-2 border-nava-plum/20 rounded-3xl p-8 shadow-sm space-y-6" id="iteration-lab">
      <div className="flex items-center justify-between gap-3 border-b border-nava-plum/20 pb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-nava-plum/10 rounded-xl flex items-center justify-center text-nava-plum">
            <RefreshCw className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold">{title}</h3>
            <p className="text-xs text-gray-500">{subtitle}</p>
          </div>
        </div>

        {/* Model selector — mirrors the prompt lab. Disabled mid-stream. */}
        <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5 shrink-0">
          <span className="text-[9px] text-gray-500 uppercase font-black tracking-tighter">Model</span>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={isStreaming}
            aria-label="Conversation model"
            className="bg-transparent border-none outline-none text-xs font-bold text-nava-green cursor-pointer disabled:opacity-50"
          >
            {CLAUDE_MODELS.map((m) => (
              <option key={m.id} value={m.id} className="text-gray-900">{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* The goal + the constraints the first draft tends to miss. */}
      <div className="bg-nava-plum/5 border-2 border-nava-plum/20 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-nava-plum">
          <Target className="w-3.5 h-3.5" />
          Your goal
        </div>
        <p className="text-sm font-semibold text-gray-800 leading-relaxed whitespace-pre-wrap">{brief.instruction}</p>
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

      {/* Optional starter hint. */}
      {starter && (
        <div className="flex items-start gap-2 text-xs text-gray-600 bg-nava-gold/5 border border-nava-gold/30 rounded-2xl p-4 leading-relaxed">
          <Lightbulb className="w-4 h-4 text-nava-gold shrink-0 mt-0.5" />
          <span>{starter}</span>
        </div>
      )}

      {/* The conversation, as a log (announced to screen readers as turns land). */}
      {(messages.length > 0 || isStreaming) && (
        <div role="log" aria-live="polite" aria-busy={isStreaming} className="space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 text-gray-500">
                  <Bot className="w-4 h-4" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl p-4 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-nava-green text-white'
                    : 'bg-gray-50 border border-gray-200 text-gray-700'
                }`}
              >
                {m.content}
              </div>
              {m.role === 'user' && (
                <div className="w-7 h-7 rounded-lg bg-nava-mint flex items-center justify-center shrink-0 text-nava-green">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}
          {/* The streaming assistant reply (in progress). */}
          {isStreaming && (
            <div className="flex gap-3 justify-start">
              <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 text-gray-500">
                <Bot className="w-4 h-4" />
              </div>
              <div className="max-w-[80%] rounded-2xl p-4 text-sm leading-relaxed whitespace-pre-wrap bg-gray-50 border border-gray-200 text-gray-700">
                {streaming || <span className="text-gray-500 italic">Waiting for Claude…</span>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* The learner's next turn. */}
      <div className="space-y-3">
        <label htmlFor="iteration-input" className="text-[11px] font-black uppercase tracking-widest text-nava-plum">
          {messages.length === 0 ? 'Your starter prompt' : 'Your next turn'}
        </label>
        <PiiNotice />
        <textarea
          id="iteration-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSend();
          }}
          rows={3}
          aria-label="Your message to Claude"
          placeholder={
            messages.length === 0
              ? 'Send a starter prompt to get a first draft…'
              : 'Read the last reply, then steer: name what to fix, add a constraint, or ask it to critique itself…'
          }
          className="w-full rounded-2xl border-2 border-gray-100 focus:border-nava-plum focus:outline-none p-4 text-sm text-gray-700 leading-relaxed resize-y transition-colors"
        />
        <div className="flex items-center justify-between gap-3">
          <span className={`text-xs font-semibold ${reachedMinTurns ? 'text-nava-green' : 'text-gray-500'}`}>
            {turnCount} / {minTurns} turns
          </span>
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="flex items-center gap-2 px-6 py-2.5 bg-nava-green text-white rounded-xl font-bold text-sm shadow-lg shadow-nava-green/20 hover:bg-nava-green/90 disabled:opacity-50 transition-all active:scale-95"
          >
            {isStreaming ? (
              <>
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                  <Sparkles className="w-4 h-4" />
                </motion.div>
                Claude is replying…
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send
              </>
            )}
          </button>
        </div>
        {runError && <p role="alert" className="text-xs text-red-600 font-medium">{runError}</p>}
        {!reachedMinTurns && messages.length > 0 && (
          <p className="text-xs text-gray-500">
            Take at least {minTurns} turns — refine, push back, or ask it to critique itself — before submitting.
          </p>
        )}
      </div>

      {/* Submit for grading — gated until minTurns turns have been taken. */}
      {(reachedMinTurns || saved) && (
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
                Submit iteration for grading
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
          Grading how you iterated…
        </div>
      )}
      {gradeError && <GradeError note={gradeError} onRetry={retry} />}
      <AnimatePresence>{gradeResult && <GradeResultCard result={gradeResult} />}</AnimatePresence>
    </div>
  );
}

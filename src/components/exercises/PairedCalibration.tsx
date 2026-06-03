import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Square, Timer, Bot, Sparkles, RotateCcw, ShieldCheck } from 'lucide-react';
import type { PairedCalibrationConfig } from '../../types';
import { useAuth } from '../../lib/auth';
import { streamChat } from '../../lib/llm';
import { DEFAULT_MODEL_ID } from '../../lib/models';
import { recordLabSubmission } from '../../lib/progress';
import { computePairedCalibration, type CalibrationResult } from './pairedCalibration.compute';

interface Props {
  config: PairedCalibrationConfig;
  labId: string;
}

type Phase = 'intro' | 'off' | 'onIntro' | 'on' | 'report' | 'reveal';

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Paired AI-on/AI-off calibration (P4.6, cell 2.15). The app times two comparable
// tasks (one without AI, one with Claude), captures the learner's speedup estimate
// BEFORE revealing actual times, and computes their perception gap. Graded practice
// that records a lab_submissions row but is NOT the completion gate (the inline quiz
// is) — enforced by Props being { config, labId } only (no onComplete).
export default function PairedCalibration({ config, labId }: Props) {
  const { user } = useAuth();
  const { intro, offTask, onTask } = config;

  const [phase, setPhase] = useState<Phase>('intro');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [offMs, setOffMs] = useState(0);
  const [onMs, setOnMs] = useState(0);
  const [offOutput, setOffOutput] = useState('');
  const [onPrompt, setOnPrompt] = useState('');
  const [onResponse, setOnResponse] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [offDefects, setOffDefects] = useState('');
  const [onDefects, setOnDefects] = useState('');
  const [estimate, setEstimate] = useState('');
  const [result, setResult] = useState<CalibrationResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  // Live timer tick while a timed phase is active.
  useEffect(() => {
    if (phase !== 'off' && phase !== 'on') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase]);

  const elapsed = startedAt ? now - startedAt : 0;

  const startPhase = (p: 'off' | 'on') => {
    const t = Date.now();
    setStartedAt(t);
    setNow(t);
    setPhase(p);
  };

  const finishOff = () => {
    setOffMs(startedAt ? Date.now() - startedAt : 0);
    setStartedAt(null);
    setPhase('onIntro');
  };

  const finishOn = () => {
    setOnMs(startedAt ? Date.now() - startedAt : 0);
    setStartedAt(null);
    setPhase('report');
  };

  const handleRun = async () => {
    if (!onPrompt.trim() || isStreaming) return;
    setIsStreaming(true);
    setOnResponse('');
    setRunError(null);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamChat(
        [{ role: 'user', content: onPrompt }],
        { model: DEFAULT_MODEL_ID, signal: controller.signal },
        (chunk) => setOnResponse((prev) => prev + chunk),
      );
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Request to Claude failed.');
    } finally {
      setIsStreaming(false);
    }
  };

  const handleSubmit = async () => {
    const estimatePct = Number(estimate);
    if (Number.isNaN(estimatePct)) return;
    const r = computePairedCalibration({ offMs, onMs, estimatePct });
    setResult(r);
    setPhase('reveal');
    if (!user) {
      setSaveError('Sign in to record your calibration — your result is shown below.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await recordLabSubmission(user.id, {
        labId,
        transcript: {
          offMs,
          onMs,
          offOutput,
          onPrompt,
          onResponse,
          offDefects: Math.max(0, Number(offDefects) || 0),
          onDefects: Math.max(0, Number(onDefects) || 0),
          estimatePct,
          actualSpeedupPct: r.actualSpeedupPct,
          gapPct: r.gapPct,
        },
        status: 'submitted',
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not record your submission.');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setPhase('intro');
    setStartedAt(null);
    setOffMs(0);
    setOnMs(0);
    setOffOutput('');
    setOnPrompt('');
    setOnResponse('');
    setRunError(null);
    setOffDefects('');
    setOnDefects('');
    setEstimate('');
    setResult(null);
    setSaveError(null);
  };

  return (
    <div className="bg-white border-2 border-nava-mint rounded-3xl p-8 shadow-sm space-y-6" id="paired-calibration">
      <div className="flex items-center gap-3 border-b border-nava-mint pb-6">
        <div className="w-10 h-10 bg-nava-mint rounded-xl flex items-center justify-center text-nava-green">
          <Timer className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold">Practice: paired calibration</h3>
          <p className="text-xs text-gray-500">
            Do both tasks, time yourself honestly, and measure your perception-vs-reality gap. This is
            graded practice — it doesn&apos;t affect your module completion.
          </p>
        </div>
      </div>

      {phase === 'intro' && (
        <div className="space-y-4">
          {intro && <p className="text-sm text-gray-600 leading-relaxed">{intro}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-2xl border-2 border-gray-100 p-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">Without AI</p>
              <p className="text-sm font-bold text-gray-800 mt-1">{offTask.label}</p>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">{offTask.brief}</p>
            </div>
            <div className="rounded-2xl border-2 border-gray-100 p-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">With Claude</p>
              <p className="text-sm font-bold text-gray-800 mt-1">{onTask.label}</p>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">{onTask.brief}</p>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => startPhase('off')}
              className="flex items-center gap-2 px-8 py-3 bg-nava-green text-white rounded-xl font-bold shadow-lg shadow-nava-green/20 hover:bg-nava-plum transition-all active:scale-95"
            >
              <Play className="w-4 h-4" /> Start without AI
            </button>
          </div>
        </div>
      )}

      {phase === 'off' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-gray-800">{offTask.label} — no AI</p>
            <span className="flex items-center gap-1.5 text-sm font-mono font-bold text-nava-plum">
              <Timer className="w-4 h-4" /> {fmt(elapsed)}
            </span>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">{offTask.brief}</p>
          <textarea
            value={offOutput}
            onChange={(e) => setOffOutput(e.target.value)}
            placeholder="Do the task here — no AI."
            className="w-full h-40 bg-gray-50 border border-gray-200 rounded-2xl p-4 text-sm outline-none focus:ring-2 focus:ring-nava-green resize-none"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={finishOff}
              className="flex items-center gap-2 px-8 py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-all active:scale-95"
            >
              <Square className="w-4 h-4" /> Done — stop timer
            </button>
          </div>
        </div>
      )}

      {phase === 'onIntro' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Now the comparable task <span className="font-bold">with Claude</span>. The timer starts when you begin.
          </p>
          <div className="rounded-2xl border-2 border-gray-100 p-4">
            <p className="text-sm font-bold text-gray-800">{onTask.label}</p>
            <p className="text-xs text-gray-600 mt-1 leading-relaxed">{onTask.brief}</p>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => startPhase('on')}
              className="flex items-center gap-2 px-8 py-3 bg-nava-green text-white rounded-xl font-bold shadow-lg shadow-nava-green/20 hover:bg-nava-plum transition-all active:scale-95"
            >
              <Play className="w-4 h-4" /> Start with Claude
            </button>
          </div>
        </div>
      )}

      {phase === 'on' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-gray-800">{onTask.label} — with Claude</p>
            <span className="flex items-center gap-1.5 text-sm font-mono font-bold text-nava-plum">
              <Timer className="w-4 h-4" /> {fmt(elapsed)}
            </span>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">{onTask.brief}</p>
          <textarea
            value={onPrompt}
            onChange={(e) => setOnPrompt(e.target.value)}
            placeholder="Prompt Claude to help you do the task…"
            className="w-full h-28 bg-gray-50 border border-gray-200 rounded-2xl p-4 text-sm outline-none focus:ring-2 focus:ring-nava-green resize-none"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleRun}
              disabled={isStreaming || !onPrompt.trim()}
              className="flex items-center gap-2 px-6 py-2.5 bg-nava-green text-white rounded-xl font-bold text-sm hover:bg-nava-plum disabled:opacity-50 transition-all active:scale-95"
            >
              {isStreaming ? (
                <><motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}><Sparkles className="w-4 h-4" /></motion.div> Running…</>
              ) : (
                <><Bot className="w-4 h-4" /> Run prompt</>
              )}
            </button>
            <button
              type="button"
              onClick={finishOn}
              className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-black transition-all active:scale-95"
            >
              <Square className="w-4 h-4" /> Done — stop timer
            </button>
          </div>
          {runError && <p className="text-xs text-red-600 font-medium">{runError}</p>}
          <AnimatePresence>
            {(onResponse || isStreaming) && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-sm text-gray-700 whitespace-pre-wrap">
                {onResponse || <span className="text-gray-400 italic">Waiting for Claude…</span>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {phase === 'report' && (
        <div className="space-y-5">
          <p className="text-sm text-gray-700 font-medium">
            Before we show your times: how much faster (%) do you think AI made you?
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-xs font-bold text-gray-600 space-y-1">
              Your estimated speedup (%)
              <input type="number" value={estimate} onChange={(e) => setEstimate(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-xl border-2 border-gray-100 focus:border-nava-green outline-none text-sm" />
            </label>
            <label className="text-xs font-bold text-gray-600 space-y-1">
              Defects — no-AI output
              <input type="number" min="0" value={offDefects} onChange={(e) => setOffDefects(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-xl border-2 border-gray-100 focus:border-nava-green outline-none text-sm" />
            </label>
            <label className="text-xs font-bold text-gray-600 space-y-1">
              Defects — Claude output
              <input type="number" min="0" value={onDefects} onChange={(e) => setOnDefects(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-xl border-2 border-gray-100 focus:border-nava-green outline-none text-sm" />
            </label>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={estimate.trim() === '' || Number.isNaN(Number(estimate)) || saving}
              className="flex items-center gap-2 px-8 py-3 bg-nava-green text-white rounded-xl font-bold shadow-lg shadow-nava-green/20 disabled:opacity-50 transition-all active:scale-95"
            >
              Reveal my calibration number
            </button>
          </div>
        </div>
      )}

      {phase === 'reveal' && result && (
        <div className="space-y-4">
          <div className="bg-nava-mint/30 border-2 border-nava-mint rounded-2xl p-6 space-y-3 text-center">
            <ShieldCheck className="w-8 h-8 text-nava-green mx-auto" />
            <p className="text-sm text-gray-700">
              You felt <span className="font-bold">{Number(estimate)}%</span> faster. You were actually{' '}
              <span className="font-bold">{result.actualSpeedupPct}%</span>
              {result.actualSpeedupPct < 0 ? ' (AI was slower)' : ''}.
            </p>
            <p className="text-lg font-black text-nava-plum">Calibration gap: {result.gapPct} points</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              That gap is your perception-vs-reality number — discount your own speed sense by about that
              much. Defects: {Math.max(0, Number(offDefects) || 0)} (no-AI) vs {Math.max(0, Number(onDefects) || 0)} (Claude).
            </p>
          </div>
          {saveError && <p className="text-xs text-red-600 font-medium">{saveError}</p>}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={reset}
              className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-black transition-all active:scale-95"
            >
              <RotateCcw className="w-4 h-4" /> Start over
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

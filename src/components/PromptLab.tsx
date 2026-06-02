import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Play, Terminal, CheckCircle, FlaskConical, Lightbulb, Target, ChevronDown, Save } from 'lucide-react';
import { streamChat } from '../lib/llm';
import { CLAUDE_MODELS, DEFAULT_MODEL_ID } from '../lib/models';
import { recordLabSubmission } from '../lib/progress';
import { useAuth } from '../lib/auth';
import { AIPersona, LabConfig } from '../types';

const LAB_ID = '2.1';

interface PromptLabProps {
  onComplete: () => void;
  // The lab's brief/constraints/scaffold tips, sourced from the module's
  // lab_config_json (content-as-data, P3.2.3b). Optional so a misconfigured
  // module degrades to a clear message instead of crashing.
  labConfig?: LabConfig;
  // Kept for renderer-call compatibility; the construction lab is persona-agnostic.
  selectedPersona?: AIPersona;
}

export default function PromptLab({ onComplete, labConfig }: PromptLabProps) {
  const { user } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [model, setModel] = useState<string>(DEFAULT_MODEL_ID);
  const [showTips, setShowTips] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Cancels the in-flight stream on unmount / re-run (LLM-05).
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  // Graceful fallback: if the module has no (or an unexpected) lab config, show
  // a clear message instead of crashing. All hooks run above this guard.
  if (labConfig?.kind !== 'prompt-construction') {
    return (
      <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm text-center space-y-2" id="prompt-lab">
        <FlaskConical className="w-8 h-8 mx-auto text-gray-300" />
        <h3 className="font-bold text-gray-800">Lab not configured</h3>
        <p className="text-sm text-gray-500">
          This lab is missing its configuration. Please check back later.
        </p>
      </div>
    );
  }

  const brief = labConfig.brief;
  const scaffoldHints = labConfig.scaffoldHints;

  const briefText = `Task: ${brief.task}\nTarget output: ${brief.constraints.join(' · ')}.`;
  const hasRun = response.trim().length > 0 && !isLoading;

  const handleRun = async () => {
    if (!prompt.trim() || isLoading) return;
    setIsLoading(true);
    setResponse('');
    setSaved(false);
    setSaveError(null);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChat(
        [{ role: 'user', content: prompt }],
        { model, signal: controller.signal },
        (chunk) => { setResponse(prev => prev + chunk); },
      );
    } catch (err) {
      setResponse(`Error: ${err instanceof Error ? err.message : 'Request to Claude failed.'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) {
      setSaveError('Please sign in to save your work.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await recordLabSubmission(user.id, {
        labId: LAB_ID,
        transcript: { brief: briefText, prompt, response },
        status: 'submitted',
      });
      setSaved(true);
      onComplete();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save your submission.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm flex flex-col" id="prompt-lab">
      <div className="bg-gray-900 p-6 text-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-nava-plum rounded-xl flex items-center justify-center">
            <FlaskConical className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold">Lab: Prompt Construction</h3>
            <p className="text-xs text-gray-400">Write a constraint-first prompt and run it against Claude.</p>
          </div>
        </div>

        {/* Model selector */}
        <div className="flex items-center gap-1.5 bg-gray-800/60 border border-gray-700 rounded-xl px-2.5 py-1.5">
          <span className="text-[9px] text-gray-500 uppercase font-black tracking-tighter">Model</span>
          <select
            value={model}
            onChange={e => setModel(e.target.value)}
            className="bg-transparent border-none outline-none text-xs font-bold text-nava-green cursor-pointer"
          >
            {CLAUDE_MODELS.map(m => (
              <option key={m.id} value={m.id} className="text-gray-900">{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-6">
        {/* The brief, shown prominently */}
        <div className="bg-nava-plum/5 border-2 border-nava-plum/20 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-nava-plum">
            <Target className="w-3.5 h-3.5" />
            Your Brief
          </div>
          <p className="text-sm text-gray-800 font-medium leading-relaxed">
            <span className="font-bold">Task:</span> {brief.task}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-gray-500">Target output:</span>
            {brief.constraints.map((c) => (
              <span key={c} className="text-[11px] font-semibold bg-white border border-nava-plum/20 text-nava-plum rounded-full px-2.5 py-1">
                {c}
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Prompt editor + run */}
          <div className="lg:col-span-3 space-y-4">
            <div>
              <button
                onClick={() => setShowTips(s => !s)}
                className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 hover:text-nava-plum uppercase tracking-widest transition-colors"
              >
                <Lightbulb className="w-3.5 h-3.5 text-nava-gold" />
                Scaffolding tips
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showTips ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {showTips && (
                  <motion.ul
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3 space-y-2 overflow-hidden"
                  >
                    {scaffoldHints.map((h) => (
                      <li key={h.label} className="text-xs text-gray-600 leading-relaxed">
                        <span className="font-bold text-gray-800">{h.label}</span> — {h.hint}
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>

            <div className="relative">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleRun();
                }}
                placeholder={'Write your prompt here.\n\nLead with the role and core task, state your constraints up front (length · reading level · tone · no jargon · one next step), and describe what a finished note looks like.'}
                className="w-full h-56 bg-gray-50 border border-gray-200 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-nava-green focus:border-transparent outline-none transition-all resize-none"
              />
            </div>

            <button
              onClick={handleRun}
              disabled={isLoading || !prompt.trim()}
              className="flex items-center gap-2 px-6 py-2.5 bg-nava-green text-white rounded-xl font-bold text-sm shadow-lg hover:bg-nava-plum disabled:opacity-50 disabled:grayscale transition-all active:scale-95"
            >
              {isLoading
                ? <><motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}><Sparkles className="w-4 h-4" /></motion.div> Running…</>
                : <><Play className="w-4 h-4" /> Run prompt</>}
            </button>
          </div>

          {/* Self-check list */}
          <div className="lg:col-span-2">
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 space-y-3">
              <div className="text-[11px] font-black uppercase tracking-widest text-gray-400">
                Self-check
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Read the output against the brief. Does it hit every target?
              </p>
              <ul className="space-y-2 pt-1">
                {brief.constraints.map((c) => (
                  <li key={c} className="flex items-start gap-2 text-sm text-gray-700">
                    <CheckCircle className="w-4 h-4 text-gray-300 mt-0.5 shrink-0" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Output */}
        <AnimatePresence>
          {(response || isLoading) && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gray-50 border border-gray-200 rounded-2xl p-6 space-y-3"
            >
              <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                <Terminal className="w-3.5 h-3.5" />
                Claude's Output
              </div>
              <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {response || <span className="text-gray-400 italic">Waiting for Claude…</span>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Save & complete */}
        {hasRun && (
          <div className="pt-2 border-t border-gray-100 flex flex-col items-end gap-2">
            {saveError && <p className="text-xs text-red-600 font-medium">{saveError}</p>}
            <button
              onClick={handleSave}
              disabled={saving || saved}
              className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 disabled:opacity-50 transition-all active:scale-95"
            >
              {saved
                ? <>Saved & completed <CheckCircle className="w-4 h-4" /></>
                : saving
                  ? <><motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}><Sparkles className="w-4 h-4" /></motion.div> Saving…</>
                  : <><Save className="w-4 h-4" /> Save & complete</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

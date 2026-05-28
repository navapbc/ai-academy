import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Send, Shield, Terminal, CheckCircle, FlaskConical, Lightbulb, MousePointer2, Database, AlertTriangle, Info } from 'lucide-react';
import { generateLocalStream } from '../services/aiService';
import { LocalModel } from '../services/localProviderService';
import { AI_PERSONAS } from '../constants';
import { AIPersona } from '../types';

const EXAMPLE_PROMPTS = [
  "Does Nava policy allow AI to make benefit determinations?",
  "What reading level is required for Nava AI responses?",
  "Who is the final authority on policy verification according to the snippet?",
  "How should the assistant handle questions not covered in the grounding context?"
];

interface PromptLabProps {
  onComplete: () => void;
  isLocalActive: boolean;
  localModels: LocalModel[];
  selectedLocalModel?: string;
  selectedPersona: AIPersona;
}

export default function PromptLab({ onComplete, isLocalActive, localModels, selectedLocalModel, selectedPersona }: PromptLabProps) {
  const [userInput, setUserInput] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [exampleIdx, setExampleIdx] = useState(0);
  const [showGroundingAlert, setShowGroundingAlert] = useState(false);
  const groundingRef = useRef<HTMLDivElement>(null);
  const prevLocalModelRef = useRef<string | undefined>(selectedLocalModel);

  const useLocal = isLocalActive && !!selectedLocalModel;

  useEffect(() => {
    if (selectedLocalModel && selectedLocalModel !== prevLocalModelRef.current) {
      setShowGroundingAlert(true);
      setTimeout(() => setShowGroundingAlert(false), 5000);
      if (groundingRef.current) {
        groundingRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    prevLocalModelRef.current = selectedLocalModel;
  }, [selectedLocalModel]);

  useEffect(() => {
    const interval = setInterval(() => {
      setExampleIdx(prev => (prev + 1) % EXAMPLE_PROMPTS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const policySnippet = `NAVA POLICY RE: LLM GROUNDING
- Models MUST NOT speculate on eligibility for specific benefits.
- Responses MUST include a disclaimer that final policy verification happens via human caseworker.
- Plain language is mandatory (8th grade level).`;

  const persona = AI_PERSONAS.find(p => p.id === selectedPersona) || AI_PERSONAS[0];
  const systemInstructions = `${persona.promptPrefix} \n\nCRITICAL: Ground your answers ONLY in the following policy snippet: \n${policySnippet}. If you don't know something based on this snippet, say you don't know. Do NOT use outside knowledge.`;

  const selectedModelData = localModels.find(m => m.id === selectedLocalModel);

  const handleSend = async () => {
    if (!userInput.trim()) return;
    setIsLoading(true);
    setResponse('');

    try {
      if (!selectedLocalModel) throw new Error('No local model selected. Pick a model in the header.');
      const modelData = localModels.find(m => m.id === selectedLocalModel);
      if (!modelData) throw new Error('Selected model not found.');
      await generateLocalStream(
        modelData.provider,
        selectedLocalModel,
        [
          { role: 'system', content: systemInstructions },
          { role: 'user', content: userInput },
        ],
        (chunk) => { setResponse(prev => prev + chunk); }
      );
    } catch (err) {
      setResponse(`Error: ${err instanceof Error ? err.message : 'Connection to AI model failed.'}`);
    } finally {
      setIsLoading(false);
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
            <h3 className="font-bold">Prompt Lab: Grounding Exercises</h3>
            <p className="text-xs text-gray-400">Master the art of providing context to models.</p>
          </div>
        </div>

        {/* Active model badge — driven by Header selection */}
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider border ${useLocal ? 'bg-nava-green/10 text-nava-green border-nava-green/30' : 'bg-gray-800 text-gray-400 border-gray-700'}`}>
          <Database className="w-3 h-3" />
          {useLocal && selectedModelData ? selectedModelData.name : 'No model connected'}
        </div>
      </div>

      <div className="flex-1 p-6 space-y-6">
        <AnimatePresence>
          {showGroundingAlert && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-nava-green text-white p-3 rounded-xl flex items-center gap-3 mb-4 shadow-lg shadow-nava-green/20">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <p className="text-xs font-bold uppercase tracking-wider">
                  Model switched — now restricted to the policy context below.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!userInput && !response && (
          <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-6 relative overflow-hidden">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
              <Lightbulb className="w-3.5 h-3.5 text-nava-gold" />
              Try a prompt
            </div>
            <AnimatePresence mode="wait">
              <motion.button
                key={exampleIdx}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onClick={() => setUserInput(EXAMPLE_PROMPTS[exampleIdx])}
                className="text-left w-full group"
              >
                <div className="text-sm text-gray-600 italic leading-relaxed pr-8 py-2 border-l-2 border-nava-gold pl-4 bg-white/50 rounded-r-xl">
                  "{EXAMPLE_PROMPTS[exampleIdx]}"
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-[10px] font-bold text-nava-plum opacity-0 group-hover:opacity-100 transition-opacity">
                  <MousePointer2 className="w-3 h-3" />
                  Click to use this prompt
                </div>
              </motion.button>
            </AnimatePresence>
          </div>
        )}

        <div
          ref={groundingRef}
          className={`p-4 rounded-xl space-y-2 transition-all duration-500 border-2 relative group ${showGroundingAlert ? 'bg-nava-mint border-nava-green ring-8 ring-nava-green/10 -translate-y-1 shadow-2xl scale-[1.02]' : 'bg-gray-50 border-gray-100'}`}
        >
          {showGroundingAlert && (
            <motion.div
              className="absolute inset-0 border-2 border-nava-green rounded-xl"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            />
          )}
          <div className="flex items-center justify-between relative z-10">
            <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${showGroundingAlert ? 'text-nava-green' : 'text-gray-400'}`}>
              <Shield className="w-3 h-3" />
              Active Grounding Context
            </div>
            <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md border shadow-sm transition-all ${showGroundingAlert ? 'bg-nava-green text-white border-nava-green' : 'bg-white text-gray-400 border-gray-100 group-hover:text-nava-plum'}`}>
              <Info className="w-3 h-3" />
              Source of Truth
            </div>
          </div>
          <pre className={`text-[10px] font-mono whitespace-pre-wrap leading-relaxed transition-colors relative z-10 ${showGroundingAlert ? 'text-nava-green font-bold' : 'text-gray-500'}`}>
            {policySnippet}
          </pre>
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
            <div className="bg-gray-900 text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-xl whitespace-nowrap">
              The model will ONLY use this content to answer
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSend();
              }}
              placeholder="Ask a question about Nava policies..."
              className="w-full h-32 bg-gray-50 border border-gray-200 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-nava-green focus:border-transparent outline-none transition-all resize-none"
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !userInput.trim()}
              className="absolute bottom-4 right-4 p-3 bg-nava-green text-white rounded-xl shadow-lg hover:bg-nava-plum disabled:opacity-50 disabled:grayscale transition-all active:scale-95"
            >
              {isLoading
                ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}><Sparkles className="w-5 h-5" /></motion.div>
                : <Send className="w-5 h-5" />}
            </button>
          </div>

          <AnimatePresence>
            {response && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gray-50 border border-gray-200 rounded-2xl p-6 space-y-3"
              >
                <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  <Terminal className="w-3.5 h-3.5" />
                  Model Output
                </div>
                <div className="text-sm text-gray-700 leading-relaxed font-mono whitespace-pre-wrap">
                  {response}
                </div>
                <div className="pt-4 flex justify-end">
                  <button
                    onClick={onComplete}
                    className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg font-bold text-sm hover:bg-green-700"
                  >
                    Found a grounded answer
                    <CheckCircle className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

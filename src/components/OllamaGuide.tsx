import { Database, Download, Terminal, CheckCircle, ArrowRight, Loader2, Play, Monitor, Zap, RefreshCw, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useState } from 'react';
import { ollamaService } from '../services/ollamaService';

const SUGGESTED_MODELS = [
  { name: 'phi3:mini', size: '2.2GB', desc: 'Fast & capable' },
  { name: 'llama3:8b', size: '4.7GB', desc: 'Most popular' },
  { name: 'mistral:latest', size: '4.1GB', desc: 'Versatile' },
  { name: 'gemma:2b', size: '1.6GB', desc: 'Lightweight' },
];

export default function OllamaGuide({ isActive, onComplete }: { isActive: boolean; onComplete: () => void }) {
  const [pulling, setPulling] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ollama' | 'lm-studio'>('lm-studio');

  const handlePull = async (name: string) => {
    setPulling(name);
    setError(null);
    try {
      await ollamaService.pullModel(name, (s) => setStatus(s));
      setStatus('Success!');
      setTimeout(() => setPulling(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pull model');
      setPulling(null);
    }
  };

  return (
    <div className="bg-white border-2 border-gray-100 rounded-3xl overflow-hidden" id="local-ai-guide">
      <div className={`p-8 flex items-center justify-between border-b transition-all ${isActive ? 'bg-green-50 border-green-100' : 'bg-gray-50 border-gray-100'}`}>
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors shadow-sm ${isActive ? 'bg-green-600 text-white shadow-green-200' : 'bg-gray-200 text-gray-400'}`}>
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900">Local AI Setup</h3>
            <p className="text-sm text-gray-500 font-medium">Privacy-first inference on your hardware.</p>
          </div>
        </div>
        {isActive && (
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-green-200"
          >
            <CheckCircle className="w-4 h-4" />
            Active & Connected
          </motion.div>
        )}
      </div>

      <div className="flex border-b border-gray-100">
        <button
          onClick={() => setActiveTab('lm-studio')}
          className={`flex-1 py-4 text-sm font-bold transition-all border-b-2 ${activeTab === 'lm-studio' ? 'border-nava-plum text-nava-plum' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
        >
          LM Studio
        </button>
        <button
          onClick={() => setActiveTab('ollama')}
          className={`flex-1 py-4 text-sm font-bold transition-all border-b-2 ${activeTab === 'ollama' ? 'border-nava-plum text-nava-plum' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
        >
          Ollama
        </button>
      </div>

      <div className="p-8 space-y-10">
        <AnimatePresence mode="wait">
          {activeTab === 'ollama' ? (
            <motion.div
              key="ollama"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h4 className="font-bold flex items-center gap-2 text-gray-900">
                    <Download className="w-4 h-4" />
                    1. Install Ollama
                  </h4>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    Download Ollama from <a href="https://ollama.com" target="_blank" rel="noreferrer" className="text-nava-plum underline font-medium">ollama.com</a>. This local server allows you to run models directly on your hardware.
                  </p>
                </div>
                <div className="space-y-4">
                  <h4 className="font-bold flex items-center gap-2 text-gray-900">
                    <Terminal className="w-4 h-4" />
                    2. Technical Alternative
                  </h4>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    Prefer the command line? Run: <br/>
                    <code className="bg-gray-100 px-2 py-1 rounded text-pink-600 font-mono text-[10px]">ollama run llama3</code>
                  </p>
                </div>
              </div>

              {isActive && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold flex items-center gap-2 text-nava-plum">
                      <Download className="w-4 h-4" />
                      Quick Library
                    </h4>
                    {error && <span className="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded font-bold uppercase tracking-wider">{error}</span>}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {SUGGESTED_MODELS.map((m) => (
                      <button
                        key={m.name}
                        disabled={!!pulling}
                        onClick={() => handlePull(m.name)}
                        className={`p-4 border-2 rounded-2xl text-left transition-all relative overflow-hidden group ${pulling === m.name ? 'border-nava-plum bg-nava-plum/5' : 'border-gray-50 bg-gray-50 hover:border-nava-plum/20 hover:bg-white'}`}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-bold text-sm text-gray-900">{m.name}</span>
                          <span className="text-[10px] font-bold text-gray-400">{m.size}</span>
                        </div>
                        <p className="text-[10px] text-gray-500 font-medium">{m.desc}</p>

                        <div className="mt-4 flex items-center justify-between">
                          {pulling === m.name ? (
                            <div className="flex items-center gap-2 text-nava-plum">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span className="text-[10px] font-bold uppercase tracking-widest">{status || 'Starting...'}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-gray-400 group-hover:text-nava-plum transition-colors">
                              <Play className="w-3 h-3" />
                              <span className="text-[10px] font-bold uppercase tracking-widest">Install</span>
                            </div>
                          )}
                        </div>

                        {pulling === m.name && (
                          <motion.div
                            className="absolute bottom-0 left-0 h-1 bg-nava-plum"
                            initial={{ width: 0 }}
                            animate={{ width: status.includes('%') ? status : '100%' }}
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-nava-plum/5 border border-nava-plum/15 p-5 rounded-2xl flex gap-4">
                <Sparkles className="w-5 h-5 text-nava-plum shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="text-sm font-bold text-nava-plum">Also pull the embedding model</p>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    This second model powers the <strong>Local Tutor</strong>'s semantic search — letting it find relevant content across all lessons when you ask it a question. Run:
                  </p>
                  <code className="inline-block bg-white border border-nava-plum/20 text-nava-plum px-3 py-1.5 rounded-lg font-mono text-xs">
                    ollama pull nomic-embed-text
                  </code>
                  <p className="text-xs text-gray-400">We'll cover what embeddings actually are in Week 2 — for now, just install it.</p>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="lm-studio"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h4 className="font-bold flex items-center gap-2 text-gray-900">
                    <Monitor className="w-4 h-4" />
                    1. Get LM Studio
                  </h4>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    Download LM Studio from <a href="https://lmstudio.ai" target="_blank" rel="noreferrer" className="text-nava-plum underline font-medium">lmstudio.ai</a>. 
                  </p>
                </div>
                <div className="space-y-4">
                  <h4 className="font-bold flex items-center gap-2 text-nava-plum">
                    <Play className="w-4 h-4" />
                    2. Enable Local Server
                  </h4>
                  <p className="text-sm text-gray-500 leading-relaxed text-gray-500">
                    1. Load a model. <br/>
                    2. Go to the <b>Local Server</b> tab (↔ icon). <br/>
                    3. Click <b>Start Server</b>.
                  </p>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-100 p-6 rounded-2xl flex gap-4">
                <Database className="w-10 h-10 text-blue-500 shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-blue-900 uppercase tracking-wider text-[10px]">OpenAI Compatibility</p>
                  <p className="text-sm text-blue-800 leading-relaxed">
                    LM Studio runs an OpenAI-compatible API on port 1234. This app will automatically detect any models you have currently loaded in LM Studio's server.
                  </p>
                </div>
              </div>

              <div className="bg-nava-plum/5 border border-nava-plum/15 p-5 rounded-2xl flex gap-4">
                <Sparkles className="w-5 h-5 text-nava-plum shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="text-sm font-bold text-nava-plum">Also load the embedding model</p>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    This second model powers the <strong>Local Tutor</strong>'s semantic search — letting it find relevant content across all lessons when you ask it a question.
                  </p>
                  <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                    <li>In LM Studio, open the <strong>Discover</strong> tab and search for <code className="bg-white border border-nava-plum/20 text-nava-plum px-1.5 py-0.5 rounded font-mono text-xs">nomic-embed-text</code></li>
                    <li>Download <strong>nomic-embed-text-v1.5</strong> and load it in the server alongside your chat model</li>
                  </ol>
                  <p className="text-xs text-gray-400">We'll cover what embeddings actually are in Week 2 — for now, just install it.</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!isActive ? (
          <div className="bg-nava-mint border border-nava-green/20 p-6 rounded-2xl space-y-3">
             <p className="text-sm text-nava-green font-medium">
              We'll automatically detect your local server — Ollama on <code className="bg-nava-mint px-1 rounded">localhost:11434</code> or LM Studio on <code className="bg-nava-mint px-1 rounded">localhost:1234</code>.
            </p>
            <div className="h-1.5 w-full bg-nava-mint rounded-full overflow-hidden">
               <motion.div 
                animate={{ x: ['-100%', '100%'] }}
                transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                className="h-full w-1/3 bg-nava-plum rounded-full"
               />
            </div>
          </div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-center"
          >
            <button
              onClick={onComplete}
              className="flex items-center gap-2 px-12 py-4 bg-green-600 text-white rounded-2xl font-bold hover:bg-green-700 transition-all shadow-lg shadow-green-200"
            >
              Verify Library & Finish
              <ArrowRight className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}

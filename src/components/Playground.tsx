import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send, Terminal, Trash2, ChevronDown, ChevronUp, Bot, User,
  MessageSquare, Zap, Copy, Check, Download, Sparkles
} from 'lucide-react';
import { generateLocalStream, StreamMetrics } from '../services/aiService';
import { LocalModel } from '../services/localProviderService';
import { AIPersona } from '../types';
import { AI_PERSONAS } from '../constants';

interface PlaygroundProps {
  localModels: LocalModel[];
  selectedLocalModel: string;
  selectedPersona: AIPersona;
  isLocalActive: boolean;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  metrics?: StreamMetrics;
}

const SUGGESTED_PROMPTS = [
  { label: 'Grounding', text: 'Explain retrieval-augmented generation (RAG) and when to use it in government services' },
  { label: 'Privacy', text: 'What types of data should never be sent to a cloud AI, and why?' },
  { label: 'Prompting', text: 'Write a system prompt for an AI assistant that helps citizens understand Medicaid eligibility' },
  { label: 'Local AI', text: 'Compare running a model locally vs using a cloud API — pros, cons, and tradeoffs' },
  { label: 'Ethics', text: 'What is automation bias and how should it affect how we design AI workflows in civic tech?' },
  { label: 'Agents', text: 'Explain what an AI agent is and give a concrete example for a government use case' },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
      title="Copy message"
    >
      {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

export default function Playground({ localModels, selectedLocalModel, selectedPersona, isLocalActive }: PlaygroundProps) {
  const persona = AI_PERSONAS.find(p => p.id === selectedPersona) || AI_PERSONAS[0];

  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(persona.promptPrefix);
  const [isSystemPromptOpen, setIsSystemPromptOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevPersonaRef = useRef<AIPersona>(selectedPersona);

  useEffect(() => {
    if (selectedPersona !== prevPersonaRef.current) {
      setSystemPrompt(persona.promptPrefix);
      prevPersonaRef.current = selectedPersona;
    }
  }, [selectedPersona, persona.promptPrefix]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const selectedModelData = localModels.find(m => m.id === selectedLocalModel);

  const handleSend = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? userInput).trim();
    if (!text || isLoading || !isLocalActive || !selectedLocalModel) return;

    if (!overrideText) setUserInput('');
    setIsLoading(true);

    const historySnapshot = messages;
    setMessages(prev => [
      ...prev,
      { role: 'user', content: text },
      { role: 'assistant', content: '' },
    ]);

    const modelData = localModels.find(m => m.id === selectedLocalModel);
    if (!modelData) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: 'Error: selected model not found.' };
        return updated;
      });
      setIsLoading(false);
      return;
    }

    const apiMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...historySnapshot.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: text },
    ];

    try {
      const metrics = await generateLocalStream(modelData.provider, selectedLocalModel, apiMessages, (chunk) => {
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          updated[updated.length - 1] = { ...last, content: last.content + chunk };
          return updated;
        });
      });

      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        updated[updated.length - 1] = { ...last, metrics };
        return updated;
      });
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: `Error: ${err instanceof Error ? err.message : 'Connection to local model failed.'}`,
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  }, [userInput, isLoading, isLocalActive, selectedLocalModel, messages, systemPrompt, localModels]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  const exportConversation = () => {
    const lines = messages.map(m =>
      `**${m.role === 'user' ? 'You' : 'Assistant'}:** ${m.content}`
    );
    const text = `# Playground Export\n\n**System Prompt:** ${systemPrompt}\n\n---\n\n${lines.join('\n\n')}`;
    navigator.clipboard.writeText(text);
  };

  const systemPromptSummary = systemPrompt.length > 80
    ? systemPrompt.slice(0, 80).trimEnd() + '…'
    : systemPrompt;

  const totalTokens = messages.filter(m => m.metrics).reduce((s, m) => s + (m.metrics?.totalTokens ?? 0), 0);
  const turnCount = messages.filter(m => m.role === 'user').length;

  return (
    <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm flex flex-col h-full">
      {/* Header */}
      <div className="bg-gray-900 p-5 text-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-nava-plum rounded-xl flex items-center justify-center">
            <Terminal className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm">Playground</h3>
            <p className="text-[11px] text-gray-400">
              {turnCount > 0
                ? `${turnCount} turn${turnCount !== 1 ? 's' : ''} · ${totalTokens > 0 ? `${totalTokens.toLocaleString()} tokens` : 'no token data'}`
                : 'Free-form chat with your local model'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {selectedModelData && (
            <div className="flex items-center gap-2 bg-gray-800/60 border border-gray-700 rounded-xl px-3 py-1.5">
              <span className="text-[9px] text-gray-500 uppercase font-black tracking-tighter">Model</span>
              <span className="text-xs font-bold text-nava-green truncate max-w-[140px]">{selectedModelData.name}</span>
            </div>
          )}
          {messages.length > 0 && (
            <button
              onClick={exportConversation}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 border border-gray-700 transition-all text-[10px] font-bold uppercase tracking-wider"
              title="Copy conversation as markdown"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
          )}
          <button
            onClick={() => setMessages([])}
            disabled={messages.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-red-900/60 text-gray-400 hover:text-red-300 border border-gray-700 hover:border-red-800 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-gray-800 disabled:hover:text-gray-400 disabled:hover:border-gray-700 transition-all text-[10px] font-bold uppercase tracking-wider"
            title="Clear conversation"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>
      </div>

      {/* Disconnected banner */}
      <AnimatePresence>
        {!isLocalActive && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden shrink-0"
          >
            <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-center gap-2 text-amber-700 text-xs font-semibold">
              <Bot className="w-4 h-4 shrink-0" />
              No local model connected — select one in the header to start chatting.
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* System prompt panel */}
      <div className="border-b border-gray-100 shrink-0">
        <button
          onClick={() => setIsSystemPromptOpen(v => !v)}
          className="w-full flex items-center justify-between px-6 py-3 text-left hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 shrink-0">System Prompt</span>
            {!isSystemPromptOpen && (
              <span className="text-xs text-gray-500 truncate">{systemPromptSummary}</span>
            )}
          </div>
          {isSystemPromptOpen
            ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
            : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
        </button>
        <AnimatePresence>
          {isSystemPromptOpen && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              className="overflow-hidden"
            >
              <div className="px-6 pb-4">
                <textarea
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  rows={4}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs font-mono text-gray-700 focus:ring-2 focus:ring-nava-green focus:border-transparent outline-none transition-all resize-none"
                  placeholder="Enter a system prompt…"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-6 h-full">
            {/* Empty state */}
            <div className="flex flex-col items-center justify-center flex-1 gap-3 text-gray-400 select-none">
              <div className="w-16 h-16 bg-gray-50 rounded-3xl flex items-center justify-center">
                <Sparkles className="w-7 h-7 text-gray-300" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-600">Start a conversation</p>
                <p className="text-xs text-gray-400 mt-1">
                  {selectedModelData ? `Chatting with ${selectedModelData.name}` : 'Connect a local model to begin'}
                </p>
              </div>
            </div>

            {/* Suggested prompts */}
            {isLocalActive && (
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Try a prompt</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SUGGESTED_PROMPTS.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => handleSend(p.text)}
                      className="text-left p-3 bg-gray-50 hover:bg-nava-mint border border-gray-100 hover:border-nava-green/20 rounded-2xl transition-all group"
                    >
                      <span className="text-[10px] font-bold text-nava-plum/60 group-hover:text-nava-green uppercase tracking-wider block mb-1">{p.label}</span>
                      <span className="text-xs text-gray-600 leading-relaxed line-clamp-2">{p.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex items-end gap-2 group ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-nava-plum' : 'bg-gray-100'}`}>
                {msg.role === 'user'
                  ? <User className="w-3.5 h-3.5 text-white" />
                  : <Bot className="w-3.5 h-3.5 text-gray-500" />}
              </div>

              <div className={`flex flex-col gap-1.5 max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={
                  msg.role === 'user'
                    ? 'bg-nava-plum text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed'
                    : 'bg-gray-50 border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 text-sm prose prose-sm max-w-none prose-p:my-1.5 prose-p:text-gray-700 prose-li:my-0.5 prose-li:text-gray-700 prose-headings:text-gray-800 prose-headings:font-bold prose-strong:text-gray-800 prose-code:text-nava-plum prose-code:bg-white prose-code:rounded prose-code:px-1 prose-code:text-xs prose-a:text-nava-plum prose-a:no-underline hover:prose-a:underline prose-pre:bg-gray-900 prose-pre:text-gray-100'
                }>
                  {msg.role === 'assistant' ? (
                    msg.content ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    ) : (
                      <motion.span
                        className="inline-block w-2 h-4 bg-gray-400 rounded-sm align-middle"
                        animate={{ opacity: [1, 0, 1] }}
                        transition={{ repeat: Infinity, duration: 0.9 }}
                      />
                    )
                  ) : (
                    msg.content
                  )}
                </div>

                {/* Action row */}
                <div className={`flex items-center gap-2 px-1 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <CopyButton text={msg.content} />
                  {msg.role === 'assistant' && msg.metrics && (
                    <div className="flex items-center gap-2 text-[10px] text-gray-400 font-mono">
                      <span className="flex items-center gap-1">
                        <Zap className="w-2.5 h-2.5 text-nava-gold" />
                        {msg.metrics.tokensPerSec > 0 ? `${msg.metrics.tokensPerSec} tok/s` : '—'}
                      </span>
                      <span className="text-gray-300">·</span>
                      <span>{(msg.metrics.durationMs / 1000).toFixed(2)}s</span>
                      {msg.metrics.totalTokens > 0 && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span title={`${msg.metrics.promptTokens} prompt + ${msg.metrics.completionTokens} completion`}>
                            {msg.metrics.totalTokens} tokens
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="border-t border-gray-100 p-4 shrink-0">
        <div className="relative">
          <textarea
            value={userInput}
            onChange={e => setUserInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            disabled={!isLocalActive}
            placeholder={isLocalActive ? 'Type a message… (⌘↵ to send)' : 'Connect a local model to chat.'}
            className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 pr-16 text-sm focus:ring-2 focus:ring-nava-green focus:border-transparent outline-none transition-all resize-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={() => handleSend()}
            disabled={isLoading || !userInput.trim() || !isLocalActive}
            className="absolute bottom-4 right-4 p-3 bg-nava-green text-white rounded-xl shadow-lg hover:bg-nava-plum disabled:opacity-50 disabled:grayscale transition-all active:scale-95"
          >
            {isLoading
              ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}><Send className="w-4 h-4" /></motion.div>
              : <Send className="w-4 h-4" />}
          </button>
        </div>
        {messages.length > 0 && (
          <div className="flex items-center justify-between mt-2 px-1">
            <span className="text-[10px] text-gray-400">
              {turnCount} turn{turnCount !== 1 ? 's' : ''}
              {totalTokens > 0 && ` · ${totalTokens.toLocaleString()} total tokens`}
            </span>
            <span className="text-[10px] text-gray-400">⌘↵ to send</span>
          </div>
        )}
      </div>
    </div>
  );
}

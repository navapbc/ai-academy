import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bot, X, Send, Loader2, MessageSquare, Sparkles, Trash2, Search } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { generateLocalStream } from '../services/aiService';
import { embeddingService } from '../services/embeddingService';
import { LocalModel } from '../services/localProviderService';
import { AIPersona, Module } from '../types';
import { AI_PERSONAS } from '../constants';

interface Props {
  isLocalActive: boolean;
  localModels: LocalModel[];
  selectedLocalModel: string;
  selectedPersona: AIPersona;
  currentModule: Module;
  isIndexReady: boolean;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const STARTER_PROMPTS = [
  'Summarize the key takeaways from this lesson',
  'Give me a real-world example of the main concept',
  'What should I know before moving to the next module?',
  'How does this lesson connect to what came before?',
];

export default function LocalTutorFAB({
  isLocalActive,
  localModels,
  selectedLocalModel,
  selectedPersona,
  currentModule,
  isIndexReady,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const persona = AI_PERSONAS.find(p => p.id === selectedPersona) || AI_PERSONAS[0];
  const selectedModelData = localModels.find(m => m.id === selectedLocalModel);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 150);
  }, [isOpen]);

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || isLoading || !isLocalActive || !selectedLocalModel) return;

    setInput('');
    setIsLoading(true);

    const historySnapshot = messages;
    setMessages(prev => [
      ...prev,
      { role: 'user', content: text },
      { role: 'assistant', content: '' },
    ]);

    const modelData = localModels.find(m => m.id === selectedLocalModel);
    if (!modelData) { setIsLoading(false); return; }

    // Always ground the model in the current lesson. When the index is ready,
    // also inject cross-lesson chunks so questions like "what came before?" work.
    const currentContent = currentModule.content || '';
    let systemPrompt: string;

    if (isIndexReady) {
      try {
        const chunks = await embeddingService.search(text, modelData.provider, 5);
        // Only surface chunks from *other* lessons — the current lesson is already
        // included in full below, so same-lesson hits would just be duplicates.
        const crossLessonChunks = chunks.filter(c => c.lessonId !== currentModule.id);

        systemPrompt = buildLessonSystemPrompt(persona.promptPrefix, currentModule.title, currentContent, crossLessonChunks);
      } catch {
        systemPrompt = buildLessonSystemPrompt(persona.promptPrefix, currentModule.title, currentContent);
      }
    } else {
      systemPrompt = buildLessonSystemPrompt(persona.promptPrefix, currentModule.title, currentContent);
    }

    const apiMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...historySnapshot.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: text },
    ];

    try {
      await generateLocalStream(modelData.provider, selectedLocalModel, apiMessages, (chunk) => {
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          updated[updated.length - 1] = { ...last, content: last.content + chunk };
          return updated;
        });
      });
    } catch {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: 'Error connecting to local model.' };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="w-[400px] bg-white rounded-3xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden"
            style={{ height: '540px' }}
          >
            {/* Header */}
            <div className="bg-gray-900 px-5 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-nava-green rounded-xl flex items-center justify-center shadow-lg shadow-nava-green/30">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-white text-sm font-bold">Local Tutor</p>
                  <p className="text-gray-400 text-[10px] truncate max-w-[180px]">{currentModule.title}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Semantic search status badge */}
                {isLocalActive && (
                  <span className={`flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-lg border uppercase tracking-wider ${
                    isIndexReady
                      ? 'text-nava-green bg-nava-green/10 border-nava-green/20'
                      : 'text-gray-500 bg-gray-800 border-gray-700'
                  }`}>
                    <Search className="w-2.5 h-2.5" />
                    {isIndexReady ? 'Semantic' : 'Indexing…'}
                  </span>
                )}
                {selectedModelData && (
                  <span className="text-[9px] font-bold text-gray-400 bg-gray-800 px-2 py-1 rounded-lg border border-gray-700 uppercase tracking-wider">
                    {selectedModelData.name.split(':')[0]}
                  </span>
                )}
                {messages.length > 0 && (
                  <button
                    onClick={() => setMessages([])}
                    className="p-1.5 text-gray-500 hover:text-red-400 transition-colors rounded-lg hover:bg-white/10"
                    title="Clear conversation"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-gray-500 hover:text-white transition-colors rounded-lg hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
              {messages.length === 0 ? (
                <div className="flex flex-col gap-4 h-full">
                  <div className="flex flex-col items-center justify-center flex-1 gap-2 text-gray-400">
                    <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center">
                      <MessageSquare className="w-5 h-5 opacity-40" />
                    </div>
                    <p className="text-xs font-medium text-center text-gray-500">
                      {isIndexReady
                        ? 'Ask anything — searches across all lessons.'
                        : 'Ask anything about this lesson.'}
                      <br />
                      <span className="text-gray-400">All processing stays on your machine.</span>
                    </p>
                  </div>
                  {isLocalActive && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">Suggested</p>
                      {STARTER_PROMPTS.map((prompt) => (
                        <button
                          key={prompt}
                          onClick={() => handleSend(prompt)}
                          className="w-full text-left text-xs text-gray-600 bg-gray-50 hover:bg-nava-mint hover:text-nava-green border border-gray-100 hover:border-nava-green/20 rounded-xl px-3 py-2.5 transition-all"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={
                      msg.role === 'user'
                        ? 'bg-nava-plum text-white rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-sm max-w-[88%]'
                        : 'bg-gray-50 border border-gray-100 rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm max-w-[88%] prose prose-sm max-w-none prose-p:my-1 prose-p:text-gray-700 prose-li:my-0.5 prose-headings:text-gray-800 prose-code:text-nava-plum prose-code:bg-white prose-code:rounded prose-code:px-1 prose-code:text-xs'
                    }>
                      {msg.role === 'assistant' ? (
                        msg.content ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        ) : (
                          <motion.span
                            className="inline-block w-1.5 h-4 bg-gray-400 rounded-sm align-middle"
                            animate={{ opacity: [1, 0, 1] }}
                            transition={{ repeat: Infinity, duration: 0.9 }}
                          />
                        )
                      ) : (
                        msg.content
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-gray-100 p-3 shrink-0">
              {!isLocalActive ? (
                <p className="text-xs text-amber-600 text-center py-2 font-medium">
                  Connect a local model in the header to chat
                </p>
              ) : (
                <div className="relative">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                    }}
                    placeholder={isIndexReady ? 'Ask anything across all lessons…' : 'Ask about this lesson…'}
                    rows={2}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 pr-12 text-sm focus:ring-2 focus:ring-nava-green focus:border-transparent outline-none resize-none"
                  />
                  <button
                    onClick={() => handleSend()}
                    disabled={isLoading || !input.trim()}
                    className="absolute bottom-2.5 right-2.5 p-2 bg-nava-green text-white rounded-lg hover:bg-nava-plum disabled:opacity-40 transition-all active:scale-95"
                  >
                    {isLoading
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Send className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB button */}
      <motion.button
        onClick={() => setIsOpen(v => !v)}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        className={`relative w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl transition-colors ${
          isOpen ? 'bg-gray-800 shadow-gray-900/30' : 'bg-nava-green hover:bg-nava-plum shadow-nava-green/40'
        }`}
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <X className="w-6 h-6 text-white" />
            </motion.div>
          ) : (
            <motion.div key="open" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <Bot className="w-6 h-6 text-white" />
            </motion.div>
          )}
        </AnimatePresence>
        {isLocalActive && !isOpen && (
          <span className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm ${
            isIndexReady ? 'bg-nava-green' : 'bg-amber-400'
          }`} />
        )}
      </motion.button>
    </div>
  );
}

function buildLessonSystemPrompt(
  personaPrefix: string,
  lessonTitle: string,
  content: string,
  crossLessonChunks: import('../services/embeddingService').IndexedChunk[] = [],
): string {
  const parts = [personaPrefix];

  parts.push(
    content
      ? `\n\nYou are helping someone study the lesson "${lessonTitle}". Here is the full lesson content:\n\n${content}`
      : `\n\nYou are a helpful tutor for the lesson "${lessonTitle}".`
  );

  if (crossLessonChunks.length > 0) {
    const block = crossLessonChunks.map(c => c.text).join('\n\n---\n\n');
    parts.push(`\n\nRELATED CONTENT FROM OTHER LESSONS (for cross-lesson questions):\n\n${block}`);
  }

  parts.push('\n\nAnswer concisely and directly. When the question is about "this lesson", refer to the current lesson above. Use the related content for context about what came before or what comes next.');

  return parts.join('');
}

import { useMemo, useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bot, X, Sparkles, Send } from 'lucide-react';
import { streamChat, type ChatMessage } from '../lib/llm';
import { AIPersona, Module, Phase } from '../types';
import { useDialogA11y } from '../lib/useDialogA11y';
import PiiNotice from './PiiNotice';

interface Props {
  selectedPersona: AIPersona;
  currentModule: Module;
  // The runtime curriculum (content-as-data). The tutor grounds its answers in
  // this — no embeddings, no vector index (X.1, Option 1). Sourced from the
  // fetched `phases` rather than a static import, since the static PHASES seed
  // was removed when the curriculum moved to the DB (DEAD-02).
  phases: Phase[];
}

/**
 * Builds the grounding corpus from the loaded curriculum: for every PUBLISHED
 * module a header line ("[Section …] Cell {id} — {title}") followed by its authored
 * `content` and, when present, its `tutorReference` (R7) — concatenated into one
 * string handed to Claude as the cached system context. The corpus only changes
 * when the curriculum changes.
 *
 * Grounding is filtered to status='published' so the tutor never quotes an
 * in-progress draft or an `in_review` cell (P5.4-1; this also closes the prior
 * latent leak where the tutor grounded on non-published `body_md`).
 */
export function buildGroundingContext(phases: Phase[]): string {
  return phases
    .flatMap((phase) =>
      phase.modules
        .filter((m) => m.status === 'published')
        .map((m) => {
          const reference = m.tutorReference
            ? `\n\n[Tutor reference for Cell ${m.id}]\n${m.tutorReference}`
            : '';
          // U13: the grouping label is a curriculum SECTION (course week /
          // Supplemental coursework / Resources) since the restructure.
          return `[Section ${phase.title}] Cell ${m.id} — ${m.title}\n${m.content}${reference}`;
        }),
    )
    .join('\n\n');
}

export default function LocalTutorFAB({ currentModule, phases }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Cancels the in-flight stream on unmount (LLM-05).
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  // Accessible dialog plumbing for the popover (A11Y-02): focus move-in, Escape,
  // focus trap + restore.
  const dialogRef = useDialogA11y<HTMLDivElement>(isOpen, () => setIsOpen(false));

  // The corpus only changes when the curriculum changes; the resulting system
  // prefix is identical across questions, so Anthropic's prompt cache hits on
  // every follow-up (the Edge Function sends `system` with a cache_control
  // breakpoint — see chat-core.buildSystemBlocks).
  const groundingContext = useMemo(() => buildGroundingContext(phases), [phases]);

  const system = useMemo(
    () =>
      'You are the Nava AI Academy study buddy. Answer the learner\'s question ' +
      'using ONLY the curriculum content below. If the answer isn\'t covered, ' +
      'say you\'re not sure and point them to the most relevant cell by id and ' +
      'title. Be concise and friendly. The learner is currently on cell ' +
      `${currentModule.id} — ${currentModule.title}.\n\n` +
      `=== CURRICULUM ===\n${groundingContext}`,
    [groundingContext, currentModule.id, currentModule.title],
  );

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  };

  const handleSend = async () => {
    const question = input.trim();
    if (!question || isLoading) return;

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: question }];
    setMessages(nextMessages);
    setInput('');
    setStreaming('');
    setIsLoading(true);
    scrollToBottom();

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let answer = '';
    try {
      // Multi-turn: send the running history so follow-ups have context. The
      // cached system block carries the curriculum.
      await streamChat(nextMessages, { system, signal: controller.signal }, (chunk) => {
        answer += chunk;
        setStreaming(answer);
        scrollToBottom();
      });
      setMessages([...nextMessages, { role: 'assistant', content: answer }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request to Claude failed.';
      setMessages([...nextMessages, { role: 'assistant', content: `Error: ${message}` }]);
    } finally {
      setStreaming('');
      setIsLoading(false);
      scrollToBottom();
    }
  };

  const isEmpty = messages.length === 0 && !isLoading;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-label="Study buddy"
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
                  <Sparkles className="w-4 h-4 text-white" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-white text-sm font-bold">Study buddy</p>
                  <p className="text-gray-400 text-[10px] truncate max-w-[180px]">
                    Cell {currentModule.id} — {currentModule.title}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Close study buddy"
                className="p-1.5 text-gray-500 hover:text-white transition-colors rounded-lg hover:bg-white/10"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
              aria-live="polite"
              aria-busy={isLoading}
            >
              {isEmpty && (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6">
                  <div className="w-12 h-12 bg-nava-green/10 rounded-2xl flex items-center justify-center">
                    <Bot className="w-5 h-5 text-nava-green" aria-hidden="true" />
                  </div>
                  <p className="text-xs font-semibold text-gray-600 leading-relaxed">
                    Ask me anything about the curriculum. I answer using only the
                    Academy&apos;s content — and point you to the right cell when I&apos;m not sure.
                  </p>
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-nava-green text-white rounded-br-sm'
                        : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}

              {/* In-flight assistant answer */}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap bg-gray-100 text-gray-800">
                    {streaming || (
                      <span className="inline-flex items-center gap-1.5 text-gray-500 italic">
                        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                        </motion.div>
                        Thinking…
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Composer */}
            <div className="border-t border-gray-100 p-3 shrink-0 space-y-2">
              <PiiNotice />
              <div className="flex items-end gap-2 bg-gray-50 border border-gray-200 rounded-2xl p-2 focus-within:ring-2 focus-within:ring-nava-green focus-within:border-transparent transition-all">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  rows={1}
                  aria-label="Ask the study buddy"
                  placeholder="Ask about the curriculum…"
                  className="flex-1 bg-transparent border-none outline-none resize-none text-sm px-1.5 py-1 max-h-24"
                />
                <button
                  onClick={handleSend}
                  disabled={isLoading || !input.trim()}
                  aria-label="Send"
                  className="w-9 h-9 shrink-0 bg-nava-green text-white rounded-xl flex items-center justify-center hover:bg-nava-plum disabled:opacity-40 disabled:grayscale transition-all active:scale-95"
                >
                  <Send className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB button */}
      <motion.button
        onClick={() => setIsOpen(v => !v)}
        aria-label={isOpen ? 'Close study buddy' : 'Open study buddy'}
        aria-expanded={isOpen}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        className={`relative w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl transition-colors ${
          isOpen ? 'bg-gray-800 shadow-gray-900/30' : 'bg-nava-plum hover:opacity-90 shadow-nava-plum/40'
        }`}
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <X className="w-6 h-6 text-white" aria-hidden="true" />
            </motion.div>
          ) : (
            <motion.div key="open" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <Bot className="w-6 h-6 text-white" aria-hidden="true" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bot, X, Sparkles } from 'lucide-react';
import { AIPersona, Module } from '../types';
import { useDialogA11y } from '../lib/useDialogA11y';

interface Props {
  selectedPersona: AIPersona;
  currentModule: Module;
}

export default function LocalTutorFAB({ currentModule }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useDialogA11y<HTMLDivElement>(isOpen, () => setIsOpen(false));

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-label="Tutor"
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
                  <p className="text-white text-sm font-bold">Tutor</p>
                  <p className="text-gray-500 text-[10px] truncate max-w-[180px]">{currentModule.title}</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Close tutor"
                className="p-1.5 text-gray-500 hover:text-white transition-colors rounded-lg hover:bg-white/10"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {/* Placeholder */}
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-gray-500" />
              </div>
              <p className="text-xs font-semibold text-gray-600">
                AI features are being reconnected to Claude — available in the next step.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB button */}
      <motion.button
        onClick={() => setIsOpen(v => !v)}
        aria-label={isOpen ? 'Close tutor' : 'Open tutor'}
        aria-expanded={isOpen}
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
      </motion.button>
    </div>
  );
}

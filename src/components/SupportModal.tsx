import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Bug, AlertCircle } from 'lucide-react';
import { useDialogA11y } from '../lib/useDialogA11y';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SupportModal({ isOpen, onClose }: SupportModalProps) {
  const [description, setDescription] = useState('');
  const [touched, setTouched] = useState(false);
  const dialogRef = useDialogA11y<HTMLDivElement>(isOpen, onClose);

  const isValid = description.trim().length > 10;
  const showWarning = touched && !isValid;

  const githubUrl = `https://github.com/navapbc/ai-literacy-sprint/issues/new?body=${encodeURIComponent(description)}`;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-nava-plum/40 backdrop-blur-sm"
          />
          
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="support-modal-title"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100"
            id="support-modal"
          >
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-nava-mint flex items-center justify-center text-nava-green">
                    <Bug className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 id="support-modal-title" className="text-xl font-bold text-nava-plum">Report an Issue</h2>
                    <p className="text-sm text-gray-500">Help us improve the sprint experience</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close dialog"
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-600"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-500 shrink-0" />
                  <p className="text-sm text-blue-700 leading-relaxed">
                    Please provide a brief description before continuing to GitHub. This helps us categorize and resolve issues faster.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="support-desc" className="text-sm font-bold text-gray-700">Description</label>
                    {showWarning && (
                      <span id="support-desc-warning" role="alert" className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Too short (min 10 chars)</span>
                    )}
                  </div>
                  <textarea
                    id="support-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onBlur={() => setTouched(true)}
                    aria-invalid={showWarning}
                    aria-describedby={showWarning ? 'support-desc-warning' : undefined}
                    className={`w-full bg-gray-50 border-2 rounded-xl px-4 py-3 h-32 focus:ring-2 outline-none transition-all resize-none text-sm ${showWarning ? 'border-red-100 focus:ring-red-200' : 'border-gray-50 focus:ring-nava-green'}`}
                    placeholder="Describe the bug or share your feedback..."
                  />
                </div>
              </div>

              <div className="mt-8 flex gap-3">
                {isValid ? (
                  <a
                    href={githubUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg bg-gray-900 text-white hover:bg-black shadow-black/10"
                  >
                    <Send className="w-4 h-4" aria-hidden="true" />
                    GitHub Issue
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    aria-describedby="support-desc-warning"
                    className="flex-1 font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all bg-gray-100 text-gray-500 cursor-not-allowed shadow-none"
                  >
                    <Send className="w-4 h-4" aria-hidden="true" />
                    GitHub Issue
                  </button>
                )}
                <button 
                  onClick={onClose}
                  className="flex-1 bg-white border-2 border-gray-100 text-gray-600 font-bold py-4 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

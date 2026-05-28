import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Bug, AlertCircle } from 'lucide-react';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SupportModal({ isOpen, onClose }: SupportModalProps) {
  const [description, setDescription] = useState('');
  const [touched, setTouched] = useState(false);

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
                    <h2 className="text-xl font-bold text-nava-plum">Report an Issue</h2>
                    <p className="text-sm text-gray-500">Help us improve the sprint experience</p>
                  </div>
                </div>
                <button 
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
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
                    <label className="text-sm font-bold text-gray-700">Description</label>
                    {showWarning && (
                      <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Too short (min 10 chars)</span>
                    )}
                  </div>
                  <textarea 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onBlur={() => setTouched(true)}
                    className={`w-full bg-gray-50 border-2 rounded-xl px-4 py-3 h-32 focus:ring-2 outline-none transition-all resize-none text-sm ${showWarning ? 'border-red-100 focus:ring-red-200' : 'border-gray-50 focus:ring-nava-green'}`}
                    placeholder="Describe the bug or share your feedback..."
                  />
                </div>
              </div>

              <div className="mt-8 flex gap-3">
                <a 
                  href={isValid ? githubUrl : '#'}
                  target={isValid ? "_blank" : "_self"}
                  rel="noreferrer"
                  onClick={(e) => {
                    if (!isValid) {
                      e.preventDefault();
                      setTouched(true);
                    }
                  }}
                  className={`flex-1 font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg ${isValid ? 'bg-gray-900 text-white hover:bg-black shadow-black/10' : 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'}`}
                >
                  <Send className="w-4 h-4" />
                  GitHub Issue
                </a>
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

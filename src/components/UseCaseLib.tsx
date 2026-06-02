import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Copy, BookOpen, UserCheck, MessageSquare, CheckCircle, Sparkles } from 'lucide-react';

const USE_CASES = [
  {
    title: 'Benefits Document Summarizer',
    icon: <BookOpen className="w-5 h-5" />,
    description: 'Transform complex legal jargon into scannable summaries for claimants.',
    prompt: 'Summarize the following benefits eligibility document into 3 bullet points using an 8th-grade reading level. Avoid jargon for words like "assets" or "eligibility".'
  },
  {
    title: 'Plain Language Checker',
    icon: <UserCheck className="w-5 h-5" />,
    description: 'Audit internal communications for accessibility and empathy.',
    prompt: 'Analyze this email for "administrative burden". Identify 3 places where the language is too complex or lacks empathy for the user experience.'
  },
  {
    title: 'Synthetic User Personas',
    icon: <MessageSquare className="w-5 h-5" />,
    description: 'Generate feedback from the perspective of a specific user group.',
    prompt: 'Act as a caseworker with 20 years of experience. Critique this new intake form flow. What would be the biggest pain point for a first-time applicant?'
  }
];

export default function UseCaseLib({ onComplete }: { onComplete: () => void }) {
  const [featuredIdx, setFeaturedIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFeaturedIdx(prev => (prev + 1) % USE_CASES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="space-y-12" id="use-case-lib">
      <div className="bg-gray-900 rounded-3xl p-8 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-nava-plum/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl group-hover:bg-nava-plum/20 transition-all" />
        <div className="relative z-10 space-y-6">
          <div className="flex items-center gap-2 text-nava-gold font-bold text-[10px] uppercase tracking-widest">
            <Sparkles className="w-4 h-4" />
            Featured Pattern
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={featuredIdx}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <h3 className="text-2xl font-bold text-white">{USE_CASES[featuredIdx].title}</h3>
              <p className="text-gray-500 text-sm max-w-xl leading-relaxed">{USE_CASES[featuredIdx].description}</p>
              <div className="flex items-center gap-4 pt-2">
                <button 
                  onClick={() => copyToClipboard(USE_CASES[featuredIdx].prompt)}
                  className="bg-white text-gray-900 px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-nava-gold transition-all shadow-lg active:scale-95"
                >
                  <Copy className="w-4 h-4" />
                  Copy Featured Prompt
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {USE_CASES.map((useCase, idx) => (
          <div key={idx} className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all group">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-nava-mint rounded-xl flex items-center justify-center text-nava-green group-hover:bg-nava-plum group-hover:text-white transition-all">
                {useCase.icon}
              </div>
              <h4 className="font-bold text-gray-900">{useCase.title}</h4>
            </div>
            <p className="text-sm text-gray-500 mb-6 group-hover:text-gray-700 transition-all">
              {useCase.description}
            </p>
            <div className="relative">
              <div className="bg-gray-50 rounded-xl p-4 pr-12 text-[10px] font-mono text-gray-500 line-clamp-3">
                {useCase.prompt}
              </div>
              <button 
                onClick={() => copyToClipboard(useCase.prompt)}
                className="absolute top-2 right-2 p-2 hover:bg-gray-200 rounded-lg text-gray-500 hover:text-gray-600 transition-all"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-center pt-8 border-t border-gray-100">
        <button
          onClick={onComplete}
          className="flex items-center gap-2 px-12 py-4 bg-nava-green text-white rounded-2xl font-bold hover:bg-nava-plum transition-all shadow-lg shadow-nava-green/20"
        >
          I've explored the library
          <CheckCircle className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

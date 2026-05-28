import { FlaskConical, Sparkles } from 'lucide-react';
import { AIPersona } from '../types';

interface PromptLabProps {
  onComplete: () => void;
  selectedPersona: AIPersona;
}

export default function PromptLab(_props: PromptLabProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm flex flex-col" id="prompt-lab">
      <div className="bg-gray-900 p-6 text-white flex items-center gap-3">
        <div className="w-10 h-10 bg-nava-plum rounded-xl flex items-center justify-center">
          <FlaskConical className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold">Prompt Lab: Grounding Exercises</h3>
          <p className="text-xs text-gray-400">Master the art of providing context to models.</p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
        <div className="w-16 h-16 bg-gray-50 rounded-3xl flex items-center justify-center">
          <Sparkles className="w-7 h-7 text-gray-300" />
        </div>
        <p className="text-sm font-semibold text-gray-600 max-w-sm">
          AI features are being reconnected to Claude — available in the next step.
        </p>
      </div>
    </div>
  );
}

import { Terminal, Sparkles } from 'lucide-react';
import { AIPersona } from '../types';

interface PlaygroundProps {
  selectedPersona: AIPersona;
}

export default function Playground(_props: PlaygroundProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm flex flex-col h-full">
      {/* Header */}
      <div className="bg-gray-900 p-5 text-white flex items-center gap-3 shrink-0">
        <div className="w-9 h-9 bg-nava-plum rounded-xl flex items-center justify-center">
          <Terminal className="w-4 h-4" />
        </div>
        <div>
          <h3 className="font-bold text-sm">Playground</h3>
          <p className="text-[11px] text-gray-400">Free-form chat — reconnecting to Claude</p>
        </div>
      </div>

      {/* Placeholder */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
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

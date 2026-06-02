import { motion } from 'motion/react';
import { Lock, ArrowRight } from 'lucide-react';

interface Props {
  completed: number;
  total: number;
  /** Selects the first incomplete Stage-1a module; disabled if there's nowhere to go. */
  onGoToStage1a: () => void;
  canGoToStage1a: boolean;
}

// Defense-in-depth gate (P3.11): shown instead of a Stage-2 lesson/exercise/quiz
// when the current module is locked. The Sidebar already prevents selecting a
// locked module, but resolveCurrentModuleId could still land here (e.g. a stale
// cursor), so the content view never renders a locked module's body.
export default function LockedNotice({ completed, total, onGoToStage1a, canGoToStage1a }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex justify-center pt-8"
    >
      <div className="max-w-md w-full bg-white border-2 border-nava-mint rounded-3xl p-8 text-center space-y-5 shadow-sm">
        <div className="w-14 h-14 bg-nava-mint rounded-2xl flex items-center justify-center text-nava-green mx-auto">
          <Lock className="w-7 h-7" />
        </div>
        <div className="space-y-2">
          <h2 className="font-bold text-xl text-nava-plum">Stage 2 is locked</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            Finish Stage 1a first — you&apos;ve completed{' '}
            <span className="font-bold tabular-nums">{completed}</span> of{' '}
            <span className="font-bold tabular-nums">{total}</span>.
          </p>
        </div>
        <button
          onClick={onGoToStage1a}
          disabled={!canGoToStage1a}
          className="inline-flex items-center gap-2 px-8 py-3 bg-nava-green hover:bg-nava-plum text-white rounded-xl font-bold shadow-lg shadow-nava-mint disabled:opacity-50 transition-all active:scale-95"
        >
          Go to Stage 1a
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BarChart3, X, CheckCircle2, LifeBuoy, Terminal } from 'lucide-react';
import { Phase, UserProgress } from '../../types';
import { isModuleLive } from '../../lib/modules';
import { BRANDING } from '../../branding';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  phases: Phase[];
  progress: UserProgress;
  onModuleSelect: (id: string) => void;
  overallProgress: number;
  onOpenSupport: () => void;
  activeView: 'learning' | 'playground';
  onViewChange: (view: 'learning' | 'playground') => void;
}

export default function Sidebar({ isOpen, onClose, phases, progress, onModuleSelect, overallProgress, onOpenSupport, activeView, onViewChange }: SidebarProps) {
  const completed = new Set(progress.completedModuleIds);
  const totalModules = phases.reduce((n, p) => n + p.modules.length, 0);
  // Count only completed ids that are still in the curriculum, so the headline
  // count can't exceed the total.
  const completedCount = phases.reduce(
    (n, p) => n + p.modules.filter(m => completed.has(m.id)).length,
    0,
  );
  // "Soon" badge tracks which cells are still stubs — derived from the fetched
  // content, so an edited row drops its badge with no code change.
  const liveModuleIds = useMemo(
    () => new Set(phases.flatMap(p => p.modules).filter(isModuleLive).map(m => m.id)),
    [phases],
  );

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.aside 
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 320, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          className="border-r border-gray-200 bg-white flex flex-col z-20 h-full"
          id="sidebar"
        >
          <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-nava-green" />
              <h1 className="font-bold text-xl tracking-tight">{BRANDING.name}</h1>
            </div>
            <button 
              onClick={onClose}
              className="lg:hidden p-2 hover:bg-gray-100 rounded-lg text-gray-400"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-4 px-3 space-y-8">
            {/* Playground */}
            <div className="px-3 pb-2">
              <button
                onClick={() => onViewChange('playground')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all
                  ${activeView === 'playground'
                    ? 'bg-nava-mint text-nava-green border-l-4 border-nava-green shadow-sm font-bold'
                    : 'hover:bg-gray-50 text-gray-600'
                  }`}
              >
                <Terminal className="w-4 h-4 shrink-0" />
                <span className="text-xs font-medium">Playground</span>
              </button>
            </div>

            <div className="px-3 pb-2">
              <button
                onClick={() => onViewChange('learning')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all
                  ${activeView === 'learning'
                    ? 'bg-nava-mint text-nava-green border-l-4 border-nava-green shadow-sm font-bold'
                    : 'hover:bg-gray-50 text-gray-600'
                  }`}
              >
                <BarChart3 className="w-4 h-4 shrink-0" />
                <span className="text-xs font-medium">Learning</span>
              </button>
            </div>

            <div className="border-t border-gray-100 my-2 mx-3" />

            {phases.map((phase) => {
              const phaseCompleted = phase.modules.filter(m => completed.has(m.id)).length;
              return (
              <div key={phase.id} className="space-y-2">
                <div className="px-3 mb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-nava-green tracking-widest uppercase">{phase.week}</span>
                    <span className="text-[10px] font-bold tabular-nums text-gray-400">{phaseCompleted}/{phase.modules.length}</span>
                  </div>
                  <h2 className="font-semibold text-sm text-gray-900">{phase.title}</h2>
                </div>

                <div className="space-y-0.5">
                  {phase.modules.map((module) => {
                    const isCompleted = progress.completedModuleIds.includes(module.id);
                    const isActive = progress.currentModuleId === module.id;

                    return (
                      <button
                        key={module.id}
                        onClick={() => onModuleSelect(module.id)}
                        className={`
                          w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all group cursor-pointer
                          ${isActive ? 'bg-nava-mint text-nava-green border-l-4 border-nava-green shadow-sm' : 'hover:bg-gray-50 text-gray-600'}
                        `}
                        id={`module-${module.id}`}
                      >
                        <div className={`
                          flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center border transition-colors
                          ${isCompleted ? 'bg-nava-green border-nava-green' : 'border-gray-300 group-hover:border-nava-green/30'}
                        `}>
                          {isCompleted ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                          ) : (
                            <div className="w-1.5 h-1.5 rounded-full bg-transparent group-hover:bg-nava-green/20" />
                          )}
                        </div>
                        <span className="flex-shrink-0 text-[10px] font-bold tabular-nums text-gray-400 w-7">{module.id}</span>
                        <span className={`flex-1 min-w-0 text-xs font-medium truncate ${isActive ? 'font-bold' : ''}`}>
                          {module.title}
                        </span>
                        {!liveModuleIds.has(module.id) && (
                          <span className="flex-shrink-0 text-[9px] font-bold uppercase tracking-wide text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5">
                            Soon
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              );
            })}
          </div>

          <div className="p-4 border-t border-gray-100 bg-gray-50/50 space-y-4">
            <div>
              <div className="flex items-center justify-between text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                <span>Your Training</span>
                <span>{overallProgress}%</span>
              </div>
              <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${overallProgress}%` }}
                  className="h-full bg-nava-plum"
                />
              </div>
              <p className="mt-2 text-[11px] font-medium text-gray-500 tabular-nums">
                {completedCount} of {totalModules} complete
              </p>
            </div>

            <button 
              onClick={onOpenSupport}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-bold text-gray-400 hover:bg-white hover:text-gray-600 transition-all border border-transparent hover:border-gray-200 shadow-sm"
              id="report-issue-btn"
            >
              <LifeBuoy className="w-3.5 h-3.5" />
              Report an issue
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

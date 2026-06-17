import { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BarChart3, X, CheckCircle2, LifeBuoy, Terminal, Lock, ShieldCheck, GraduationCap } from 'lucide-react';
import { Phase, UserProgress, View } from '../../types';
import { isModuleLive } from '../../lib/modules';
import { isModuleLocked } from '../../lib/gating';
import { BRANDING } from '../../branding';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  phases: Phase[];
  progress: UserProgress;
  onModuleSelect: (id: string) => void;
  overallProgress: number;
  onOpenSupport: () => void;
  activeView: View;
  onViewChange: (view: View) => void;
  /** Whether the signed-in user is a champion/admin — gates the Staff entry (P5.1d). */
  isStaff: boolean;
  /** Stage gating (P3.11): whether all of Stage 1a is complete (unlocks Stage 2). */
  stage1aDone: boolean;
  stage1aCompleted: number;
  stage1aTotal: number;
}

export default function Sidebar({ isOpen, onClose, phases, progress, onModuleSelect, overallProgress, onOpenSupport, activeView, onViewChange, isStaff, stage1aDone, stage1aCompleted, stage1aTotal }: SidebarProps) {
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
              <BarChart3 className="w-6 h-6 text-nava-green" aria-hidden="true" />
              {/* A logo/wordmark, not the page heading — kept out of the heading
                  outline so the lesson title is the single page-level h1 (A11Y-09). */}
              <span className="font-bold text-xl tracking-tight">{BRANDING.name}</span>
            </div>
            <button
              onClick={onClose}
              aria-label="Close menu"
              className="lg:hidden p-2 hover:bg-gray-100 rounded-lg text-gray-500"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          <nav aria-label="Course navigation" className="flex-1 overflow-y-auto py-4 px-3 space-y-8">
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

            {/* My progress (P5.3a): the learner self-view dashboard — own progress,
                scores, and lab status. Available to everyone (no role gate). */}
            <div className="px-3 pb-2">
              <button
                onClick={() => onViewChange('progress')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all
                  ${activeView === 'progress'
                    ? 'bg-nava-mint text-nava-green border-l-4 border-nava-green shadow-sm font-bold'
                    : 'hover:bg-gray-50 text-gray-600'
                  }`}
              >
                <GraduationCap className="w-4 h-4 shrink-0" />
                <span className="text-xs font-medium">My progress</span>
              </button>
            </div>

            {/* Staff area (P5.1d): only champions/admins ever see this entry, so
                a learner has no path to the gated view. The RoleGuard on the
                view is the backstop if the state is reached some other way. */}
            {isStaff && (
              <div className="px-3 pb-2">
                <button
                  onClick={() => onViewChange('staff')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all
                    ${activeView === 'staff'
                      ? 'bg-nava-mint text-nava-green border-l-4 border-nava-green shadow-sm font-bold'
                      : 'hover:bg-gray-50 text-gray-600'
                    }`}
                >
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span className="text-xs font-medium">Staff</span>
                </button>
              </div>
            )}

            <div className="border-t border-gray-100 my-2 mx-3" />

            {phases.map((phase) => {
              const phaseCompleted = phase.modules.filter(m => completed.has(m.id)).length;
              // A phase is locked when all of its modules are gated (i.e. Stage 2
              // before Stage 1a is done). Stage 1a/1b never lock.
              const phaseLocked =
                phase.modules.length > 0 &&
                phase.modules.every(m => isModuleLocked(m, stage1aDone));
              return (
              <div key={phase.id} className="space-y-2">
                <div className="px-3 mb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-nava-green tracking-widest uppercase">{phase.week}</span>
                    <span className="text-[10px] font-bold tabular-nums text-gray-500">{phaseCompleted}/{phase.modules.length}</span>
                  </div>
                  <h2 className="font-semibold text-sm text-gray-900">{phase.title}</h2>
                  {phaseLocked && (
                    <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-gray-500">
                      <Lock className="w-3 h-3 shrink-0" />
                      Locked — complete Stage 1a ({stage1aCompleted}/{stage1aTotal}) to unlock
                    </p>
                  )}
                </div>

                <div className="space-y-0.5">
                  {phase.modules.map((module) => {
                    const isCompleted = progress.completedModuleIds.includes(module.id);
                    const isActive = progress.currentModuleId === module.id;
                    const locked = isModuleLocked(module, stage1aDone);

                    // Locked Stage-2 rows render as a non-interactive, muted row
                    // with a Lock icon — not a button, so they can't be selected.
                    if (locked) {
                      return (
                        <div
                          key={module.id}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-gray-500 cursor-not-allowed select-none"
                          id={`module-${module.id}`}
                          aria-disabled="true"
                        >
                          <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center border border-gray-200">
                            <Lock className="w-3 h-3 text-gray-500" />
                          </div>
                          <span className="flex-shrink-0 text-[10px] font-bold tabular-nums text-gray-500 w-7">{module.id}</span>
                          <span className="flex-1 min-w-0 text-xs font-medium truncate">{module.title}</span>
                        </div>
                      );
                    }

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
                        <span className="flex-shrink-0 text-[10px] font-bold tabular-nums text-gray-500 w-7">{module.id}</span>
                        <span className={`flex-1 min-w-0 text-xs font-medium truncate ${isActive ? 'font-bold' : ''}`}>
                          {module.title}
                        </span>
                        {!liveModuleIds.has(module.id) && (
                          <span className="flex-shrink-0 text-[9px] font-bold uppercase tracking-wide text-gray-500 bg-gray-100 rounded-full px-1.5 py-0.5">
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
          </nav>

          <div className="p-4 border-t border-gray-100 bg-gray-50/50 space-y-4">
            <div>
              <div className="flex items-center justify-between text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                <span>Your Training</span>
                <span>{overallProgress}%</span>
              </div>
              <div
                className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden"
                role="progressbar"
                aria-label="Overall training progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={overallProgress}
              >
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
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-bold text-gray-500 hover:bg-white hover:text-gray-600 transition-all border border-transparent hover:border-gray-200 shadow-sm"
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

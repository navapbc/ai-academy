import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BarChart3, X, CheckCircle2, ChevronDown, LifeBuoy, Terminal, ShieldCheck, GraduationCap } from 'lucide-react';
import { CurriculumSection, Module, UserProgress, View } from '../../types';
import { isModuleLive } from '../../lib/modules';
import { BRANDING } from '../../branding';

// Course-tree navigation (cohort-restructure U2): Course 1's weeks, then
// "Supplemental coursework", then "Resources & additional lessons" — every
// section collapsible, nothing locked (R14: gating was removed — U2/U11).
// Collapse defaults per the plan's UX decisions: the section containing the
// current module starts expanded, everything else collapsed; selecting (or
// auto-advancing to) a module expands its containing section WITHOUT collapsing
// others; expansion state is in-memory only.

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  sections: CurriculumSection[];
  progress: UserProgress;
  onModuleSelect: (id: string) => void;
  overallProgress: number;
  onOpenSupport: () => void;
  activeView: View;
  onViewChange: (view: View) => void;
  /** Whether the signed-in user is a champion/admin — gates the Staff entry (P5.1d). */
  isStaff: boolean;
}

/** The id of the section containing a module (undefined when it's in none). */
function sectionIdOf(sections: CurriculumSection[], moduleId: string): string | undefined {
  return sections.find((s) => s.modules.some((m) => m.id === moduleId))?.id;
}

export default function Sidebar({ isOpen, onClose, sections, progress, onModuleSelect, overallProgress, onOpenSupport, activeView, onViewChange, isStaff }: SidebarProps) {
  const completed = new Set(progress.completedModuleIds);
  const totalModules = sections.reduce((n, s) => n + s.modules.length, 0);
  // Count only completed ids that are still in the visible curriculum, so the
  // headline count can't exceed the total (U2 denominator rule).
  const completedCount = sections.reduce(
    (n, s) => n + s.modules.filter(m => completed.has(m.id)).length,
    0,
  );
  // "Soon" badge tracks which cells are still stubs — derived from the fetched
  // content, so an edited row drops its badge with no code change.
  const liveModuleIds = useMemo(
    () => new Set(sections.flatMap(s => s.modules).filter(isModuleLive).map(m => m.id)),
    [sections],
  );

  // Expansion state (in-memory, per UX decision): starts with only the section
  // containing the current module open; a module change (select OR
  // auto-advance) opens its section and never closes any other.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const initial = sectionIdOf(sections, progress.currentModuleId);
    return new Set(initial ? [initial] : []);
  });
  useEffect(() => {
    const id = sectionIdOf(sections, progress.currentModuleId);
    if (!id) return;
    setExpandedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, [sections, progress.currentModuleId]);
  const toggleSection = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // The course tree: consecutive week sections grouped under their course
  // heading; supplemental/resources render as top-level sections after it.
  const courseGroups = useMemo(() => {
    const groups: { courseId: string; courseTitle: string; weeks: CurriculumSection[] }[] = [];
    for (const s of sections) {
      if (s.kind !== 'week' || !s.courseId) continue;
      const last = groups[groups.length - 1];
      if (last && last.courseId === s.courseId) last.weeks.push(s);
      else groups.push({ courseId: s.courseId, courseTitle: s.courseTitle ?? '', weeks: [s] });
    }
    return groups;
  }, [sections]);
  const standaloneSections = useMemo(
    () => sections.filter((s) => s.kind !== 'week'),
    [sections],
  );

  const renderModuleRow = (module: Module) => {
    const isCompleted = completed.has(module.id);
    const isActive = progress.currentModuleId === module.id;
    return (
      <button
        key={module.id}
        onClick={() => onModuleSelect(module.id)}
        className={`
          w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all group cursor-pointer
          ${isActive ? 'bg-nava-plum/10 text-nava-plum border-l-4 border-nava-plum shadow-sm' : 'hover:bg-gray-50 text-gray-600'}
        `}
        id={`module-${module.id}`}
      >
        <div className={`
          flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center border transition-colors
          ${isCompleted ? 'bg-nava-green border-nava-green' : 'border-gray-300 group-hover:border-nava-plum/40'}
        `}>
          {isCompleted ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-white" />
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-transparent group-hover:bg-nava-plum/20" />
          )}
        </div>
        {/* Matrix cell ids ("1.4") are meaningful learner-facing shorthand; course/custom
            ids are internal slugs and stay out of titles (origin doc naming rule). */}
        {module.origin === 'matrix' && (
          <span className="flex-shrink-0 text-[10px] font-bold tabular-nums text-gray-500 w-7">{module.id}</span>
        )}
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
  };

  const renderSection = (section: CurriculumSection) => {
    const sectionCompleted = section.modules.filter(m => completed.has(m.id)).length;
    const expanded = expandedIds.has(section.id);
    const panelId = `section-modules-${section.id}`;
    return (
      <div key={section.id} className="space-y-2">
        <h2 className="px-1">
          <button
            onClick={() => toggleSection(section.id)}
            aria-expanded={expanded}
            aria-controls={panelId}
            className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-gray-50 transition-colors"
          >
            <span className="min-w-0">
              <span className="block text-[10px] font-bold text-gray-500 tracking-widest uppercase">{section.week}</span>
              <span className="block font-semibold text-sm text-gray-900 truncate">{section.title}</span>
            </span>
            <span className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-bold tabular-nums text-gray-500">{sectionCompleted}/{section.modules.length}</span>
              <ChevronDown
                className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? '' : '-rotate-90'}`}
                aria-hidden="true"
              />
            </span>
          </button>
        </h2>
        {expanded && (
          <div id={panelId} className="space-y-0.5">
            {section.modules.map(renderModuleRow)}
          </div>
        )}
      </div>
    );
  };

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
              <BarChart3 className="w-6 h-6 text-nava-plum" aria-hidden="true" />
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
                    ? 'bg-nava-plum/10 text-nava-plum border-l-4 border-nava-plum shadow-sm font-bold'
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
                    ? 'bg-nava-plum/10 text-nava-plum border-l-4 border-nava-plum shadow-sm font-bold'
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
                    ? 'bg-nava-plum/10 text-nava-plum border-l-4 border-nava-plum shadow-sm font-bold'
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
                      ? 'bg-nava-plum/10 text-nava-plum border-l-4 border-nava-plum shadow-sm font-bold'
                      : 'hover:bg-gray-50 text-gray-600'
                    }`}
                >
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span className="text-xs font-medium">Staff</span>
                </button>
              </div>
            )}

            <div className="border-t border-gray-100 my-2 mx-3" />

            {/* Course tree: each course heading with its (visible) weeks. */}
            {courseGroups.map((group) => (
              <div key={group.courseId} className="space-y-4">
                <p className="px-3 text-[10px] font-bold text-gray-500 tracking-widest uppercase">
                  {group.courseTitle}
                </p>
                {group.weeks.map(renderSection)}
              </div>
            ))}

            {/* Supplemental coursework + Resources & additional lessons. */}
            {standaloneSections.map(renderSection)}
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

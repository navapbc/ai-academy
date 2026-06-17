import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { AIPersona, Phase, View } from './types';
import { BRANDING } from './branding';
import { useAuth } from './lib/auth';
import { useProgress } from './lib/useProgress';
import { useRole } from './lib/useRole';
import { useCurriculum } from './lib/useCurriculum';
import { stage1aProgress, isModuleLocked, firstIncompleteStage1aId } from './lib/gating';
import Login from './components/Login';
import ModuleRenderer from './components/ModuleRenderer';
import LockedNotice from './components/LockedNotice';
import Playground from './components/Playground';
import RoleGuard from './components/RoleGuard';
import StaffArea from './components/StaffArea';
import LearnerDashboard from './components/LearnerDashboard';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import SupportModal from './components/SupportModal';
import LocalTutorFAB from './components/LocalTutorFAB';

export default function App() {
  const { loading, session, signOut } = useAuth();

  // Page Title
  useEffect(() => {
    document.title = `${BRANDING.name} AI Training`;
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-nava-sand flex items-center justify-center" role="status">
        <Loader2 className="w-8 h-8 text-nava-green animate-spin" aria-hidden="true" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  if (!session) return <Login />;

  // Keyed on user id so progress state resets cleanly across sign-in/out.
  return <AcademyApp key={session.user.id} userId={session.user.id} onSignOut={signOut} />;
}

// Loads the curriculum from Supabase after sign-in, gating the main view on it.
// Content-as-data: the curriculum is no longer a static import — it's fetched
// at runtime, so editing a module row changes the lesson with no rebuild.
function AcademyApp({ userId, onSignOut }: { userId: string; onSignOut: () => void }) {
  const { phases, loading, error } = useCurriculum();

  if (loading) {
    return (
      <div className="min-h-screen bg-nava-sand flex items-center justify-center" role="status">
        <Loader2 className="w-8 h-8 text-nava-green animate-spin" aria-hidden="true" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  // An empty curriculum (no modules in any stage) is treated as an error state,
  // not rendered (DEBT FE-02): groupIntoPhases always returns 3 stages, so
  // `phases` is never null/[] even when the modules table is empty — without
  // this check `Academy` would deref `allModules[0]` (undefined) and crash.
  const isEmpty = !!phases && phases.every((p) => p.modules.length === 0);

  if (error || !phases || isEmpty) {
    const message =
      error ??
      (isEmpty
        ? 'No curriculum content is available yet. Please check back soon.'
        : 'Could not load the curriculum.');
    return (
      <div className="min-h-screen bg-nava-sand flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <AlertTriangle className="w-10 h-10 text-orange-500 mx-auto" />
          <p className="text-gray-700 font-medium">{message}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 bg-nava-green hover:bg-nava-plum text-white rounded-xl font-bold transition-all"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  // Mount the academy only once the curriculum is loaded, so module ids are
  // stable and non-empty when useProgress initialises.
  return <Academy phases={phases} userId={userId} onSignOut={onSignOut} />;
}

function Academy({ phases, userId, onSignOut }: { phases: Phase[]; userId: string; onSignOut: () => void }) {
  const allModules = useMemo(() => phases.flatMap(p => p.modules), [phases]);
  const allModuleIds = useMemo(() => allModules.map(m => m.id), [allModules]);
  const moduleById = useMemo(() => new Map(allModules.map(m => [m.id, m])), [allModules]);

  // Gating predicate for completeModule's advance (FE-03): a candidate module is
  // locked if it's a Stage-2 module and Stage 1a isn't done given the *new*
  // completed set (so completing the gating module unlocks the next one).
  const isLocked = useCallback(
    (moduleId: string, completedIds: string[]) => {
      const m = moduleById.get(moduleId);
      if (!m) return false;
      return isModuleLocked(m, stage1aProgress(phases, completedIds).done);
    },
    [moduleById, phases],
  );

  const { progress, completeModule, selectModule, error, dismissError } = useProgress(
    userId,
    allModuleIds,
    isLocked,
  );

  // Role drives which views are reachable (P5.1d). Resolved here, inside the
  // `key={session.user.id}` subtree, so it resets cleanly on a user switch and
  // never leaks an elevated role across sign-out/sign-in (the D-01 class).
  const { role, loading: roleLoading, isStaff } = useRole();

  const [view, setView] = useState<View>('learning');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<AIPersona>('default');

  const currentModule = allModules.find(m => m.id === progress.currentModuleId) || allModules[0];
  const currentPhase = phases.find(p => p.id === currentModule.phaseId);

  // Stage gating (P3.11): Stage 2 unlocks only once all of Stage 1a is complete.
  // Computed once from the loaded phases + the learner's progress and passed
  // down to the nav and the content view.
  const stage1a = useMemo(
    () => stage1aProgress(phases, progress.completedModuleIds),
    [phases, progress.completedModuleIds],
  );
  const currentModuleLocked = isModuleLocked(currentModule, stage1a.done);

  // Focus + scroll management on content change (a11y D-10, WCAG SC 2.4.3). The
  // content region swaps wholesale when the module or view changes — including on
  // auto-advance after a completion — which otherwise drops focus to <body> and
  // leaves the learner scrolled mid-page in the new module. On such a change we
  // reset the scroll to the top and move focus into the new content.
  //
  // Focus only moves when the change was user-initiated (a nav click, an
  // auto-advance, a view toggle): `navIntentRef` is armed by those entry points
  // and consumed here. That deliberately excludes the async progress reconcile,
  // which can also shift `currentModuleId`/lock state but must NOT yank focus out
  // of whatever the learner is already doing (e.g. typing in a lab).
  const contentRef = useRef<HTMLDivElement>(null);
  const navIntentRef = useRef(false);
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.scrollTop = 0;
    if (navIntentRef.current) {
      navIntentRef.current = false;
      el.focus({ preventScroll: true });
    }
  }, [progress.currentModuleId, view, currentModuleLocked]);

  const handleModuleSelect = (moduleId: string) => {
    // A locked module is never selectable (the nav already disables it); guard
    // here too so no path can navigate into a gated Stage-2 module.
    const target = allModules.find(m => m.id === moduleId);
    if (target && isModuleLocked(target, stage1a.done)) return;
    // Arm focus only for a real move; re-selecting the current module changes no
    // dep, so the flag would otherwise linger and be consumed by a later reconcile.
    if (moduleId !== progress.currentModuleId) navIntentRef.current = true;
    selectModule(moduleId);
    // Auto-close sidebar on mobile
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  };

  const goToStage1a = () => {
    const targetId = firstIncompleteStage1aId(phases, progress.completedModuleIds);
    if (targetId) handleModuleSelect(targetId);
  };

  const handleComplete = (moduleId: string) => {
    // Auto-advance moves the learner to the next module — focus should follow.
    navIntentRef.current = true;
    completeModule(moduleId);
  };

  const handleViewChange = (next: View) => {
    if (next !== view) navIntentRef.current = true;
    setView(next);
  };

  const overallProgress = Math.round((progress.completedModuleIds.length / allModules.length) * 100);

  return (
    <div className="flex h-screen bg-nava-sand text-[#1A1A1A] font-sans overflow-hidden" id="app-container">
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        phases={phases}
        progress={progress}
        onModuleSelect={handleModuleSelect}
        overallProgress={overallProgress}
        onOpenSupport={() => setIsSupportOpen(true)}
        activeView={view}
        onViewChange={handleViewChange}
        isStaff={isStaff}
        stage1aDone={stage1a.done}
        stage1aCompleted={stage1a.completed}
        stage1aTotal={stage1a.total}
      />

      <main className="flex-1 flex flex-col min-w-0 relative h-full">
        <Header
          isSidebarOpen={isSidebarOpen}
          onOpenSidebar={() => setIsSidebarOpen(true)}
          currentModule={currentModule}
          currentPhase={currentPhase}
          selectedPersona={selectedPersona}
          onPersonaSelect={setSelectedPersona}
          onSignOut={onSignOut}
        />

        {error && (
          <div role="alert" className="mx-4 mt-3 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-orange-50 border border-orange-200 text-orange-800 text-sm">
            <span>{error}</span>
            <button
              onClick={dismissError}
              className="font-bold text-orange-600 hover:text-orange-900 shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        <div
          ref={contentRef}
          id="content-region"
          tabIndex={-1}
          aria-label={
            view === 'playground'
              ? 'Prompting playground'
              : view === 'staff'
                ? 'Staff tools'
                : view === 'progress'
                  ? 'Your progress'
                  : currentModuleLocked
                    ? 'Section locked'
                    : currentModule.title
          }
          className="flex-1 overflow-y-auto w-full focus:outline-none"
        >
          <div className={view === 'playground' ? 'h-full p-4 lg:p-6' : 'hidden'}>
            <Playground
              selectedPersona={selectedPersona}
            />
          </div>
          <div className={view === 'staff' ? 'max-w-5xl mx-auto p-8 lg:p-12 xl:p-16' : 'hidden'}>
            <RoleGuard role={role} loading={roleLoading} allow={['admin', 'champion']}>
              {role && <StaffArea role={role} />}
            </RoleGuard>
          </div>
          {/* Learner self-view (P5.3a). Conditionally mounted (not hidden) so it
              fetches fresh on each open and reflects a just-completed module. */}
          {view === 'progress' && (
            <div className="max-w-5xl mx-auto p-8 lg:p-12 xl:p-16">
              <LearnerDashboard userId={userId} />
            </div>
          )}
          <div className={view === 'learning' ? 'max-w-5xl mx-auto p-8 lg:p-12 xl:p-16' : 'hidden'}>
            {currentModuleLocked ? (
              <LockedNotice
                completed={stage1a.completed}
                total={stage1a.total}
                onGoToStage1a={goToStage1a}
                canGoToStage1a={firstIncompleteStage1aId(phases, progress.completedModuleIds) !== undefined}
              />
            ) : (
              <ModuleRenderer
                module={currentModule}
                selectedPersona={selectedPersona}
                onComplete={() => handleComplete(currentModule.id)}
              />
            )}
          </div>
        </div>
      </main>

      <SupportModal
        isOpen={isSupportOpen}
        onClose={() => setIsSupportOpen(false)}
      />

      {view === 'learning' && (
        <LocalTutorFAB
          selectedPersona={selectedPersona}
          currentModule={currentModule}
          phases={phases}
        />
      )}
    </div>
  );
}

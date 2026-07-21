import { AIPersona, CurriculumSection, View } from './types';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { BRANDING } from './branding';
import type { CompletedVia } from './lib/progress';
import ContentContainer from './components/layout/ContentContainer';
import Header from './components/layout/Header';
import LandingPage from './components/LandingPage';
import LearnerDashboard from './components/LearnerDashboard';
import LocalTutorFAB from './components/LocalTutorFAB';
import Login from './components/Login';
import ModulePager from './components/ModulePager';
import ModuleRenderer from './components/ModuleRenderer';
import Playground from './components/Playground';
import RoleGuard from './components/RoleGuard';
import Sidebar from './components/layout/Sidebar';
import StaffArea from './components/StaffArea';
import SupportModal from './components/SupportModal';
import { useAuth } from './lib/auth';
import { useCurriculum } from './lib/useCurriculum';
import { useProgress } from './lib/useProgress';
import { useRole } from './lib/useRole';

export default function App() {
  const { loading, session, signOut } = useAuth();

  // Page Title
  useEffect(() => {
    document.title = `${BRANDING.name} — Training`;
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-nava-grey flex items-center justify-center" role="status">
        <Loader2 className="w-8 h-8 text-nava-plum animate-spin" aria-hidden="true" />
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
  const { curriculum, loading, error } = useCurriculum();

  if (loading) {
    return (
      <div className="min-h-screen bg-nava-grey flex items-center justify-center" role="status">
        <Loader2 className="w-8 h-8 text-nava-plum animate-spin" aria-hidden="true" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  // Empty-state guard (FE-02, re-cut in restructure U2): the error state keys on
  // the modules query returning ZERO ROWS — never on section shape. An unenrolled
  // learner legitimately receiving only public rows (post-U4) groups into fewer
  // sections and must render normally. The second check is a crash guard for the
  // degenerate "rows exist but none are learner-visible" case (e.g. only
  // unassigned course drafts), which Academy can't mount (it needs ≥1 module).
  const isEmpty = !!curriculum && curriculum.moduleRowCount === 0;
  const noneVisible =
    !!curriculum && !isEmpty && curriculum.sections.every((s) => s.modules.length === 0);

  if (error || !curriculum || isEmpty || noneVisible) {
    const message =
      error ??
      (isEmpty || noneVisible
        ? 'No curriculum content is available yet. Please check back soon.'
        : 'Could not load the curriculum.');
    return (
      <div className="min-h-screen bg-nava-grey flex items-center justify-center p-6">
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
  return <Academy sections={curriculum.sections} userId={userId} onSignOut={onSignOut} />;
}

const VIEWS: readonly View[] = ['learning', 'playground', 'staff', 'progress'];

function Academy({ sections, userId, onSignOut }: { sections: CurriculumSection[]; userId: string; onSignOut: () => void }) {
  const allModules = useMemo(() => sections.flatMap(s => s.modules), [sections]);
  const allModuleIds = useMemo(() => allModules.map(m => m.id), [allModules]);
  const moduleById = useMemo(() => new Map(allModules.map(m => [m.id, m])), [allModules]);

  // U10: the reset-epoch lookup — the module's progress_reset_at from the
  // in-memory curriculum fetch. useProgress captures it AT COMPLETION TIME and
  // uses it at reconcile to detect completions a publish-time reset deleted.
  const getResetEpoch = useCallback(
    (moduleId: string) => moduleById.get(moduleId)?.progressResetAt ?? null,
    [moduleById],
  );

  // No gating (restructure U2 turned it off, U11 deleted it — R14): the
  // completion cursor advances straight through the flattened visible order.
  const { progress, completeModule, selectModule, resetModuleIds, error, dismissError } =
    useProgress(userId, allModuleIds, getResetEpoch);

  // Role drives which views are reachable (P5.1d). Resolved here, inside the
  // `key={session.user.id}` subtree, so it resets cleanly on a user switch and
  // never leaks an elevated role across sign-out/sign-in (the D-01 class).
  const { role, loading: roleLoading, isStaff } = useRole();

  // The active top-nav tab persists across a refresh (per user), so reloading
  // mid-Playground-session doesn't silently bounce the learner back to Learning.
  const [view, setViewState] = useState<View>(() => {
    try {
      const stored = localStorage.getItem(`academy-view-${userId}`);
      return (VIEWS as readonly string[]).includes(stored ?? '') ? (stored as View) : 'learning';
    } catch {
      return 'learning';
    }
  });
  const setView = (next: View) => {
    setViewState(next);
    try {
      localStorage.setItem(`academy-view-${userId}`, next);
    } catch {
      /* storage disabled — view still switches for this session */
    }
  };
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    try {
      return localStorage.getItem('sidebar-collapsed') !== '1';
    } catch {
      return true;
    }
  });
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<AIPersona>('default');

  // First-run landing gate (per user). Shown until the user clicks "Enter AI
  // Academy"; persisted in localStorage so later logins go straight to the app.
  const [hasEntered, setHasEntered] = useState(() => {
    try {
      return localStorage.getItem(`academy-entered-${userId}`) === '1';
    } catch {
      return false;
    }
  });
  const handleEnter = () => {
    setHasEntered(true);
    try {
      localStorage.setItem(`academy-entered-${userId}`, '1');
    } catch {
      /* storage disabled — entry still works for this session */
    }
  };

  const currentModule = allModules.find(m => m.id === progress.currentModuleId) || allModules[0];
  const currentSection = sections.find(s => s.id === currentModule.phaseId);

  // Focus + scroll management on content change (a11y D-10, WCAG SC 2.4.3). The
  // content region swaps wholesale when the module or view changes — including on
  // auto-advance after a completion — which otherwise drops focus to <body> and
  // leaves the learner scrolled mid-page in the new module. On such a change we
  // reset the scroll to the top and move focus into the new content.
  //
  // Focus only moves when the change was user-initiated (a nav click, an
  // auto-advance, a view toggle): `navIntentRef` is armed by those entry points
  // and consumed here. That deliberately excludes the async progress reconcile,
  // which can also shift `currentModuleId` but must NOT yank focus out of
  // whatever the learner is already doing (e.g. typing in a lab).
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
  }, [progress.currentModuleId, view]);

  const handleModuleSelect = (moduleId: string) => {
    // Arm focus only for a real move; re-selecting the current module changes no
    // dep, so the flag would otherwise linger and be consumed by a later reconcile.
    if (moduleId !== progress.currentModuleId || view !== 'learning') navIntentRef.current = true;
    // Selecting a module (e.g. from the sidebar) must always land on the Learning
    // view's content pane — otherwise the selection updates state invisibly while
    // Playground/Progress/Staff stays on screen.
    setView('learning');
    selectModule(moduleId);
    // Auto-close sidebar on mobile
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  };

  // Desktop-scoped sidebar persistence: an explicit collapse/expand at >=1024px
  // records the preference; the mobile drawer auto-close in handleModuleSelect stays
  // transient and never writes it.
  const handleCloseSidebar = () => {
    setIsSidebarOpen(false);
    if (window.innerWidth >= 1024) {
      try {
        localStorage.setItem('sidebar-collapsed', '1');
      } catch {
        /* storage disabled — collapse still works for this session */
      }
    }
  };
  const handleOpenSidebar = () => {
    setIsSidebarOpen(true);
    if (window.innerWidth >= 1024) {
      try {
        localStorage.removeItem('sidebar-collapsed');
      } catch {
        /* storage disabled */
      }
    }
  };

  const handleComplete = (moduleId: string, via: CompletedVia) => {
    // Auto-advance moves the learner to the next module — focus should follow.
    // (Only EXPLICIT completions route here; participation-event completions
    // are handled inside useProgress and never move the cursor — U9.)
    navIntentRef.current = true;
    completeModule(moduleId, via);
  };

  const handleViewChange = (next: View) => {
    if (next !== view) navIntentRef.current = true;
    setView(next);
  };

  // Progress denominators (restructure U2): numerator = completions ∩ the
  // VISIBLE module set, denominator = visible modules — a learner with stored
  // completions for ids no longer visible to them must never exceed 100%.
  // 'matrix'-origin modules (the ungated "Supplemental coursework" section) are
  // excluded from both — optional practice must not move the overall completion
  // number, matching the same exclusion in the My Progress dashboard
  // (summarizeOwnProgress) and the Sidebar's own headline count.
  const completionEligibleCount = useMemo(
    () => allModules.filter((m) => m.origin !== 'matrix').length,
    [allModules],
  );
  const completedVisibleCount = useMemo(
    () =>
      progress.completedModuleIds.filter((id) => {
        const m = moduleById.get(id);
        return !!m && m.origin !== 'matrix';
      }).length,
    [progress.completedModuleIds, moduleById],
  );
  const overallProgress =
    completionEligibleCount > 0 ? Math.round((completedVisibleCount / completionEligibleCount) * 100) : 0;

  if (!hasEntered) {
    return <LandingPage onEnter={handleEnter} />;
  }

  return (
    <div className="flex h-screen bg-nava-grey text-[#1A1A1A] font-sans overflow-hidden" id="app-container">
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={handleCloseSidebar}
        sections={sections}
        progress={progress}
        onModuleSelect={handleModuleSelect}
        overallProgress={overallProgress}
        onOpenSupport={() => setIsSupportOpen(true)}
        activeView={view}
        onViewChange={handleViewChange}
        isStaff={isStaff}
      />

      <main className="flex-1 flex flex-col min-w-0 relative h-full">
        <Header
          isSidebarOpen={isSidebarOpen}
          onOpenSidebar={handleOpenSidebar}
          currentModule={currentModule}
          currentPhase={currentSection}
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
                  : currentModule.title
          }
          className="flex-1 overflow-y-auto w-full focus:outline-none"
        >
          <div className={view === 'playground' ? 'h-full p-4 lg:p-6' : 'hidden'}>
            <Playground
              selectedPersona={selectedPersona}
            />
          </div>
          {/* Staff is data-dense (dashboards, rosters, CMS lists) — Nava's wider
              1440-grid content width (max-w-7xl) instead of the prose width. */}
          <ContentContainer active={view === 'staff'} wide>
            <RoleGuard role={role} loading={roleLoading} allow={['admin', 'champion']}>
              {role && <StaffArea role={role} />}
            </RoleGuard>
          </ContentContainer>
          {/* Learner self-view (P5.3a). Conditionally mounted (not hidden) so it
              fetches fresh on each open and reflects a just-completed module. */}
          {view === 'progress' && (
            <ContentContainer wide>
              <LearnerDashboard userId={userId} />
            </ContentContainer>
          )}
          <ContentContainer active={view === 'learning'}>
            <ModuleRenderer
              module={currentModule}
              selectedPersona={selectedPersona}
              isCompleted={progress.completedModuleIds.includes(currentModule.id)}
              onComplete={(via) => handleComplete(currentModule.id, via)}
              wasReset={resetModuleIds.has(currentModule.id)}
            />
            {/* Week flow (U2/R4): Next/Previous over the flattened visible order.
                Pure navigation — completion semantics are untouched (U9). */}
            <ModulePager
              modules={allModules}
              currentModuleId={currentModule.id}
              onSelect={handleModuleSelect}
            />
          </ContentContainer>
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
          phases={sections}
        />
      )}
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { PHASES } from './constants';
import { AIPersona } from './types';
import { BRANDING } from './branding';
import { useAuth } from './lib/auth';
import { useProgress } from './lib/useProgress';
import Login from './components/Login';
import ModuleRenderer from './components/ModuleRenderer';
import Playground from './components/Playground';
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
      <div className="min-h-screen bg-nava-sand flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-nava-green animate-spin" />
      </div>
    );
  }

  if (!session) return <Login />;

  // Keyed on user id so progress state resets cleanly across sign-in/out.
  return <AcademyApp key={session.user.id} userId={session.user.id} onSignOut={signOut} />;
}

function AcademyApp({ userId, onSignOut }: { userId: string; onSignOut: () => void }) {
  const allModules = useMemo(() => PHASES.flatMap(p => p.modules), []);
  const allModuleIds = useMemo(() => allModules.map(m => m.id), [allModules]);

  const { progress, completeModule, selectModule, error, dismissError } = useProgress(
    userId,
    allModuleIds,
  );

  const [view, setView] = useState<'learning' | 'playground'>('learning');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<AIPersona>('default');

  const currentModule = allModules.find(m => m.id === progress.currentModuleId) || allModules[0];
  const currentPhase = PHASES.find(p => p.id === currentModule.phaseId);

  const handleModuleSelect = (moduleId: string) => {
    selectModule(moduleId);
    // Auto-close sidebar on mobile
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  };

  const handleComplete = (moduleId: string) => {
    completeModule(moduleId);
  };

  const overallProgress = Math.round((progress.completedModuleIds.length / allModules.length) * 100);

  return (
    <div className="flex h-screen bg-nava-sand text-[#1A1A1A] font-sans overflow-hidden" id="app-container">
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        progress={progress}
        onModuleSelect={handleModuleSelect}
        overallProgress={overallProgress}
        onOpenSupport={() => setIsSupportOpen(true)}
        activeView={view}
        onViewChange={setView}
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
          <div className="mx-4 mt-3 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-orange-50 border border-orange-200 text-orange-800 text-sm">
            <span>{error}</span>
            <button
              onClick={dismissError}
              className="font-bold text-orange-600 hover:text-orange-900 shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto w-full">
          <div className={view === 'playground' ? 'h-full p-4 lg:p-6' : 'hidden'}>
            <Playground
              selectedPersona={selectedPersona}
            />
          </div>
          <div className={view !== 'playground' ? 'max-w-5xl mx-auto p-8 lg:p-12 xl:p-16' : 'hidden'}>
            <ModuleRenderer
              module={currentModule}
              selectedPersona={selectedPersona}
              onComplete={() => handleComplete(currentModule.id)}
            />
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
        />
      )}
    </div>
  );
}

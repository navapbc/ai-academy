import { useState, useEffect, useRef, useMemo } from 'react';
import { PHASES } from './constants';
import { UserProgress, AIPersona } from './types';
import { BRANDING } from './branding';
import ModuleRenderer from './components/ModuleRenderer';
import Playground from './components/Playground';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import SupportModal from './components/SupportModal';
import LocalTutorFAB from './components/LocalTutorFAB';
import { localProviderService, LocalModel } from './services/localProviderService';
import { embeddingService } from './services/embeddingService';

export default function App() {
  const [progress, setProgress] = useState<UserProgress>(() => {
    const saved = localStorage.getItem('sprint_progress');
    if (saved) return JSON.parse(saved);
    return {
      completedModuleIds: [],
      currentModuleId: PHASES[0].modules[0].id
    };
  });

  const [view, setView] = useState<'learning' | 'playground'>('learning');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLocalActive, setIsLocalActive] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [localModels, setLocalModels] = useState<LocalModel[]>([]);
  const [selectedLocalModelId, setSelectedLocalModelId] = useState<string>('');
  const [selectedPersona, setSelectedPersona] = useState<AIPersona>('default');

  // Page Title
  useEffect(() => {
    document.title = `${BRANDING.name} AI Training`;
  }, []);

  // Persistence
  useEffect(() => {
    localStorage.setItem('sprint_progress', JSON.stringify(progress));
  }, [progress]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isIndexReady, setIsIndexReady] = useState(false);
  const prevActiveProviderRef = useRef<'ollama' | 'lm-studio' | null>(null);

  const indexableLessons = useMemo(() =>
    PHASES.flatMap(p => p.modules).filter(m => !!m.content).map(m => ({
      id: m.id,
      title: m.title,
      content: m.content,
    })),
  []);

  // Local Provider Detection
  const checkProviders = async () => {
    setIsRefreshing(true);
    const [ollama, lmStudio] = await Promise.all([
      localProviderService.checkOllama(),
      localProviderService.checkLMStudio()
    ]);

    const allModels = [...ollama.models, ...lmStudio.models];
    const active = ollama.active || lmStudio.active;

    setIsLocalActive(active);
    setLocalModels(allModels);

    if (active && allModels.length > 0) {
      setSelectedLocalModelId(prev => prev || allModels[0].id);
    }

    if (!active) {
      setLocalError(null);
      prevActiveProviderRef.current = null;
      embeddingService.reset();
      setIsIndexReady(false);
    }

    setIsRefreshing(false);

    // Build vector index when a provider becomes active, or when the active
    // provider changes (e.g. user switches from Ollama-only to LM Studio-only).
    if (active && allModels.length > 0) {
      const activeProvider = ollama.active ? 'ollama' : 'lm-studio';
      if (activeProvider !== prevActiveProviderRef.current) {
        prevActiveProviderRef.current = activeProvider;
        embeddingService.reset();
        setIsIndexReady(false);
        // Non-blocking — FAB falls back to full lesson content while building
        embeddingService
          .buildIndex(indexableLessons, activeProvider)
          .then(() => setIsIndexReady(embeddingService.isReady))
          .catch(() => setIsIndexReady(false));
      }
    }
  };

  useEffect(() => {
    checkProviders();
    const interval = setInterval(checkProviders, 15000);
    return () => clearInterval(interval);
  }, []); // Only on mount, manual refresh will handle others

  const allModules = useMemo(() => PHASES.flatMap(p => p.modules), []);
  const currentModule = allModules.find(m => m.id === progress.currentModuleId) || allModules[0];
  const currentPhase = PHASES.find(p => p.id === currentModule.phaseId);
  
  const handleModuleSelect = (moduleId: string) => {
    setProgress(prev => ({ ...prev, currentModuleId: moduleId }));
    // Auto-close sidebar on mobile
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  };

  const handleComplete = (moduleId: string) => {
    if (!progress.completedModuleIds.includes(moduleId)) {
      setProgress(prev => {
        const nextModuleIndex = allModules.findIndex(m => m.id === moduleId) + 1;
        const nextModuleId = allModules[nextModuleIndex]?.id || moduleId;
        return {
          completedModuleIds: [...prev.completedModuleIds, moduleId],
          currentModuleId: nextModuleId
        };
      });
    }
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
          isLocalActive={isLocalActive}
          localError={localError}
          localModels={localModels}
          selectedModelId={selectedLocalModelId}
          onModelSelect={setSelectedLocalModelId}
          onRefreshLocal={checkProviders}
          selectedPersona={selectedPersona}
          onPersonaSelect={setSelectedPersona}
        />

        <div className="flex-1 overflow-y-auto w-full">
          <div className={view === 'playground' ? 'h-full p-4 lg:p-6' : 'hidden'}>
            <Playground
              localModels={localModels}
              selectedLocalModel={selectedLocalModelId}
              selectedPersona={selectedPersona}
              isLocalActive={isLocalActive}
            />
          </div>
          <div className={view !== 'playground' ? 'max-w-5xl mx-auto p-8 lg:p-12 xl:p-16' : 'hidden'}>
            <ModuleRenderer
              module={currentModule}
              isLocalActive={isLocalActive}
              localModels={localModels}
              selectedLocalModel={selectedLocalModelId}
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
          isLocalActive={isLocalActive}
          localModels={localModels}
          selectedLocalModel={selectedLocalModelId}
          selectedPersona={selectedPersona}
          currentModule={currentModule}
          isIndexReady={isIndexReady}
        />
      )}
    </div>
  );
}


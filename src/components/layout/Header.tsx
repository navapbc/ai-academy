import { motion, AnimatePresence } from 'motion/react';
import { Menu, ChevronRight, Database, AlertCircle, RefreshCw, UserCircle } from 'lucide-react';
import { Phase, Module, AIPersona } from '../../types';
import { BRANDING } from '../../branding';
import { LocalModel } from '../../services/localProviderService';
import { Info } from 'lucide-react';
import { AI_PERSONAS } from '../../constants';

interface HeaderProps {
  isSidebarOpen: boolean;
  onOpenSidebar: () => void;
  currentModule: Module;
  currentPhase: Phase | undefined;
  isLocalActive: boolean;
  localError: string | null;
  localModels: LocalModel[];
  selectedModelId: string;
  onModelSelect: (id: string) => void;
  onRefreshLocal?: () => void;
  selectedPersona: AIPersona;
  onPersonaSelect: (persona: AIPersona) => void;
}

export default function Header({ 
  isSidebarOpen, 
  onOpenSidebar, 
  currentModule, 
  currentPhase, 
  isLocalActive,
  localError,
  localModels,
  selectedModelId,
  onModelSelect,
  onRefreshLocal,
  selectedPersona,
  onPersonaSelect
}: HeaderProps) {
  const selectedModelData = localModels.find(m => m.id === selectedModelId);
  const formatSize = (bytes?: number) => bytes ? (bytes / (1024 * 1024 * 1024)).toFixed(1) + 'GB' : 'N/A';
  const selectedPersonaData = AI_PERSONAS.find(p => p.id === selectedPersona) || AI_PERSONAS[0];

  return (
    <header className="h-16 border-b border-gray-200 bg-white/80 backdrop-blur-md sticky top-0 z-10 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        {!isSidebarOpen && (
          <button onClick={onOpenSidebar} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
            <Menu className="w-5 h-5" />
          </button>
        )}
        <nav className="flex items-center text-sm text-gray-500 gap-2">
          {currentPhase && (
            <span className="text-nava-green font-bold uppercase tracking-wider text-[10px]">{currentPhase.week}</span>
          )}
          <ChevronRight className="w-4 h-4 text-gray-300" />
          <span className="text-gray-900 font-semibold truncate max-w-[200px]">{currentModule.title}</span>
        </nav>
      </div>

      <div className="flex items-center gap-3">
        {/* Persona Dropdown */}
        <div className="flex items-center gap-2 pl-3 pr-1 py-1 bg-gray-50 text-gray-700 border border-gray-200 rounded-full text-[10px] font-bold uppercase tracking-wider group relative">
          <div className="flex items-center gap-1.5 border-r border-gray-200 pr-2">
            <UserCircle className="w-3.5 h-3.5 text-nava-plum" />
            Persona
          </div>
          <select 
            value={selectedPersona}
            onChange={(e) => onPersonaSelect(e.target.value as AIPersona)}
            className="bg-transparent border-none outline-none text-gray-900 pr-1 cursor-pointer hover:text-nava-plum transition-colors font-bold"
          >
            {AI_PERSONAS.map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>

          {/* Persona Tooltip */}
          <div className="absolute top-full right-0 mt-2 w-52 p-4 bg-white border border-gray-100 rounded-2xl shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-50 ring-1 ring-black/5">
            <div className="flex items-center gap-2 text-nava-plum mb-2 pb-2 border-b border-gray-50">
              <UserCircle className="w-3.5 h-3.5" />
              <span className="font-bold text-[10px] uppercase tracking-wider">{selectedPersonaData.label}</span>
            </div>
            <p className="text-[11px] text-gray-500 normal-case leading-relaxed font-medium">
              {selectedPersonaData.description}
            </p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {isLocalActive ? (
            <motion.div 
              key="active"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-2 pl-3 pr-1 py-1 bg-green-50 text-green-700 border border-green-200 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm group relative"
              id="local-ai-badge"
            >
              <div className="flex items-center gap-1.5 border-r border-green-200 pr-2">
                <Database className="w-3.5 h-3.5" />
                {selectedModelData?.provider === 'ollama' ? 'Ollama' : 'LM Studio'}
              </div>
              <div className="flex items-center gap-1">
                {localModels.length > 0 ? (
                  <>
                    <select 
                      value={selectedModelId}
                      onChange={(e) => onModelSelect(e.target.value)}
                      className="bg-transparent border-none outline-none text-green-800 pr-1 cursor-pointer hover:text-green-600 transition-colors font-bold"
                    >
                      {localModels.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>

                    <button 
                      onClick={onRefreshLocal}
                      className="p-1 hover:bg-green-100 rounded-full transition-colors text-green-600"
                      title="Refresh models"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>

                    {selectedModelData && (
                      <div className="absolute top-full right-0 mt-2 w-52 p-4 bg-white border border-gray-100 rounded-2xl shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-50 ring-1 ring-black/5">
                        <div className="flex items-center gap-2 text-nava-green mb-3 pb-2 border-b border-gray-50">
                          <Database className="w-3.5 h-3.5" />
                          <span className="font-bold text-[10px] uppercase tracking-wider">
                            {selectedModelData.provider === 'ollama' ? 'Ollama Model' : 'LM Studio Model'}
                          </span>
                        </div>
                        <div className="space-y-2 normal-case text-gray-500 font-medium text-[11px]">
                          <div className="flex justify-between items-center">
                            <span className="text-gray-400">ID:</span>
                            <span className="text-gray-900 truncate max-w-[100px]" title={selectedModelId}>{selectedModelId}</span>
                          </div>
                          {selectedModelData.details?.size && (
                            <div className="flex justify-between items-center">
                              <span className="text-gray-400">Size:</span>
                              <span className="text-gray-900 font-bold">{formatSize(selectedModelData.details.size)}</span>
                            </div>
                          )}
                          {selectedModelData.details?.quantization && (
                            <div className="flex justify-between items-center">
                              <span className="text-gray-400">Quantization:</span>
                              <span className="text-gray-900 px-1.5 py-0.5 bg-gray-100 rounded text-[9px]">{selectedModelData.details.quantization}</span>
                            </div>
                          )}
                          {selectedModelData.details?.family && (
                            <div className="flex justify-between items-center">
                              <span className="text-gray-400">Family:</span>
                              <span className="text-gray-900">{selectedModelData.details.family}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <span className="pr-2 text-gray-400">No Models Found</span>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="inactive"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={onRefreshLocal}
              className="flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm group relative cursor-pointer hover:bg-amber-100 transition-colors"
              id="local-ai-badge-inactive"
            >
              <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
              <span>Local AI Disconnected</span>
              
              <div className="absolute top-full right-0 mt-2 w-48 p-3 bg-white border border-gray-200 rounded-xl shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-50">
                <p className="text-gray-600 normal-case font-medium mb-2 leading-tight">
                  {localError || "Ensure Ollama (11434) or LM Studio (1234) is running"}
                </p>
                <div className="flex items-center gap-1.5 text-amber-600">
                  <RefreshCw className="w-3 h-3 animate-spin-slow" />
                  <span>Checking...</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="w-8 h-8 rounded-full bg-nava-plum border border-nava-plum flex items-center justify-center text-white font-bold text-xs shadow-sm">
          CT
        </div>
      </div>
    </header>
  );
}

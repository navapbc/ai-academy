import { Menu, ChevronRight, UserCircle, LogOut } from 'lucide-react';
import { Phase, Module, AIPersona } from '../../types';
import { AI_PERSONAS } from '../../constants';
import { useAuth } from '../../lib/auth';

/** Two-letter avatar initials from an email's local part (e.g. jane.doe -> JD). */
function initialsFromEmail(email: string | undefined): string {
  if (!email) return '?';
  const local = email.split('@')[0] ?? '';
  const parts = local.split(/[.\-_]+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : local.slice(0, 2);
  return letters.toUpperCase() || '?';
}

interface HeaderProps {
  isSidebarOpen: boolean;
  onOpenSidebar: () => void;
  currentModule: Module;
  currentPhase: Phase | undefined;
  selectedPersona: AIPersona;
  onPersonaSelect: (persona: AIPersona) => void;
  onSignOut: () => void;
}

export default function Header({
  isSidebarOpen,
  onOpenSidebar,
  currentModule,
  currentPhase,
  selectedPersona,
  onPersonaSelect,
  onSignOut
}: HeaderProps) {
  const { user } = useAuth();
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
          <ChevronRight className="w-4 h-4 text-gray-500" />
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

        <div className="flex items-center gap-2.5 pl-3 border-l border-gray-200">
          <div
            className="w-8 h-8 rounded-full bg-nava-plum border border-nava-plum flex items-center justify-center text-white font-bold text-xs shadow-sm shrink-0"
            title={user?.email ?? undefined}
          >
            {initialsFromEmail(user?.email ?? undefined)}
          </div>
          <span className="hidden md:inline text-xs font-medium text-gray-600 truncate max-w-[180px]">
            {user?.email}
          </span>
          <button
            onClick={onSignOut}
            title="Sign out"
            aria-label="Sign out"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-500 hover:bg-gray-100 hover:text-nava-plum transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
}


export type ModuleType = 'content' | 'lab' | 'simulator' | 'use-case' | 'quiz' | 'local-setup' | 'glossary';

export interface Module {
  id: string;
  title: string;
  type: ModuleType;
  content: string;
  phaseId: string;
  videoUrl?: string; // Placeholder for future video walkthroughs
  resources?: { title: string; url: string }[];
}

export interface Phase {
  id: string;
  title: string;
  description: string;
  week: string;
  modules: Module[];
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface UserProgress {
  completedModuleIds: string[];
  currentModuleId: string;
}

export type AIPersona = 'analyst' | 'empathy' | 'technical' | 'default';

export interface PersonaConfig {
  id: AIPersona;
  label: string;
  description: string;
  promptPrefix: string;
}

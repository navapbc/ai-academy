import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion } from 'motion/react';
import { CheckCircle, ExternalLink, PlayCircle, Library } from 'lucide-react';
import { Module, AIPersona } from '../types';
import { GLOSSARY_TERMS } from '../constants';
import { BRANDING, injectBranding } from '../branding';
import { LocalModel } from '../services/localProviderService';
import PrivacySimulator from './PrivacySimulator';
import PromptLab from './PromptLab';
import Quiz from './Quiz';
import UseCaseLib from './UseCaseLib';
import OllamaGuide from './OllamaGuide';

interface Props {
  module: Module;
  isLocalActive: boolean;
  localModels: LocalModel[];
  selectedLocalModel?: string;
  selectedPersona: AIPersona;
  onComplete: () => void;
}

function toYouTubeEmbed(url: string): string {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/);
  return match ? `https://www.youtube.com/embed/${match[1]}` : url;
}

export default function ModuleRenderer({ module, isLocalActive, localModels, selectedLocalModel, selectedPersona, onComplete }: Props) {
  const renderInteractive = () => {
    switch (module.type) {
      case 'simulator':
        return <PrivacySimulator onComplete={onComplete} />;
      case 'lab':
        return (
          <PromptLab
            onComplete={onComplete}
            isLocalActive={isLocalActive}
            localModels={localModels}
            selectedLocalModel={selectedLocalModel}
            selectedPersona={selectedPersona}
          />
        );
      case 'quiz':
        return <Quiz moduleId={module.id} onComplete={onComplete} />;
      case 'use-case':
        return <UseCaseLib onComplete={onComplete} />;
      case 'local-setup':
        return <OllamaGuide isActive={isLocalActive} onComplete={onComplete} />;
      case 'glossary':
        return <Glossary />;
      default:
        return null;
    }
  };

  return (
    <motion.div
      key={module.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-12 pb-24"
    >
      {module.videoUrl ? (
        <div className="aspect-video rounded-3xl overflow-hidden border border-gray-800 shadow-2xl">
          <iframe
            src={toYouTubeEmbed(module.videoUrl)}
            title={module.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full"
          />
        </div>
      ) : (
        <div className="aspect-video bg-gray-900 rounded-3xl flex flex-col items-center justify-center text-white space-y-4 border border-gray-800 shadow-2xl group">
          <PlayCircle className="w-16 h-16 text-white/40 group-hover:text-nava-gold group-hover:scale-110 transition-all" />
          <div className="text-center">
            <p className="font-bold text-lg">Lesson Walkthrough</p>
            <p className="text-sm text-gray-400">Video coming soon</p>
          </div>
        </div>
      )}

      {module.content && (
        <div className="prose prose-slate max-w-none prose-headings:font-bold prose-h1:text-4xl prose-h1:text-nava-plum prose-h1:tracking-tight prose-h2:text-nava-plum prose-h3:text-gray-800 prose-p:text-gray-600 prose-p:leading-relaxed prose-li:text-gray-600 prose-li:leading-relaxed prose-strong:text-gray-800 prose-a:text-nava-plum prose-a:font-medium prose-a:no-underline hover:prose-a:underline prose-code:text-nava-plum prose-code:bg-gray-100 prose-code:rounded prose-code:px-1 prose-code:font-normal prose-blockquote:border-l-nava-plum prose-blockquote:text-gray-500 prose-hr:border-gray-200">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{injectBranding(module.content)}</ReactMarkdown>
        </div>
      )}

      {renderInteractive()}

      {module.resources && module.resources.length > 0 && (
        <div className="bg-gray-50 rounded-3xl p-8 border border-gray-100">
          <div className="flex items-center gap-2 mb-6">
            <Library className="w-5 h-5 text-gray-900" />
            <h3 className="font-bold text-gray-900">Deep Dive Resources</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {module.resources.map((res, idx) => (
              <a
                key={idx}
                href={res.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-200 hover:border-nava-plum hover:shadow-sm transition-all group"
              >
                <span className="text-sm font-medium text-gray-600 group-hover:text-nava-plum">{res.title}</span>
                <ExternalLink className="w-4 h-4 text-gray-300 group-hover:text-nava-plum" />
              </a>
            ))}
          </div>
        </div>
      )}

      {(module.type === 'content' || module.type === 'glossary') && (
        <div className="flex justify-center pt-8 border-t border-gray-100">
          <button
            onClick={onComplete}
            className="flex items-center gap-2 px-12 py-4 bg-nava-green hover:bg-nava-plum text-white rounded-2xl font-bold shadow-lg shadow-nava-mint transition-all active:scale-95"
            id="complete-button"
          >
            I've completed this section
            <CheckCircle className="w-5 h-5" />
          </button>
        </div>
      )}
    </motion.div>
  );
}

function Glossary() {
  return (
    <div className="bg-white border border-gray-100 rounded-3xl overflow-hidden shadow-sm">
      <div className="p-8 bg-nava-plum text-white">
        <h3 className="text-2xl font-bold flex items-center gap-3">
          <Library className="w-6 h-6" />
          {BRANDING.name} AI Glossary
        </h3>
        <p className="text-nava-mint/80 mt-2 font-medium">Standard definitions for {BRANDING.name}-safe AI development.</p>
      </div>
      <div className="divide-y divide-gray-100">
        {GLOSSARY_TERMS.map((term, idx) => (
          <div key={idx} className="p-6 hover:bg-gray-50 transition-colors group">
            <div className="font-black text-nava-plum text-lg mb-1 group-hover:translate-x-1 transition-transform inline-block">{term.term}</div>
            <p className="text-gray-600 leading-relaxed font-medium">{injectBranding(term.definition)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

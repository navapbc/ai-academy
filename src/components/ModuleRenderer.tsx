import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion } from 'motion/react';
import { CheckCircle, ExternalLink, PlayCircle, Library, Award } from 'lucide-react';
import { Module, AIPersona } from '../types';
import { GLOSSARY_TERMS } from '../constants';
import { BRANDING, injectBranding } from '../branding';
import { useAuth } from '../lib/auth';
import { fetchQuizSummary, type QuizResult } from '../lib/progress';
import PrivacySimulator from './PrivacySimulator';
import Lab from './Lab';
import Quiz from './Quiz';
import UseCaseLib from './UseCaseLib';
import ScenarioSorter from './ScenarioSorter';
import DataClassifier from './exercises/DataClassifier';
import ToolTriage from './exercises/ToolTriage';
import FailureSpotter from './exercises/FailureSpotter';
import ScenarioExercise from './exercises/ScenarioExercise';
import ReflectionCapture from './exercises/ReflectionCapture';
import HarmRubric from './exercises/HarmRubric';
import SignoffChecklist from './exercises/SignoffChecklist';
import Critique from './exercises/Critique';
import OutputAudit from './exercises/OutputAudit';
import Calibration from './exercises/Calibration';

interface Props {
  module: Module;
  selectedPersona: AIPersona;
  onComplete: () => void;
}

function toYouTubeEmbed(url: string): string {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/);
  return match ? `https://www.youtube.com/embed/${match[1]}` : url;
}

export default function ModuleRenderer({ module, selectedPersona, onComplete }: Props) {
  const { user } = useAuth();
  // A content/lesson module can carry a scored quiz. When it does, the quiz
  // renders after the lesson and is the completion gate — the standalone
  // "I've completed this section" button is suppressed (passing == complete).
  // Quiz-type modules already render their quiz via renderInteractive().
  const hasInlineQuiz = module.type !== 'quiz' && (module.quiz?.length ?? 0) > 0;
  const hasQuiz = (module.quiz?.length ?? 0) > 0;

  // Surface the learner's best recorded score for this module's quiz. Stays
  // null (badge hidden) until an attempt exists; read-back failures are silent.
  const [quizBest, setQuizBest] = useState<QuizResult | null>(null);
  useEffect(() => {
    if (!user || !hasQuiz) {
      setQuizBest(null);
      return;
    }
    let cancelled = false;
    fetchQuizSummary(user.id, module.id)
      .then((s) => {
        if (!cancelled) setQuizBest(s.best);
      })
      .catch(() => {
        // Best-score is a nicety; a failed read just hides the badge.
      });
    return () => {
      cancelled = true;
    };
  }, [user, module.id, hasQuiz]);

  const renderInteractive = () => {
    switch (module.type) {
      case 'simulator':
        return <PrivacySimulator onComplete={onComplete} />;
      case 'quiz':
        return <Quiz moduleId={module.id} questions={module.quiz ?? []} onComplete={onComplete} />;
      case 'use-case':
        return <UseCaseLib onComplete={onComplete} />;
      case 'sorter':
        return <ScenarioSorter config={module.sorterConfig} onComplete={onComplete} />;
      case 'glossary':
        return <Glossary />;
      default:
        return null;
    }
  };

  // Interactive exercises driven by the module's lab_config_json
  // (content-as-data). One switch keyed off the config's `kind` discriminator so
  // new exercise types are added additively (P3.5 'scenario-sorter', P3.6
  // 'data-classifier' / 'tool-triage'). The prompt-construction lab is the
  // module's completion gate; the classifier/triage exercises are graded
  // practice that record a submission but leave completion to the inline quiz.
  const renderExercise = () => {
    switch (module.labConfig?.kind) {
      case 'prompt-construction':
        return (
          <Lab
            config={module.labConfig}
            labId={module.cellId}
            onComplete={onComplete}
            selectedPersona={selectedPersona}
          />
        );
      case 'data-classifier':
        return <DataClassifier config={module.labConfig} labId={module.cellId} />;
      case 'tool-triage':
        return <ToolTriage config={module.labConfig} labId={module.cellId} />;
      case 'failure-spotter':
        return <FailureSpotter config={module.labConfig} labId={module.cellId} />;
      case 'disclosure-builder':
      case 'regulatory-check':
        return <ScenarioExercise config={module.labConfig} labId={module.cellId} />;
      case 'reflection':
        return <ReflectionCapture config={module.labConfig} labId={module.cellId} />;
      case 'harm-rubric':
        return <HarmRubric config={module.labConfig} labId={module.cellId} />;
      case 'signoff-checklist':
        return <SignoffChecklist config={module.labConfig} labId={module.cellId} />;
      case 'critique':
        // Graded practice (P4.3b) — renders above the quiz, which remains the
        // completion gate; no onComplete (see CritiqueConfig).
        return <Critique config={module.labConfig} labId={module.cellId} />;
      case 'output-audit':
        // Auto-graded practice (P4.3a) — renders above the quiz, which remains
        // the completion gate; no onComplete (see OutputAuditConfig).
        return <OutputAudit config={module.labConfig} labId={module.cellId} />;
      case 'calibration':
        // Auto-graded practice (P4.3c) — renders above the quiz, which remains
        // the completion gate; no onComplete (see CalibrationConfig).
        return <Calibration config={module.labConfig} labId={module.cellId} />;
      default:
        return null;
    }
  };

  // Render the widgets once so we can detect a dead-end module (FE-06): a
  // module that produces no interactive widget, no exercise, no inline quiz, and
  // no completion button would otherwise show only the video/content with no way
  // forward — silently blocking gated content. We surface a clear fallback.
  const interactive = renderInteractive();
  const exercise = renderExercise();
  const hasCompletionButton =
    (module.type === 'content' || module.type === 'glossary') && !hasInlineQuiz;
  const showNoActivityFallback =
    !interactive && !exercise && !hasInlineQuiz && !hasCompletionButton;

  return (
    <motion.div
      key={module.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-12 pb-24"
    >
      {quizBest && (
        <div className="flex justify-end -mb-6">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
              quizBest.passed ? 'bg-nava-mint text-nava-green' : 'bg-orange-50 text-orange-700'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            Best score {quizBest.score}/{quizBest.maxScore}
            {quizBest.passed ? ' · Passed' : ''}
          </span>
        </div>
      )}

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
            <p className="text-sm text-gray-500">Video coming soon</p>
          </div>
        </div>
      )}

      {module.content && (
        <div className="prose prose-slate max-w-none prose-headings:font-bold prose-h1:text-4xl prose-h1:text-nava-plum prose-h1:tracking-tight prose-h2:text-nava-plum prose-h3:text-gray-800 prose-p:text-gray-600 prose-p:leading-relaxed prose-li:text-gray-600 prose-li:leading-relaxed prose-strong:text-gray-800 prose-a:text-nava-plum prose-a:font-medium prose-a:no-underline hover:prose-a:underline prose-code:text-nava-plum prose-code:bg-gray-100 prose-code:rounded prose-code:px-1 prose-code:font-normal prose-blockquote:border-l-nava-plum prose-blockquote:text-gray-500 prose-hr:border-gray-200">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{injectBranding(module.content)}</ReactMarkdown>
        </div>
      )}

      {interactive}

      {exercise}

      {hasInlineQuiz && <Quiz moduleId={module.id} questions={module.quiz ?? []} onComplete={onComplete} />}

      {showNoActivityFallback && (
        <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm text-center space-y-2">
          <h3 className="font-bold text-gray-800">This section isn&apos;t available yet</h3>
          <p className="text-sm text-gray-500">
            Its interactive content isn&apos;t configured. Please check back later or report an
            issue if this seems wrong.
          </p>
        </div>
      )}

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
                <ExternalLink className="w-4 h-4 text-gray-500 group-hover:text-nava-plum" />
              </a>
            ))}
          </div>
        </div>
      )}

      {(module.type === 'content' || module.type === 'glossary') && !hasInlineQuiz && (
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

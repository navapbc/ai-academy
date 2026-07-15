import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle, ExternalLink, PlayCircle, Library, Award, FileClock } from 'lucide-react';
import { Module, AIPersona } from '../types';
import { GLOSSARY_TERMS } from '../constants';
import { BRANDING, injectBranding } from '../branding';
import { useAuth } from '../lib/auth';
import { fetchQuizSummary, type CompletedVia, type QuizResult } from '../lib/progress';
import LessonMarkdown from './LessonMarkdown';
import PrivacySimulator from './PrivacySimulator';
import Lab from './Lab';
import Quiz from './Quiz';
import SectionBoundary from './SectionBoundary';
import ScenarioSorter from './ScenarioSorter';
import DataClassifier from './exercises/DataClassifier';
import ToolTriage from './exercises/ToolTriage';
import FailureSpotter from './exercises/FailureSpotter';
import ScenarioExercise from './exercises/ScenarioExercise';
import ReflectionCapture from './exercises/ReflectionCapture';
import HarmRubric from './exercises/HarmRubric';
import SignoffChecklist from './exercises/SignoffChecklist';
import Critique from './exercises/Critique';
import Synthesis from './exercises/Synthesis';
import OutputAudit from './exercises/OutputAudit';
import Calibration from './exercises/Calibration';
import VoiceEdit from './exercises/VoiceEdit';
import PromptEval from './exercises/PromptEval';
import IterationLab from './exercises/IterationLab';
import PairedCalibration from './exercises/PairedCalibration';
import DashboardCritique from './exercises/DashboardCritique';
import UseCasePortfolio from './exercises/UseCasePortfolio';
import FailureLog from './exercises/FailureLog';
import ChatCompare from './exercises/ChatCompare';
import DecisionScenario from './exercises/DecisionScenario';
import GlatExam from './exercises/GlatExam';

interface Props {
  module: Module;
  selectedPersona: AIPersona;
  /** Whether the learner has already completed this module (drives the footer state). */
  isCompleted: boolean;
  /**
   * Explicit completion path (U9): callers thread `via` into
   * `completeModule(id, via)` so `completed_via` is stamped truthfully. The
   * footer button passes 'explored'; the sorter's Continue passes 'sorter'
   * (ScenarioSorter persists nothing, so no data-layer participation event
   * exists for it); the prompt-construction lab and GLAT keep their explicit
   * wiring ('lab'/'quiz') for cursor advance, redundant with the data-layer
   * seam that fires on their recorded submission/attempt.
   */
  onComplete: (via: CompletedVia) => void;
  /**
   * U10: whether THIS SESSION dropped a cached completion for this module
   * because an admin published-with-reset — shows the dismissible reset notice.
   * Dismissal is in-memory only; the notice reappears on revisit until the
   * module is re-completed (intended v1 behavior).
   */
  wasReset?: boolean;
}

function toYouTubeEmbed(url: string): string {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/);
  return match ? `https://www.youtube.com/embed/${match[1]}` : url;
}

export default function ModuleRenderer({
  module,
  selectedPersona,
  isCompleted,
  onComplete,
  wasReset = false,
}: Props) {
  const { user } = useAuth();

  // U10 reset notice dismissal: in-memory only, and it re-arms whenever the
  // rendered module changes, so the notice reappears on every revisit until
  // the learner re-completes the module (documented intended v1 behavior).
  const [resetNoticeDismissed, setResetNoticeDismissed] = useState(false);
  useEffect(() => {
    setResetNoticeDismissed(false);
  }, [module.id]);
  // A content/lesson module can carry a scored quiz. When it does, the quiz
  // renders after the lesson as ungated practice (U9: quizzes never gate —
  // finishing one at any score auto-completes via the participation seam).
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
        // Client-side-only activity (nothing persisted) — its finish action is
        // an explicit learner claim, so it stamps 'explored', not a
        // participation via.
        return <PrivacySimulator onComplete={() => onComplete('explored')} />;
      case 'quiz':
        // Ungated practice (U9): finishing at any score records the attempt,
        // which auto-completes the module via the participation seam.
        return <Quiz moduleId={module.id} questions={module.quiz ?? []} />;
      case 'sorter':
        // The sorter grades entirely client-side and persists nothing, so no
        // data-layer participation event exists — its Continue button is the
        // completion and stamps 'sorter'.
        return <ScenarioSorter config={module.sorterConfig} onComplete={() => onComplete('sorter')} />;
      case 'glossary':
        return <Glossary />;
      default:
        return null;
    }
  };

  // Interactive exercises driven by the module's lab_config_json
  // (content-as-data). One switch keyed off the config's `kind` discriminator so
  // new exercise types are added additively (P3.5 'scenario-sorter', P3.6
  // 'data-classifier' / 'tool-triage'). None of these gate completion (U9):
  // every exercise records a submission through recordLabSubmission, whose
  // participation event auto-completes the module (via='lab') with no
  // per-component wiring.
  const renderExercise = () => {
    switch (module.labConfig?.kind) {
      case 'prompt-construction':
        // The lab's own Continue (post-grade) keeps its explicit onComplete for
        // cursor advance; the completion itself already happened via the seam
        // when the submission was recorded. Redundant but harmless
        // (completeModule is idempotent) — candidate for U11 cleanup.
        return (
          <Lab
            config={module.labConfig}
            labId={module.cellId}
            onComplete={() => onComplete('lab')}
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
      case 'context-diagnostic':
        // 2.5 context-diagnostic (P4.5a) — auto-graded practice that records a
        // submission; renders above the quiz, which remains the completion gate.
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
      case 'synthesis':
        // Graded practice (P4.4a) — renders above the quiz, which remains the
        // completion gate; no onComplete (see SynthesisConfig).
        return <Synthesis config={module.labConfig} labId={module.cellId} />;
      case 'output-audit':
        // Auto-graded practice (P4.3a) — renders above the quiz, which remains
        // the completion gate; no onComplete (see OutputAuditConfig).
        return <OutputAudit config={module.labConfig} labId={module.cellId} />;
      case 'calibration':
        // Auto-graded practice (P4.3c) — renders above the quiz, which remains
        // the completion gate; no onComplete (see CalibrationConfig).
        return <Calibration config={module.labConfig} labId={module.cellId} />;
      case 'voice-edit':
        // Graded practice (P4.4b) — generate an AI draft, revise it AI-off, graded
        // in place; renders above the quiz, which remains the completion gate; no
        // onComplete (see VoiceEditConfig).
        return <VoiceEdit config={module.labConfig} labId={module.cellId} />;
      case 'prompt-eval':
        // Graded practice (P4.5b) — write one reusable, constraint-first prompt,
        // run it against the seeded test cases, graded in place; renders above the
        // quiz, which remains the completion gate; no onComplete (see PromptEvalConfig).
        return <PromptEval config={module.labConfig} labId={module.cellId} />;
      case 'iteration':
        // Graded practice (P4.5c) — a multi-turn refinement conversation; the judge
        // scores the learner's iteration (their steering turns), not the final
        // output; renders above the quiz, which remains the completion gate; no
        // onComplete (see IterationConfig).
        return <IterationLab config={module.labConfig} labId={module.cellId} />;
      case 'paired-calibration':
        return <PairedCalibration config={module.labConfig} labId={module.cellId} />;
      case 'dashboard-critique':
        // Graded practice (P4.7) — auto-keyed critique of a speed-only dashboard;
        // renders above the quiz, which remains the completion gate; no
        // onComplete (see DashboardCritiqueConfig).
        return <DashboardCritique config={module.labConfig} labId={module.cellId} />;
      case 'use-case-portfolio':
        // Portfolio practice (P4.8) — a personal use-case library + a 4D Diligence
        // Statement; captured (not LLM-graded) above the quiz, which remains the
        // completion gate; no onComplete (see UseCasePortfolioConfig).
        return <UseCasePortfolio config={module.labConfig} labId={module.cellId} />;
      case 'failure-log':
        // Portfolio practice (P4.9) — a dated personal failure-mode log; captured
        // (not LLM-graded) above the quiz, which remains the completion gate; no
        // onComplete (see FailureLogConfig).
        return <FailureLog config={module.labConfig} labId={module.cellId} />;
      case 'chat-compare':
        // Ungraded live comparison (restructure U6) — 1–4 panes answer one
        // shared prompt; records a submission but never gates completion
        // (participation completion is U9); no onComplete (see ChatCompareConfig).
        return <ChatCompare config={module.labConfig} labId={module.cellId} />;
      case 'decision-scenario':
        // Ungraded "Walk the Workflow" checkpoint scenario (restructure U7) —
        // linear DELEGATE→GROUND→SCOPE→VERIFY choices with per-option authored
        // feedback; records ONE submission on finish but never gates completion
        // (participation completion is U9); no onComplete (see
        // DecisionScenarioConfig).
        return <DecisionScenario config={module.labConfig} labId={module.cellId} />;
      case 'glat':
        // GLAT (P4.10 → U9): no longer a gate — submitting records a
        // quiz_attempts row, whose participation event auto-completes 2.14 at
        // ANY score (via='quiz'). The exam's own Finish button keeps its
        // explicit onComplete for cursor advance after the results are read;
        // redundant with the seam (idempotent) — candidate for U11 cleanup.
        return (
          <GlatExam
            config={module.labConfig}
            labId={module.cellId}
            onComplete={() => onComplete('quiz')}
          />
        );
      default:
        return null;
    }
  };

  // Render the widgets once so we can detect a missing-activity module (FE-06):
  // a non-content module whose config produced no widget still gets a clear
  // notice. It is no longer a dead-end — the universal footer "Mark as
  // explored" button (U9) always offers a way forward — but a silent blank
  // where an activity should be would still read as broken.
  const interactive = renderInteractive();
  const exercise = renderExercise();
  const showNoActivityFallback =
    !interactive &&
    !exercise &&
    !hasInlineQuiz &&
    module.type !== 'content' &&
    module.type !== 'glossary';

  return (
    <motion.div
      key={module.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-12 pb-24"
    >
      {/* Editorial state (W3-2 / D10): content that hasn't passed SME accuracy
          review is shown but clearly marked, so it stays testable without being
          mistaken for finished. */}
      {module.status !== 'published' && (
        <div
          role="status"
          className="-mb-6 w-fit inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-bold text-amber-800"
        >
          <FileClock className="w-3.5 h-3.5" aria-hidden="true" />
          Draft — under review
        </div>
      )}

      {/* U10 reset notice: rendered above the module content, below the draft
          badge (UX decision). Shown when this session dropped a cached
          completion for this module after a publish-with-reset. */}
      {wasReset && !resetNoticeDismissed && (
        <div
          role="status"
          className="-mb-4 flex items-start justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3"
        >
          <p className="text-sm text-blue-900">
            This activity was updated on{' '}
            {module.progressResetAt
              ? new Date(module.progressResetAt).toLocaleDateString()
              : 'a recent date'}{' '}
            and progress was reset.
          </p>
          <button
            onClick={() => setResetNoticeDismissed(true)}
            className="text-sm font-bold text-blue-700 hover:text-blue-900 shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

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

      {module.content && <LessonMarkdown content={module.content} />}

      {/* Each widget region gets its own scoped boundary (D-16): a malformed
          authored row crashes only its own card, never the page — and a broken
          exercise can't take down the practice quiz beside it. */}
      {interactive && <SectionBoundary label="activity">{interactive}</SectionBoundary>}

      {exercise && <SectionBoundary label="interactive exercise">{exercise}</SectionBoundary>}

      {hasInlineQuiz && (
        <SectionBoundary label="quiz">
          <Quiz moduleId={module.id} questions={module.quiz ?? []} />
        </SectionBoundary>
      )}

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

      {/* Universal completion footer (U9, explored-affordance rule): EVERY
          incomplete module — including ones with an inline quiz or exercise —
          offers one one-way "Mark as explored" button (via='explored'). Once
          completed by ANY path (participation event, sorter, explored, …), the
          footer is a static "Completed ✓" state. completed_via is never shown
          to learners (v1). */}
      <div className="flex justify-center pt-8 border-t border-gray-100">
        {isCompleted ? (
          <div
            role="status"
            id="module-completed"
            className="flex items-center gap-2 px-12 py-4 text-nava-green font-bold"
          >
            <CheckCircle className="w-5 h-5" aria-hidden="true" />
            Completed ✓
          </div>
        ) : (
          <button
            onClick={() => onComplete('explored')}
            className="flex items-center gap-2 px-12 py-4 bg-nava-green hover:bg-nava-plum text-white rounded-2xl font-bold shadow-lg shadow-nava-mint transition-all active:scale-95"
            id="mark-explored-button"
          >
            Mark as explored
            <CheckCircle className="w-5 h-5" aria-hidden="true" />
          </button>
        )}
      </div>
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

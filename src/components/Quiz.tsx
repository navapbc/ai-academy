import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HelpCircle, Check, X, ShieldCheck, ChevronRight } from 'lucide-react';
import { QUIZ_DATA } from '../constants';
import { useAuth } from '../lib/auth';
import { recordQuizAttempt, fetchQuizSummary, type QuizSummary } from '../lib/progress';

export default function Quiz({ moduleId, onComplete }: { moduleId: string; onComplete: () => void }) {
  const { user } = useAuth();
  const questions = QUIZ_DATA[moduleId] || [];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [summary, setSummary] = useState<QuizSummary | null>(null);

  // Read back any prior attempts so we can show the learner their best score.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchQuizSummary(user.id, moduleId)
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch(() => {
        // Read-back is non-essential; a failure just hides the best-score line.
      });
    return () => {
      cancelled = true;
    };
  }, [user, moduleId]);

  // Persist the attempt once, when results are reached.
  useEffect(() => {
    if (!showResults || !user) return;
    const passed = score === questions.length;
    recordQuizAttempt(user.id, {
      moduleId,
      score,
      maxScore: questions.length,
      passed,
      answers,
    }).catch(() => {
      // Score persistence is best-effort; the unlock flow still works locally.
    });
    // Only fire on the transition into results.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showResults]);

  if (questions.length === 0) return null;

  const currentQuestion = questions[currentIndex];
  const isCorrect = selected === currentQuestion.correctIndex;

  const handleNext = () => {
    const nextIndex = currentIndex + 1;
    if (nextIndex < questions.length) {
      setCurrentIndex(nextIndex);
      setSelected(null);
      setIsSubmitted(false);
    } else {
      setShowResults(true);
    }
  };

  const handleSubmit = () => {
    setIsSubmitted(true);
    setAnswers(prev => ({ ...prev, [String(currentIndex)]: selected! }));
    if (isCorrect) setScore(prev => prev + 1);
  };

  if (showResults) {
    const passing = score === questions.length;
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white border-2 border-nava-mint rounded-3xl p-8 shadow-sm space-y-8 text-center"
      >
         <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center ${passing ? 'bg-green-100' : 'bg-orange-100'}`}>
          {passing ? <ShieldCheck className="w-10 h-10 text-green-600" /> : <HelpCircle className="w-10 h-10 text-orange-600" />}
        </div>
        <div className="space-y-2">
          <h3 className="text-2xl font-bold">Checkpoint Result</h3>
          <p className="text-gray-500">You scored {score} out of {questions.length}</p>
          {summary?.best && (
            <p className="text-xs text-gray-400">
              Best so far: {summary.best.score}/{summary.best.maxScore}
              {summary.best.passed ? ' — passed' : ''}
            </p>
          )}
        </div>

        {passing ? (
          <div className="space-y-6">
            <p className="text-green-700 font-medium bg-green-50 p-4 rounded-xl">
              Excellent! You have a firm grasp on these concepts. You are ready for the next phase.
            </p>
            <button
              onClick={onComplete}
              className="w-full py-4 bg-nava-green text-white rounded-2xl font-bold hover:bg-nava-plum transition-all shadow-lg"
            >
              Continue to Next Sprint
            </button>
          </div>
        ) : (
          <div className="space-y-6">
             <p className="text-orange-700 font-medium bg-orange-50 p-4 rounded-xl">
              Please review the material and try again. We require a 100% score to move forward in the literacy path.
            </p>
            <button
              onClick={() => {
                setCurrentIndex(0);
                setSelected(null);
                setIsSubmitted(false);
                setScore(0);
                setShowResults(false);
                setAnswers({});
              }}
              className="w-full py-4 bg-gray-900 text-white rounded-2xl font-bold hover:bg-black transition-all"
            >
              Restart Quiz
            </button>
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <div className="bg-white border-2 border-nava-mint rounded-3xl p-8 shadow-sm space-y-8" id="module-quiz">
      <div className="flex items-center justify-between border-b border-nava-mint pb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-nava-mint rounded-xl flex items-center justify-center text-nava-green">
            <HelpCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold">Sprint Checkpoint</h3>
            <p className="text-xs text-gray-500">Question {currentIndex + 1} of {questions.length}</p>
          </div>
        </div>
        <div className="h-1.5 w-24 bg-gray-100 rounded-full overflow-hidden">
          <motion.div 
            animate={{ width: `${((currentIndex) / questions.length) * 100}%` }}
            className="h-full bg-nava-green"
          />
        </div>
      </div>

      <div className="space-y-6">
        <p className="text-lg font-medium text-gray-800 leading-tight">{currentQuestion.question}</p>
        
        <div className="space-y-3">
          {currentQuestion.options.map((opt, idx) => (
            <button
              key={idx}
              disabled={isSubmitted}
              onClick={() => setSelected(idx)}
              className={`
                w-full p-4 rounded-xl text-left text-sm font-medium transition-all border-2
                ${selected === idx ? 'border-nava-green bg-nava-mint text-nava-green shadow-sm' : 'border-gray-100 hover:border-nava-green/30'}
                ${isSubmitted && idx === currentQuestion.correctIndex ? 'border-green-600 bg-green-50 text-green-900' : ''}
                ${isSubmitted && selected === idx && idx !== currentQuestion.correctIndex ? 'border-red-600 bg-red-50 text-red-900' : ''}
              `}
            >
              <div className="flex items-center justify-between">
                <span>{opt}</span>
                {isSubmitted && idx === currentQuestion.correctIndex && <Check className="w-4 h-4 text-green-600" />}
                {isSubmitted && selected === idx && idx !== currentQuestion.correctIndex && <X className="w-4 h-4 text-red-600" />}
              </div>
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {isSubmitted && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-6 rounded-2xl ${isCorrect ? 'bg-green-50/50 border border-green-100' : 'bg-red-50/50 border border-red-100'}`}
          >
            <div className="flex gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isCorrect ? 'bg-green-100' : 'bg-red-100'}`}>
                {isCorrect ? <Check className="w-4 h-4 text-green-600" /> : <X className="w-4 h-4 text-red-600" />}
              </div>
              <div className="space-y-1">
                <p className={`font-bold text-sm ${isCorrect ? 'text-green-800' : 'text-red-800'}`}>
                  {isCorrect ? "Correct!" : "Keep learning!"}
                </p>
                <p className={`text-xs leading-relaxed ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                  {currentQuestion.explanation}
                </p>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleNext}
                className="flex items-center gap-2 px-8 py-2 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-black transition-all"
              >
                {currentIndex + 1 < questions.length ? "Next Question" : "See Results"}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isSubmitted && (
        <div className="flex justify-end pt-4">
          <button
            onClick={handleSubmit}
            disabled={selected === null}
            className="px-10 py-3 bg-nava-green text-white rounded-xl font-bold shadow-lg shadow-nava-green/20 disabled:opacity-50 transition-all active:scale-95"
          >
            Submit Answer
          </button>
        </div>
      )}
    </div>
  );
}


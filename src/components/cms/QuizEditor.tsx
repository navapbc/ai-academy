import { useState } from 'react';
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Save,
  Send,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import type { CmsLessonDetailData } from '../../lib/cmsContent';
import {
  saveDraft,
  publishLesson,
  validateQuizQuestions,
  QUIZ_OPTION_COUNT,
  type DraftFields,
  type QuizQuestionDraft,
} from '../../lib/adminContent';
import { StatusBadge } from './StatusBadge';

// Quiz editor for the admin CMS (P5.4-4): structured CRUD over quiz_json. Each
// question has fixed 4 options, one correct (radio), and an explanation; add /
// remove / reorder questions. Mirrors LessonEditor's draft → publish flow:
//   • Save   → posts a `save-draft` with the assembled quiz_json, merged over any
//              existing draft so a pending body/lab edit isn't wiped (R3).
//   • Publish→ saves then promotes draft → live (R4 — no redeploy).
// Inline validation uses the SAME rule as the server (validateQuizQuestions
// mirrors admin-content-core.validateQuizJson) — the function re-validates on
// write and stays authoritative (R8 / W2-7/D-16).

const blankQuestion = (): QuizQuestionDraft => ({
  question: '',
  options: Array.from({ length: QUIZ_OPTION_COUNT }, () => ''),
  correctIndex: 0,
  explanation: '',
});

/** Normalize a seeded question to exactly QUIZ_OPTION_COUNT option slots so the
 *  editor always renders a consistent block (real content is uniformly 4). */
function normalize(q: QuizQuestionDraft): QuizQuestionDraft {
  const options = Array.from({ length: QUIZ_OPTION_COUNT }, (_, i) => q.options[i] ?? '');
  return {
    question: q.question ?? '',
    options,
    correctIndex: Math.min(Math.max(q.correctIndex ?? 0, 0), QUIZ_OPTION_COUNT - 1),
    explanation: q.explanation ?? '',
  };
}

/** Seed from the staged draft quiz if present, else the live quiz, else one blank. */
function initial(lesson: CmsLessonDetailData): QuizQuestionDraft[] {
  const source = lesson.draft?.quiz_json ?? lesson.quiz;
  if (source && source.length > 0) return source.map(normalize);
  return [blankQuestion()];
}

export default function QuizEditor({
  lesson,
  onBack,
  onSaved,
}: {
  lesson: CmsLessonDetailData;
  onBack: () => void;
  /** Called after a successful save/publish so the parent re-fetches the list. */
  onSaved: () => void;
}) {
  const [questions, setQuestions] = useState<QuizQuestionDraft[]>(() => initial(lesson));
  const [busy, setBusy] = useState<'save' | 'publish' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const validation = validateQuizQuestions(questions);
  const valid = validation.ok;

  function patchQuestion(idx: number, patch: Partial<QuizQuestionDraft>) {
    setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }

  function setOption(qIdx: number, oIdx: number, value: string) {
    setQuestions((qs) =>
      qs.map((q, i) =>
        i === qIdx ? { ...q, options: q.options.map((o, j) => (j === oIdx ? value : o)) } : q,
      ),
    );
  }

  function addQuestion() {
    setQuestions((qs) => [...qs, blankQuestion()]);
  }

  function removeQuestion(idx: number) {
    setQuestions((qs) => qs.filter((_, i) => i !== idx));
  }

  // Reorder by swapping array entries — correctIndex is a property of the question
  // object, so it travels with the question (the association is preserved).
  function moveQuestion(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    setQuestions((qs) => {
      if (target < 0 || target >= qs.length) return qs;
      const next = [...qs];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  // save-draft REPLACES the whole `draft` column, so merge over any existing draft
  // to preserve fields this editor doesn't manage (a pending body/video/lab edit).
  function buildDraft(): DraftFields {
    return { ...lesson.draft, quiz_json: questions };
  }

  async function handleSave() {
    if (!valid) return;
    setBusy('save');
    setError(null);
    setNotice(null);
    try {
      await saveDraft(lesson.cellId, buildDraft());
      setNotice('Quiz draft saved. Learners still see the published quiz until you publish.');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the quiz draft.');
    } finally {
      setBusy(null);
    }
  }

  async function handlePublish() {
    if (!valid) return;
    setBusy('publish');
    setError(null);
    setNotice(null);
    try {
      await saveDraft(lesson.cellId, buildDraft());
      await publishLesson(lesson.cellId);
      setNotice('Published. Learners now see this quiz — no redeploy needed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish the quiz.');
    } finally {
      setBusy(null);
      onSaved();
    }
  }

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-nava-green hover:text-nava-plum transition-colors"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Back to lessons
      </button>

      <header className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold uppercase tracking-widest text-nava-green">
            {lesson.cellId}
          </span>
          <StatusBadge status={lesson.status} archived={lesson.archived} />
        </div>
        <h1 className="text-2xl font-bold text-gray-900" tabIndex={-1}>
          Quiz · {lesson.title}
        </h1>
        <p className="text-sm text-gray-600">
          {questions.length} question{questions.length === 1 ? '' : 's'} · each with{' '}
          {QUIZ_OPTION_COUNT} options · v{lesson.version}
        </p>
      </header>

      {error && (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-2"
          role="alert"
        >
          <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {notice && (
        <div
          className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 flex items-start gap-2"
          role="status"
        >
          <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-sm text-green-800">{notice}</p>
        </div>
      )}

      <div className="space-y-4">
        {questions.map((q, qIdx) => (
          <fieldset key={qIdx} className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <legend className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
                Question {qIdx + 1}
              </legend>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveQuestion(qIdx, -1)}
                  disabled={qIdx === 0}
                  aria-label={`Move question ${qIdx + 1} up`}
                  className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronUp className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => moveQuestion(qIdx, 1)}
                  disabled={qIdx === questions.length - 1}
                  aria-label={`Move question ${qIdx + 1} down`}
                  className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronDown className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => removeQuestion(qIdx)}
                  aria-label={`Remove question ${qIdx + 1}`}
                  className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-600" htmlFor={`q-${qIdx}-text`}>
                Question text
              </label>
              <textarea
                id={`q-${qIdx}-text`}
                value={q.question}
                onChange={(e) => patchQuestion(qIdx, { question: e.target.value })}
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-nava-plum focus:outline-none"
              />
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-semibold text-gray-600">
                Options (select the correct answer)
              </span>
              {q.options.map((opt, oIdx) => (
                <div key={oIdx} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`correct-${qIdx}`}
                    checked={q.correctIndex === oIdx}
                    onChange={() => patchQuestion(qIdx, { correctIndex: oIdx })}
                    aria-label={`Mark question ${qIdx + 1} option ${oIdx + 1} correct`}
                    className="text-nava-green focus:ring-nava-plum shrink-0"
                  />
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => setOption(qIdx, oIdx, e.target.value)}
                    aria-label={`Question ${qIdx + 1} option ${oIdx + 1}`}
                    placeholder={`Option ${oIdx + 1}`}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-nava-plum focus:outline-none"
                  />
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <label
                className="block text-xs font-semibold text-gray-600"
                htmlFor={`q-${qIdx}-explanation`}
              >
                Explanation (shown after answering)
              </label>
              <textarea
                id={`q-${qIdx}-explanation`}
                value={q.explanation}
                onChange={(e) => patchQuestion(qIdx, { explanation: e.target.value })}
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-nava-plum focus:outline-none"
              />
            </div>
          </fieldset>
        ))}
      </div>

      <button
        type="button"
        onClick={addQuestion}
        className="inline-flex items-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <Plus className="w-4 h-4" aria-hidden="true" />
        Add question
      </button>

      {!valid && (
        <p className="text-sm text-amber-700" role="alert">
          {validation.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={busy !== null || !valid}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-5 py-2 text-sm font-bold text-gray-800 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {busy === 'save' ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="w-4 h-4" aria-hidden="true" />
          )}
          Save draft
        </button>
        <button
          onClick={handlePublish}
          disabled={busy !== null || !valid}
          className="inline-flex items-center gap-2 rounded-xl bg-nava-green px-5 py-2 text-sm font-bold text-white hover:bg-nava-green/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {busy === 'publish' ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="w-4 h-4" aria-hidden="true" />
          )}
          Publish
        </button>
      </div>
    </div>
  );
}

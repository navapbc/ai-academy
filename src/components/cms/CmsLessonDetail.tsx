import { useState } from 'react';
import {
  ArrowLeft,
  FileText,
  Video,
  Sparkles,
  Pencil,
  ListChecks,
  FlaskConical,
  Archive,
  RotateCcw,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import type { CmsLessonDetailData } from '../../lib/cmsContent';
import { archiveLesson, restoreLesson } from '../../lib/adminContent';
import { StatusBadge } from './StatusBadge';

// Read-only lesson detail for the admin CMS (P5.4-2). Shows the current LIVE
// content a learner reads, plus a note when an unpublished draft is staged on the
// row. An "Edit" affordance opens the text/video/tutor-ref editor (P5.4-3); "Edit
// quiz" opens the quiz editor (P5.4-4); "Edit lab" opens the kind-aware lab editor
// (P5.4-5). Archive/Restore (P5.4-6) soft-delete the lesson: archived lessons are
// hidden from learners (R6) but never hard-deleted, and can be restored.

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof FileText;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-gray-500">
        <Icon className="w-4 h-4 text-nava-green" aria-hidden="true" />
        {label}
      </div>
      {children}
    </div>
  );
}

export default function CmsLessonDetail({
  lesson,
  onBack,
  onEdit,
  onEditQuiz,
  onEditLab,
  onSaved,
}: {
  lesson: CmsLessonDetailData;
  onBack: () => void;
  onEdit: () => void;
  onEditQuiz: () => void;
  onEditLab: () => void;
  /** Called after a successful archive/restore so the list + detail reflect it. */
  onSaved: () => void;
}) {
  const draftFieldKeys = lesson.draft ? Object.keys(lesson.draft) : [];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runArchiveToggle = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await (lesson.archived ? restoreLesson(lesson.cellId) : archiveLesson(lesson.cellId));
      setBusy(false);
      onSaved();
    } catch (err: unknown) {
      setBusy(false);
      setError(
        err instanceof Error
          ? err.message
          : `Could not ${lesson.archived ? 'restore' : 'archive'} the lesson.`,
      );
    }
  };

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
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold uppercase tracking-widest text-nava-green">
              {lesson.cellId}
            </span>
            <StatusBadge status={lesson.status} archived={lesson.archived} />
            {lesson.origin === 'custom' && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
                Custom
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={runArchiveToggle}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : lesson.archived ? (
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Archive className="w-4 h-4" aria-hidden="true" />
              )}
              {lesson.archived ? 'Restore' : 'Archive'}
            </button>
            <button
              onClick={onEditLab}
              className="inline-flex items-center gap-1.5 rounded-xl border border-nava-green px-4 py-2 text-sm font-bold text-nava-green hover:bg-nava-green/5 transition-all"
            >
              <FlaskConical className="w-4 h-4" aria-hidden="true" />
              Edit lab
            </button>
            <button
              onClick={onEditQuiz}
              className="inline-flex items-center gap-1.5 rounded-xl border border-nava-green px-4 py-2 text-sm font-bold text-nava-green hover:bg-nava-green/5 transition-all"
            >
              <ListChecks className="w-4 h-4" aria-hidden="true" />
              Edit quiz
            </button>
            <button
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 rounded-xl bg-nava-green px-4 py-2 text-sm font-bold text-white hover:bg-nava-plum transition-all"
            >
              <Pencil className="w-4 h-4" aria-hidden="true" />
              Edit
            </button>
          </div>
        </div>
        <h1 className="text-2xl font-bold text-gray-900" tabIndex={-1}>
          {lesson.title}
        </h1>
        <p className="text-sm text-gray-600">
          {lesson.type} · {lesson.stage ? `Stage ${lesson.stage}` : 'Additional lesson'} · v
          {lesson.version}
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex gap-2" role="alert">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {lesson.archived && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
          <p className="text-sm font-semibold text-gray-800">Archived</p>
          <p className="mt-1 text-sm text-gray-600">
            This lesson is soft-deleted and hidden from learners. It is never hard-deleted — restore
            it to bring it back.
          </p>
        </div>
      )}

      {lesson.draft && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">Unpublished draft staged</p>
          <p className="mt-1 text-sm text-amber-800">
            Edits to {draftFieldKeys.length > 0 ? draftFieldKeys.join(', ') : 'this lesson'} are
            saved but not yet published. Learners still see the live content below. Open the editor
            to continue or publish.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-5">
        <Field icon={Video} label="Video">
          {lesson.videoUrl ? (
            <a
              href={lesson.videoUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-nava-green hover:text-nava-plum break-all underline"
            >
              {lesson.videoUrl}
            </a>
          ) : (
            <p className="text-sm text-gray-400">No video.</p>
          )}
        </Field>

        <Field icon={Sparkles} label="Tutor reference">
          {lesson.tutorReference ? (
            <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">
              {lesson.tutorReference}
            </pre>
          ) : (
            <p className="text-sm text-gray-400">No extra tutor grounding.</p>
          )}
        </Field>

        <Field icon={FileText} label="Lesson body (live)">
          {lesson.bodyMd ? (
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm text-gray-700 font-sans">
              {lesson.bodyMd}
            </pre>
          ) : (
            <p className="text-sm text-gray-400">No lesson body.</p>
          )}
        </Field>

        <div className="grid grid-cols-3 gap-3 border-t border-gray-100 pt-4 text-sm">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Quiz</p>
            <p className="text-gray-800">
              {lesson.quiz ? `${lesson.quiz.length} question(s)` : 'None'}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Lab</p>
            <p className="text-gray-800">{lesson.labConfig ? lesson.labConfig.kind : 'None'}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Sorter</p>
            <p className="text-gray-800">{lesson.sorterConfig ? 'Configured' : 'None'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

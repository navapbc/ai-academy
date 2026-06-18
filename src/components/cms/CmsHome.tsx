import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Loader2, AlertTriangle, ChevronRight, FileEdit } from 'lucide-react';
import {
  fetchCmsLessons,
  buildCmsLessonList,
  filterLessons,
  buildCmsLessonDetail,
  type CmsLessonRow,
  type CmsLessonSummary,
} from '../../lib/cmsContent';
import { StatusBadge } from './StatusBadge';
import CmsLessonDetail from './CmsLessonDetail';
import LessonEditor from './LessonEditor';
import QuizEditor from './QuizEditor';

// Admin CMS home (P5.4-2 / -3): an admin-only list of every lesson (matrix +
// custom) with status, a pending-draft indicator, and an archived filter. Clicking
// a lesson opens a read-only detail; "Edit" opens the text/video/tutor-ref editor
// (P5.4-3). In-page list↔detail↔editor (no new top-level View), mirroring
// CohortManagement / ReviewQueue.

export default function CmsHome({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<CmsLessonRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<'lesson' | 'quiz' | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchCmsLessons()
      .then((data) => {
        setRows(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        console.error('[CmsHome] load failed', err);
        setError('Could not load lessons.');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Detail / editor: shape the selected row on demand. The editor writes through
  // the admin-content function; onSaved re-fetches so the list + detail reflect
  // the new status/draft, then returns to the read-only detail.
  const selectedRow = selectedId ? rows?.find((r) => r.cell_id === selectedId) : undefined;
  if (selectedRow) {
    const detail = buildCmsLessonDetail(selectedRow);
    if (editing === 'lesson') {
      return <LessonEditor lesson={detail} onBack={() => setEditing(null)} onSaved={load} />;
    }
    if (editing === 'quiz') {
      return <QuizEditor lesson={detail} onBack={() => setEditing(null)} onSaved={load} />;
    }
    return (
      <CmsLessonDetail
        lesson={detail}
        onBack={() => {
          setSelectedId(null);
          setEditing(null);
        }}
        onEdit={() => setEditing('lesson')}
        onEditQuiz={() => setEditing('quiz')}
      />
    );
  }

  const allLessons = rows ? buildCmsLessonList(rows) : [];
  const lessons = filterLessons(allLessons, includeArchived);
  const archivedCount = allLessons.filter((l) => l.archived).length;

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-nava-green hover:text-nava-plum transition-colors"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Back to staff area
      </button>

      <header className="space-y-1">
        <span className="text-[11px] font-bold uppercase tracking-widest text-nava-green">Admin</span>
        <h1 className="text-2xl font-bold text-gray-900" tabIndex={-1}>
          Content management
        </h1>
        <p className="text-sm text-gray-600">
          Every lesson in the matrix plus any custom lessons, with editorial status. Open a lesson
          to edit its text, video, and tutor reference, then publish.
        </p>
      </header>

      {rows && !loading && !error && archivedCount > 0 && (
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
            className="rounded border-gray-300 text-nava-green focus:ring-nava-green"
          />
          Show archived ({archivedCount})
        </label>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12" role="status">
          <Loader2 className="w-6 h-6 text-nava-green animate-spin" aria-hidden="true" />
          <span className="sr-only">Loading lessons…</span>
        </div>
      )}

      {error && !loading && (
        <div className="max-w-md text-center space-y-3 py-8 mx-auto" role="alert">
          <AlertTriangle className="w-8 h-8 text-orange-500 mx-auto" aria-hidden="true" />
          <p className="text-sm text-gray-700">{error}</p>
          <button
            onClick={load}
            className="px-5 py-2 bg-nava-green hover:bg-nava-plum text-white rounded-xl font-bold transition-all"
          >
            Retry
          </button>
        </div>
      )}

      {rows && !loading && !error && (
        <ul className="space-y-2">
          {lessons.length === 0 ? (
            <li className="text-sm text-gray-500">No lessons to show.</li>
          ) : (
            lessons.map((lesson) => <LessonRow key={lesson.cellId} lesson={lesson} onOpen={setSelectedId} />)
          )}
        </ul>
      )}
    </div>
  );
}

function LessonRow({
  lesson,
  onOpen,
}: {
  lesson: CmsLessonSummary;
  onOpen: (cellId: string) => void;
}) {
  return (
    <li>
      <button
        onClick={() => onOpen(lesson.cellId)}
        className="flex w-full items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="shrink-0 w-12 text-xs font-bold uppercase tracking-widest text-gray-400">
          {lesson.cellId}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 truncate">{lesson.title}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {lesson.type}
            {lesson.origin === 'custom' && ' · custom'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {lesson.hasPendingDraft && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 rounded-full px-2 py-0.5"
              title="Unpublished draft staged"
            >
              <FileEdit className="w-3 h-3" aria-hidden="true" />
              Draft pending
            </span>
          )}
          <StatusBadge status={lesson.status} archived={lesson.archived} />
        </div>
        <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" aria-hidden="true" />
      </button>
    </li>
  );
}

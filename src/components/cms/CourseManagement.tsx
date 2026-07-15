import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  Plus,
  Trash2,
  Pencil,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import {
  fetchCourseAuthoring,
  createWeek,
  updateWeek,
  reorderWeeks,
  deleteWeek,
  assignModule,
  unassignModule,
  reorderWeekModules,
  type AuthoringCourse,
  type AuthoringModule,
  type AuthoringWeek,
  type CourseAuthoringData,
} from '../../lib/adminCourses';

// Admin course authoring (cohort-restructure U3). Courses hold ordered weeks;
// weeks hold an ordered list of existing PUBLISHED modules (course_week_modules,
// unique(cell_id) — a module belongs to at most one week, so the picker offers
// only published modules not yet assigned anywhere). Create/rename/reorder/
// delete weeks and assign/unassign/reorder members all go through the
// server-authoritative admin-courses Edge Function (the structure tables have
// no client-write RLS); reads use the staff SELECT RLS, so every week — empty
// or not — is visible here even though learners only see weeks with a published
// member. Admin-only — gated by the StaffArea entry (admin) and the function's
// own admin check. Reloads after each write (simple + always correct). Evolves
// the WorkshopManagement ordered-picker patterns.

/**
 * The create/rename form for one week (create when `existing` is null). Owns
 * the draft title/subtitle locally; on submit it calls the matching admin
 * action and hands control back to the parent to reload.
 */
function WeekForm({
  courseId,
  existing,
  busy,
  onSave,
  onCancel,
}: {
  courseId: string;
  existing: AuthoringWeek | null;
  busy: boolean;
  onSave: (fn: () => Promise<void>) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? '');
  const [subtitle, setSubtitle] = useState(existing?.subtitle ?? '');

  const trimmedTitle = title.trim();
  const canSave = trimmedTitle !== '' && !busy;

  const submit = () => {
    if (!canSave) return;
    const subtitleValue = subtitle.trim() === '' ? null : subtitle.trim();
    onSave(async () => {
      if (existing) {
        await updateWeek(existing.id, trimmedTitle, subtitleValue);
      } else {
        await createWeek(courseId, trimmedTitle, subtitleValue);
      }
    });
  };

  return (
    <form
      className="rounded-xl border border-gray-200 bg-white p-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h4 className="text-sm font-bold text-gray-900">{existing ? 'Rename week' : 'New week'}</h4>

      <div className="space-y-1">
        <label className="text-[11px] font-bold uppercase tracking-widest text-gray-500" htmlFor="week-title">
          Title
        </label>
        <input
          id="week-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Week 5"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label className="text-[11px] font-bold uppercase tracking-widest text-gray-500" htmlFor="week-subtitle">
          Subtitle (optional)
        </label>
        <input
          id="week-subtitle"
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
          placeholder="e.g. Ground & Scope for Improvement"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
        <button
          type="submit"
          disabled={!canSave}
          className="inline-flex items-center gap-1.5 rounded-lg bg-nava-green px-4 py-2 text-sm font-bold text-white hover:bg-nava-plum disabled:opacity-40"
        >
          {existing ? 'Save changes' : 'Create week'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * One week card: header (title/subtitle + rename/move/delete) and the ordered
 * member list with add (published-only picker)/remove/move up/down. Every
 * mutation is immediate — the parent reloads after each write.
 */
function WeekCard({
  week,
  index,
  weekCount,
  assignable,
  busy,
  onAction,
  onRename,
  onReorderWeek,
}: {
  week: AuthoringWeek;
  index: number;
  weekCount: number;
  assignable: AuthoringModule[];
  busy: boolean;
  onAction: (fn: () => Promise<void>) => void;
  onRename: () => void;
  onReorderWeek: (index: number, delta: number) => void;
}) {
  const [toAdd, setToAdd] = useState('');

  const moveMember = (memberIndex: number, delta: number) => {
    const target = memberIndex + delta;
    if (target < 0 || target >= week.members.length) return;
    const next = week.members.map((m) => m.cellId);
    [next[memberIndex], next[target]] = [next[target], next[memberIndex]];
    onAction(() => reorderWeekModules(week.id, next));
  };

  const heading = week.subtitle ? `${week.title} — ${week.subtitle}` : week.title;
  const isEmpty = week.members.length === 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-gray-900">{heading}</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            {week.members.length} {week.members.length === 1 ? 'module' : 'modules'}
            {isEmpty && ' · hidden from learners until it has a published module'}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={busy || index === 0}
            onClick={() => onReorderWeek(index, -1)}
            className="p-1 text-gray-400 hover:text-nava-green disabled:opacity-30"
            aria-label={`Move ${week.title} up`}
          >
            <ChevronUp className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={busy || index === weekCount - 1}
            onClick={() => onReorderWeek(index, 1)}
            className="p-1 text-gray-400 hover:text-nava-green disabled:opacity-30"
            aria-label={`Move ${week.title} down`}
          >
            <ChevronDown className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onRename}
            className="p-1 text-gray-400 hover:text-nava-green disabled:opacity-40"
            aria-label={`Rename ${week.title}`}
          >
            <Pencil className="w-4 h-4" aria-hidden="true" />
          </button>
          {/* Only an EMPTY week is deletable (the function 409s otherwise). */}
          <button
            type="button"
            disabled={busy || !isEmpty}
            title={isEmpty ? undefined : 'Unassign its modules first'}
            onClick={() => {
              if (window.confirm(`Delete week "${week.title}"?`)) {
                onAction(() => deleteWeek(week.id));
              }
            }}
            className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-30"
            aria-label={`Delete ${week.title}`}
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </button>
        </span>
      </div>

      {isEmpty ? (
        <p className="text-xs text-gray-400">No modules yet — assign published modules below.</p>
      ) : (
        <ol className="space-y-1">
          {week.members.map((member, memberIndex) => (
            <li
              key={member.cellId}
              className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate text-gray-800">
                <span className="font-mono text-xs text-gray-500">{member.cellId}</span>{' '}
                {member.title}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  disabled={busy || memberIndex === 0}
                  onClick={() => moveMember(memberIndex, -1)}
                  className="p-1 text-gray-400 hover:text-nava-green disabled:opacity-30"
                  aria-label={`Move ${member.cellId} up`}
                >
                  <ChevronUp className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={busy || memberIndex === week.members.length - 1}
                  onClick={() => moveMember(memberIndex, 1)}
                  className="p-1 text-gray-400 hover:text-nava-green disabled:opacity-30"
                  aria-label={`Move ${member.cellId} down`}
                >
                  <ChevronDown className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onAction(() => unassignModule(member.cellId))}
                  className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-40"
                  aria-label={`Unassign ${member.cellId}`}
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}

      {assignable.length > 0 ? (
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`assign-${week.id}`}>
            Assign a published module to {week.title}
          </label>
          <select
            id={`assign-${week.id}`}
            value={toAdd}
            disabled={busy}
            onChange={(e) => setToAdd(e.target.value)}
            className="flex-1 min-w-0 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">Assign a published module…</option>
            {assignable.map((o) => (
              <option key={o.cellId} value={o.cellId}>
                {o.cellId} — {o.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || toAdd === ''}
            onClick={() => {
              if (toAdd) onAction(() => assignModule(week.id, toAdd));
              setToAdd('');
            }}
            className="shrink-0 rounded-lg bg-nava-green px-3 py-1.5 text-sm font-bold text-white hover:bg-nava-plum disabled:opacity-40"
          >
            Assign
          </button>
        </div>
      ) : (
        <p className="text-xs text-gray-400">
          Every published module is already assigned to a week.
        </p>
      )}
    </div>
  );
}

export default function CourseManagement({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<CourseAuthoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // null = no form open; { courseId, weekId: null } = create form for that
  // course; { courseId, weekId } = rename that week.
  const [editing, setEditing] = useState<{ courseId: string; weekId: string | null } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchCourseAuthoring()
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((err: unknown) => {
        console.error('[CourseManagement] load failed', err);
        setError('Could not load the course structure.');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Run a write, then reload + close any open form. Serializes writes (busy)
  // and surfaces failures without closing the form so a draft isn't lost.
  const runAction = useCallback((fn: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    fn()
      .then(() => fetchCourseAuthoring())
      .then((d) => {
        setData(d);
        setBusy(false);
        setEditing(null);
      })
      .catch((err: unknown) => {
        console.error('[CourseManagement] action failed', err);
        setActionError(err instanceof Error ? err.message : 'The change could not be applied.');
        setBusy(false);
      });
  }, []);

  const reorderWeek = (course: AuthoringCourse) => (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= course.weeks.length) return;
    const next = course.weeks.map((w) => w.id);
    [next[index], next[target]] = [next[target], next[index]];
    runAction(() => reorderWeeks(course.id, next));
  };

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
          Course management
        </h1>
        <p className="text-sm text-gray-600">
          Author course weeks and assign published modules. Learners see a week once it has a
          published module; a module belongs to at most one week.
        </p>
      </header>

      {actionError && (
        <div
          className="flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3"
          role="alert"
        >
          <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0" aria-hidden="true" />
          <span className="text-sm text-gray-700">{actionError}</span>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12" role="status">
          <Loader2 className="w-6 h-6 text-nava-green animate-spin" aria-hidden="true" />
          <span className="sr-only">Loading course structure…</span>
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

      {data && !loading && !error && (
        <div className="space-y-8">
          {data.courses.length === 0 && (
            <p className="text-sm text-gray-500">No courses exist yet (they are seeded, not created here).</p>
          )}
          {data.courses.map((course) => (
            <section key={course.id} className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-lg font-bold text-gray-900">{course.title}</h2>
                {(!editing || editing.courseId !== course.id) && (
                  <button
                    onClick={() => {
                      setActionError(null);
                      setEditing({ courseId: course.id, weekId: null });
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-nava-green px-4 py-2 text-sm font-bold text-white hover:bg-nava-plum"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    New week
                  </button>
                )}
              </div>

              {editing && editing.courseId === course.id && (
                <WeekForm
                  // Remount when the target changes so the draft state resets
                  // (rename week A → rename week B must not keep A's title).
                  key={editing.weekId ?? 'new'}
                  courseId={course.id}
                  existing={
                    editing.weekId ? course.weeks.find((w) => w.id === editing.weekId) ?? null : null
                  }
                  busy={busy}
                  onSave={runAction}
                  onCancel={() => {
                    setActionError(null);
                    setEditing(null);
                  }}
                />
              )}

              {course.weeks.length === 0 ? (
                <p className="text-sm text-gray-500">No weeks yet. Create one above.</p>
              ) : (
                <div className="space-y-3">
                  {course.weeks.map((week, index) => (
                    <WeekCard
                      key={week.id}
                      week={week}
                      index={index}
                      weekCount={course.weeks.length}
                      assignable={data.assignable}
                      busy={busy}
                      onAction={runAction}
                      onRename={() => {
                        setActionError(null);
                        setEditing({ courseId: course.id, weekId: week.id });
                      }}
                      onReorderWeek={reorderWeek(course)}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

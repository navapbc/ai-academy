import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { createWorkshop, updateWorkshop, deleteWorkshop } from '../../lib/adminWorkshops';
import { fetchWorkshops, type Workshop } from '../../lib/workshops';
import { fetchCurriculum } from '../../lib/modules';
import type { Module } from '../../types';

// Admin workshop authoring (X.3 Unit 3). A workshop is admin-authored
// orchestration only: an ordered list of existing published-module cell_ids
// (step_cell_ids) over the content-as-data curriculum. Create/edit/delete all
// go through the server-authoritative admin-workshops Edge Function (the
// workshops table has no client-write RLS); reads use the authenticated SELECT
// RLS. Admin-only — gated by the StaffArea entry (admin) and the function's own
// admin check. Reloads after each write (simple + always correct). Mirrors
// CohortManagement.

/** A published module offered in the step picker (cell_id + human title). */
interface StepOption {
  cellId: string;
  title: string;
}

/**
 * The editor form for one workshop (create when `existing` is null, otherwise
 * edit). Owns the draft title/intro/ordered-step state locally; on submit it
 * calls the matching admin action and hands control back to the parent to
 * reload. The step picker adds a published module to the end of the ordered
 * list; up/down reorder and remove operate in place. The array order IS the
 * step order (step_cell_ids).
 */
function WorkshopEditor({
  existing,
  options,
  busy,
  onSave,
  onCancel,
}: {
  existing: Workshop | null;
  options: StepOption[];
  busy: boolean;
  onSave: (fn: () => Promise<void>) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? '');
  const [intro, setIntro] = useState(existing?.intro ?? '');
  const [steps, setSteps] = useState<string[]>(existing?.stepCellIds ?? []);
  const [toAdd, setToAdd] = useState('');

  const titleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of options) m.set(o.cellId, o.title);
    return m;
  }, [options]);

  // Only offer modules not already in the ordered list.
  const addable = options.filter((o) => !steps.includes(o.cellId));

  const move = (index: number, delta: number) => {
    setSteps((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const remove = (cellId: string) => setSteps((prev) => prev.filter((id) => id !== cellId));

  const trimmedTitle = title.trim();
  const canSave = trimmedTitle !== '' && !busy;

  const submit = () => {
    if (!canSave) return;
    const introValue = intro.trim() === '' ? null : intro.trim();
    onSave(async () => {
      if (existing) {
        await updateWorkshop(existing.id, trimmedTitle, steps, introValue);
      } else {
        await createWorkshop(trimmedTitle, steps, introValue);
      }
    });
  };

  return (
    <form
      className="rounded-xl border border-gray-200 bg-white p-5 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h3 className="text-base font-bold text-gray-900">
        {existing ? 'Edit workshop' : 'New workshop'}
      </h3>

      <div className="space-y-1">
        <label className="text-[11px] font-bold uppercase tracking-widest text-gray-500" htmlFor="workshop-title">
          Title
        </label>
        <input
          id="workshop-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Workshop title"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label className="text-[11px] font-bold uppercase tracking-widest text-gray-500" htmlFor="workshop-intro">
          Intro (optional)
        </label>
        <textarea
          id="workshop-intro"
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          placeholder="A short description shown to learners."
          rows={2}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
          Steps ({steps.length})
        </p>
        {steps.length === 0 ? (
          <p className="text-xs text-gray-400">
            No steps yet — add published modules below. A workshop can be saved with no steps.
          </p>
        ) : (
          <ol className="space-y-1">
            {steps.map((cellId, index) => (
              <li
                key={cellId}
                className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate text-gray-800">
                  <span className="font-mono text-xs text-gray-500">{cellId}</span>{' '}
                  {titleById.get(cellId) ?? '(unknown module)'}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled={busy || index === 0}
                    onClick={() => move(index, -1)}
                    className="p-1 text-gray-400 hover:text-nava-green disabled:opacity-30"
                    aria-label={`Move ${cellId} up`}
                  >
                    <ChevronUp className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={busy || index === steps.length - 1}
                    onClick={() => move(index, 1)}
                    className="p-1 text-gray-400 hover:text-nava-green disabled:opacity-30"
                    aria-label={`Move ${cellId} down`}
                  >
                    <ChevronDown className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove(cellId)}
                    className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-40"
                    aria-label={`Remove ${cellId}`}
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </span>
              </li>
            ))}
          </ol>
        )}

        {addable.length > 0 ? (
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="workshop-add-step">
              Add a published module
            </label>
            <select
              id="workshop-add-step"
              value={toAdd}
              disabled={busy}
              onChange={(e) => setToAdd(e.target.value)}
              className="flex-1 min-w-0 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">Add a published module…</option>
              {addable.map((o) => (
                <option key={o.cellId} value={o.cellId}>
                  {o.cellId} — {o.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy || toAdd === ''}
              onClick={() => {
                if (toAdd) setSteps((prev) => [...prev, toAdd]);
                setToAdd('');
              }}
              className="shrink-0 rounded-lg bg-nava-green px-3 py-1.5 text-sm font-bold text-white hover:bg-nava-plum disabled:opacity-40"
            >
              Add
            </button>
          </div>
        ) : (
          <p className="text-xs text-gray-400">All published modules are already in this workshop.</p>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
        <button
          type="submit"
          disabled={!canSave}
          className="inline-flex items-center gap-1.5 rounded-lg bg-nava-green px-4 py-2 text-sm font-bold text-white hover:bg-nava-plum disabled:opacity-40"
        >
          {existing ? 'Save changes' : 'Create workshop'}
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

export default function WorkshopManagement({ onBack }: { onBack: () => void }) {
  const [workshops, setWorkshops] = useState<Workshop[] | null>(null);
  const [options, setOptions] = useState<StepOption[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // null = no editor open; { id: null } = create form; { id } = edit that workshop.
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchWorkshops(), fetchCurriculum()])
      .then(([ws, curriculum]) => {
        setWorkshops(ws);
        // Only PUBLISHED modules are offered as workshop steps.
        const published: StepOption[] = curriculum.sections
          .flatMap((s) => s.modules)
          .filter((m: Module) => m.status === 'published')
          .map((m) => ({ cellId: m.cellId, title: m.title }));
        setOptions(published);
        setLoading(false);
      })
      .catch((err: unknown) => {
        console.error('[WorkshopManagement] load failed', err);
        setError('Could not load workshops.');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Run a write, then reload + close the editor. Serializes writes (busy) and
  // surfaces failures without closing the editor so the draft isn't lost.
  const runAction = useCallback(
    (fn: () => Promise<void>) => {
      setBusy(true);
      setActionError(null);
      fn()
        .then(() => Promise.all([fetchWorkshops(), fetchCurriculum()]))
        .then(([ws, curriculum]) => {
          setWorkshops(ws);
          setOptions(
            curriculum.sections
              .flatMap((s) => s.modules)
              .filter((m: Module) => m.status === 'published')
              .map((m) => ({ cellId: m.cellId, title: m.title })),
          );
          setBusy(false);
          setEditing(null);
        })
        .catch((err: unknown) => {
          console.error('[WorkshopManagement] action failed', err);
          setActionError(err instanceof Error ? err.message : 'The change could not be applied.');
          setBusy(false);
        });
    },
    [],
  );

  const editingWorkshop =
    editing && editing.id ? (workshops ?? []).find((w) => w.id === editing.id) ?? null : null;

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
          Workshop management
        </h1>
        <p className="text-sm text-gray-600">
          Build workshops — an ordered path through existing published modules.
        </p>
      </header>

      {!editing && !loading && !error && (
        <button
          onClick={() => {
            setActionError(null);
            setEditing({ id: null });
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-nava-green px-4 py-2 text-sm font-bold text-white hover:bg-nava-plum"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          New workshop
        </button>
      )}

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
          <span className="sr-only">Loading workshops…</span>
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

      {editing && options && !loading && !error && (
        <WorkshopEditor
          existing={editingWorkshop}
          options={options}
          busy={busy}
          onSave={runAction}
          onCancel={() => {
            setActionError(null);
            setEditing(null);
          }}
        />
      )}

      {!editing && workshops && !loading && !error && (
        <div className="space-y-3">
          {workshops.length === 0 ? (
            <p className="text-sm text-gray-500">No workshops yet. Create one above.</p>
          ) : (
            workshops.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4"
              >
                <div className="min-w-0">
                  <h3 className="truncate text-base font-bold text-gray-900">{w.title}</h3>
                  <p className="mt-0.5 text-sm text-gray-600">
                    {w.stepCellIds.length} {w.stepCellIds.length === 1 ? 'step' : 'steps'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setActionError(null);
                      setEditing({ id: w.id });
                    }}
                    className="p-1.5 text-gray-400 hover:text-nava-green disabled:opacity-40"
                    aria-label={`Edit ${w.title}`}
                  >
                    <Pencil className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`Delete workshop "${w.title}"?`)) {
                        runAction(() => deleteWorkshop(w.id));
                      }
                    }}
                    className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-40"
                    aria-label={`Delete ${w.title}`}
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

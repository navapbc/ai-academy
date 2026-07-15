import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, AlertTriangle, Archive, Plus, Trash2, X, Check, Pencil } from 'lucide-react';
import {
  fetchCohortManagement,
  createCohort,
  renameCohort,
  archiveCohort,
  deleteCohort,
  enrollLearner,
  unenrollLearner,
  assignChampion,
  unassignChampion,
  type CohortManagementData,
  type ManagedCohort,
  type ManagedUser,
} from '../../lib/adminCohorts';

// Admin cohort management (P5.5a; multi-enrollment + lifecycle U5). Create/rename/
// archive cohorts, enroll/unenroll learners per cohort (a learner may belong to
// several cohorts at once — enrolling never moves anyone), assign/unassign
// champions. Archived cohorts are read-only (kept out of the pickers, shown
// behind a toggle); hard delete is only offered at zero enrollments (the Edge
// Function 409s otherwise). All writes go through the admin-cohorts service_role
// Edge Function; reads use admin RLS. Admin-only — gated by the StaffArea entry
// (admin) and RoleGuard, with the function's own admin check as the backstop.
// Reloads after each write (simple + always correct).

function UserPicker({
  label,
  options,
  onPick,
  disabled,
}: {
  label: string;
  options: ManagedUser[];
  onPick: (userId: string) => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState('');
  if (options.length === 0) {
    return <p className="text-xs text-gray-400">No eligible users.</p>;
  }
  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor={`${label}-select`}>
        {label}
      </label>
      <select
        id={`${label}-select`}
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        className="flex-1 min-w-0 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
      >
        <option value="">{label}…</option>
        {options.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={disabled || value === ''}
        onClick={() => {
          if (value) onPick(value);
          setValue('');
        }}
        className="shrink-0 rounded-lg bg-nava-green px-3 py-1.5 text-sm font-bold text-white hover:bg-nava-plum disabled:opacity-40"
      >
        Add
      </button>
    </div>
  );
}

function CohortCard({
  cohort,
  users,
  busy,
  onRun,
}: {
  cohort: ManagedCohort;
  users: ManagedUser[];
  busy: boolean;
  onRun: (fn: () => Promise<void>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(cohort.name);

  const archived = cohort.archivedAt !== null;
  const memberIds = new Set(cohort.members.map((m) => m.id));
  const championIds = new Set(cohort.champions.map((c) => c.id));
  const enrollable = users.filter((u) => !memberIds.has(u.id));
  const assignable = users.filter((u) => !championIds.has(u.id));
  // Hard delete is only possible at zero enrollments (the function 409s
  // otherwise); keep the button honest instead of surfacing the rejection.
  const deletable = cohort.members.length === 0;

  return (
    <div
      className={`rounded-xl border p-5 space-y-4 ${
        archived ? 'border-gray-200 bg-gray-50' : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        {editing && !archived ? (
          <div className="flex items-center gap-2 flex-1">
            <label className="sr-only" htmlFor={`rename-${cohort.id}`}>
              Cohort name
            </label>
            <input
              id={`rename-${cohort.id}`}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="flex-1 min-w-0 rounded-lg border border-gray-300 px-2 py-1.5 text-sm font-semibold"
            />
            <button
              type="button"
              disabled={busy || draftName.trim() === '' || draftName.trim() === cohort.name}
              onClick={() =>
                onRun(async () => {
                  await renameCohort(cohort.id, draftName.trim());
                  setEditing(false);
                })
              }
              className="shrink-0 text-nava-green hover:text-nava-plum disabled:opacity-40"
              aria-label="Save name"
            >
              <Check className="w-5 h-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => {
                setDraftName(cohort.name);
                setEditing(false);
              }}
              className="shrink-0 text-gray-400 hover:text-gray-700"
              aria-label="Cancel rename"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="text-base font-bold text-gray-900 truncate">{cohort.name}</h3>
              {archived && (
                <span className="shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                  Archived · read-only
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {!archived && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftName(cohort.name);
                      setEditing(true);
                    }}
                    className="p-1.5 text-gray-400 hover:text-nava-green"
                    aria-label={`Rename ${cohort.name}`}
                  >
                    <Pencil className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Archive cohort "${cohort.name}"? Learners keep their enrollments and program access, and champions keep their dashboards — the cohort just becomes read-only.`,
                        )
                      ) {
                        onRun(() => archiveCohort(cohort.id));
                      }
                    }}
                    className="p-1.5 text-gray-400 hover:text-nava-green disabled:opacity-40"
                    aria-label={`Archive ${cohort.name}`}
                  >
                    <Archive className="w-4 h-4" aria-hidden="true" />
                  </button>
                </>
              )}
              <button
                type="button"
                disabled={busy || !deletable}
                title={deletable ? undefined : 'Unenroll all learners first, or archive instead.'}
                onClick={() => {
                  if (
                    window.confirm(
                      `Delete cohort "${cohort.name}"? This is permanent; its champion assignments are removed.`,
                    )
                  ) {
                    onRun(() => deleteCohort(cohort.id));
                  }
                }}
                className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-40"
                aria-label={`Delete ${cohort.name}`}
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
          Learners ({cohort.members.length})
        </p>
        {cohort.members.length > 0 && (
          <ul className="space-y-1">
            {cohort.members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-gray-800">{m.name}</span>
                {!archived && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onRun(() => unenrollLearner(cohort.id, m.id))}
                    className="shrink-0 text-xs font-semibold text-gray-400 hover:text-red-600 disabled:opacity-40"
                  >
                    Unenroll
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {!archived && (
          <UserPicker
            label="Enroll a learner"
            options={enrollable}
            disabled={busy}
            onPick={(userId) => onRun(() => enrollLearner(cohort.id, userId))}
          />
        )}
      </div>

      <div className="space-y-2 border-t border-gray-100 pt-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
          Champions ({cohort.champions.length})
        </p>
        {cohort.champions.length > 0 && (
          <ul className="space-y-1">
            {cohort.champions.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-gray-800">{c.name}</span>
                {/* Unassign stays available on archived cohorts: archive itself
                    never demotes, so explicit unassign is the only way to hand
                    back an ex-champion's role after a cohort wraps up. */}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRun(() => unassignChampion(cohort.id, c.id))}
                  className="shrink-0 text-xs font-semibold text-gray-400 hover:text-red-600 disabled:opacity-40"
                >
                  Unassign
                </button>
              </li>
            ))}
          </ul>
        )}
        {!archived && (
          <UserPicker
            label="Assign a champion"
            options={assignable}
            disabled={busy}
            onPick={(userId) => onRun(() => assignChampion(cohort.id, userId))}
          />
        )}
      </div>
    </div>
  );
}

export default function CohortManagement({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<CohortManagementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const activeCohorts = useMemo(
    () => (data?.cohorts ?? []).filter((c) => c.archivedAt === null),
    [data],
  );
  const archivedCohorts = useMemo(
    () => (data?.cohorts ?? []).filter((c) => c.archivedAt !== null),
    [data],
  );
  const visibleCohorts = showArchived ? [...activeCohorts, ...archivedCohorts] : activeCohorts;

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchCohortManagement()
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((err: unknown) => {
        console.error('[CohortManagement] load failed', err);
        setError('Could not load cohort data.');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Run a write, then reload. Serializes writes (busy) and surfaces failures.
  const runAction = useCallback(
    (fn: () => Promise<void>) => {
      setBusy(true);
      setActionError(null);
      fn()
        .then(() => fetchCohortManagement())
        .then((d) => {
          setData(d);
          setBusy(false);
        })
        .catch((err: unknown) => {
          console.error('[CohortManagement] action failed', err);
          setActionError(err instanceof Error ? err.message : 'The change could not be applied.');
          setBusy(false);
        });
    },
    [],
  );

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
          Cohort management
        </h1>
        <p className="text-sm text-gray-600">
          Create cohorts, enroll learners (a learner can belong to more than one cohort), and
          assign champions. Archive a cohort when it wraps up — learners and champions keep
          their access.
        </p>
      </header>

      {/* Create cohort */}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const name = newName.trim();
          if (name === '') return;
          runAction(async () => {
            await createCohort(name);
            setNewName('');
          });
        }}
      >
        <label className="sr-only" htmlFor="new-cohort-name">
          New cohort name
        </label>
        <input
          id="new-cohort-name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New cohort name"
          className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy || newName.trim() === ''}
          className="inline-flex items-center gap-1.5 shrink-0 rounded-lg bg-nava-green px-4 py-2 text-sm font-bold text-white hover:bg-nava-plum disabled:opacity-40"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Create
        </button>
      </form>

      {actionError && (
        <div className="flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3" role="alert">
          <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0" aria-hidden="true" />
          <span className="text-sm text-gray-700">{actionError}</span>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12" role="status">
          <Loader2 className="w-6 h-6 text-nava-green animate-spin" aria-hidden="true" />
          <span className="sr-only">Loading cohorts…</span>
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
        <>
          {archivedCohorts.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="rounded border-gray-300"
              />
              Show archived cohorts ({archivedCohorts.length})
            </label>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {data.cohorts.length === 0 ? (
              <p className="text-sm text-gray-500">No cohorts yet. Create one above.</p>
            ) : visibleCohorts.length === 0 ? (
              <p className="text-sm text-gray-500">
                No active cohorts. Enable “Show archived cohorts” to see past ones.
              </p>
            ) : (
              visibleCohorts.map((c) => (
                <CohortCard key={c.id} cohort={c} users={data.users} busy={busy} onRun={runAction} />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

import { useState } from 'react';
import { motion } from 'motion/react';
import { ClipboardList, Plus, Trash2, Check, Eye, Sparkles } from 'lucide-react';
import type { FailureLogConfig } from '../../types';
import { useAuth } from '../../lib/auth';
import { recordLabSubmission } from '../../lib/progress';
import {
  evaluateFailureLogReadiness,
  isFailureEntryComplete,
  blankFailureEntry,
  type FailureEntry,
} from './failureLog.ready';

interface Props {
  config: FailureLogConfig;
  labId: string;
}

// P4.9 / cell 2.9 — a personal failure-mode log. The learner records dated
// entries of how AI broke on their actual work — the task, what went wrong, how
// they caught it, and the tell to watch next time — to reuse as pre-flight
// checks. This is graded PRACTICE that records a lab_submissions row but is NOT
// the completion gate (the inline quiz is) — structurally enforced by the absence
// of an onComplete prop. Captured (not LLM-graded) behind a completeness gate.
export default function FailureLog({ config, labId }: Props) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<FailureEntry[]>([blankFailureEntry()]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const readiness = evaluateFailureLogReadiness(entries, config);
  const canSubmit = readiness.ready && !saving && !saved;

  const updateEntry = (i: number, patch: Partial<FailureEntry>) =>
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  const addEntry = () => setEntries((prev) => [...prev, blankFailureEntry()]);
  const removeEntry = (i: number) =>
    setEntries((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaveError(null);
    if (!user) {
      setSaveError('Sign in to save your failure log so a Champion can review it.');
      return;
    }
    setSaving(true);
    try {
      await recordLabSubmission(user.id, {
        labId,
        // Record only the complete entries so a Champion never sees a half-typed
        // trailing row (entries.length then equals entryCount).
        transcript: {
          kind: 'failure-log',
          entries: entries.filter(isFailureEntryComplete),
          entryCount: readiness.completeEntries,
        },
        status: 'submitted',
      });
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save your failure log.');
    } finally {
      setSaving(false);
    }
  };

  // Renders one of an entry's four text fields. Kept local (unlike the prop-driven
  // VerdictButton in P4.8) because it closes over entries + updateEntry and the
  // four calls are otherwise identical markup.
  const field = (i: number, key: keyof FailureEntry, label: string, placeholder: string, rows = 2) => (
    <div className="space-y-1">
      <label htmlFor={`failure-${i}-${key}`} className="block text-xs font-semibold text-gray-600">
        {label}
      </label>
      <textarea
        id={`failure-${i}-${key}`}
        value={entries[i][key]}
        onChange={(e) => updateEntry(i, { [key]: e.target.value })}
        rows={rows}
        placeholder={placeholder}
        className="w-full rounded-xl border-2 border-gray-100 focus:border-nava-green focus:outline-none p-3 text-sm text-gray-700 leading-relaxed resize-y transition-colors"
      />
    </div>
  );

  return (
    <div className="bg-white border-2 border-nava-mint rounded-3xl p-8 shadow-sm space-y-8" id="failure-log">
      <div className="flex items-center gap-3 border-b border-nava-mint pb-6">
        <div className="w-10 h-10 bg-nava-mint rounded-xl flex items-center justify-center text-nava-green">
          <ClipboardList className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold">{config.title}</h3>
          <p className="text-xs text-gray-500">
            Your own record of how AI breaks on your work — it records a submission a Champion can
            review and doesn&apos;t affect your module completion.
          </p>
        </div>
      </div>

      {config.intro && <p className="text-sm font-semibold text-gray-800 leading-relaxed">{config.intro}</p>}

      {saved ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          role="status"
          aria-live="polite"
          className="rounded-2xl border-2 border-nava-green/20 bg-nava-mint/40 p-6 space-y-3"
        >
          <div className="flex items-center gap-2 text-nava-green font-bold">
            <Check className="w-5 h-5" />
            Failure log saved
          </div>
          <p className="flex items-start gap-2 text-sm text-gray-600 leading-relaxed">
            <Eye className="w-4 h-4 text-nava-green shrink-0 mt-0.5" />
            <span>
              Recorded {readiness.completeEntries}{' '}
              {readiness.completeEntries === 1 ? 'entry' : 'entries'} for a Champion to review. Keep
              adding to it over time — aim for {config.targetEntries} and read the matching entries
              before a similar task.
            </span>
          </p>
        </motion.div>
      ) : (
        <>
          <p className="text-xs text-gray-500 leading-relaxed">{config.helper}</p>

          <div className="space-y-4">
            {entries.map((_, i) => (
              <div key={i} className="rounded-2xl border-2 border-gray-100 p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <label htmlFor={`failure-${i}-date`} className="block text-xs font-semibold text-gray-600">
                      Date
                    </label>
                    <input
                      id={`failure-${i}-date`}
                      type="date"
                      value={entries[i].date}
                      onChange={(e) => updateEntry(i, { date: e.target.value })}
                      className="rounded-xl border-2 border-gray-100 focus:border-nava-green focus:outline-none p-2 text-sm text-gray-700 transition-colors"
                    />
                  </div>
                  {entries.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeEntry(i)}
                      aria-label={`Remove failure-log entry ${i + 1}`}
                      className="text-gray-400 hover:text-red-600 transition-colors mt-5"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {field(i, 'task', 'The task', config.taskPlaceholder)}
                {field(i, 'error', 'What went wrong', config.errorPlaceholder)}
                {field(i, 'caught', 'How you caught it', config.caughtPlaceholder)}
                {field(i, 'tell', 'The tell to watch next time', config.tellPlaceholder)}
              </div>
            ))}
            <button
              type="button"
              onClick={addEntry}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-dashed border-gray-200 text-sm font-semibold text-gray-600 hover:border-nava-green hover:text-nava-green transition-all"
            >
              <Plus className="w-4 h-4" />
              Add an entry
            </button>
          </div>

          {saveError && <p role="alert" className="text-xs text-red-600 font-medium">{saveError}</p>}

          {readiness.reasons.length > 0 && (
            <div role="status" aria-live="polite" className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-1">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Before you submit</p>
              <ul className="text-xs text-gray-600 leading-relaxed list-disc pl-4 space-y-0.5">
                {readiness.reasons.map((r, idx) => (
                  <li key={idx}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-gray-100 pt-6">
            <span className={`text-xs font-semibold ${readiness.completeEntries >= config.targetEntries ? 'text-nava-green' : 'text-gray-500'}`}>
              {readiness.completeEntries} / {config.targetEntries} entries
            </span>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex items-center gap-2 px-10 py-3 bg-nava-green text-white rounded-xl font-bold shadow-lg shadow-nava-green/20 disabled:opacity-50 transition-all active:scale-95"
            >
              {saving ? (
                <>
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                    <Sparkles className="w-4 h-4" />
                  </motion.div>
                  Saving…
                </>
              ) : (
                <>
                  <ClipboardList className="w-4 h-4" />
                  Save failure log
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Check, X, AlertTriangle, Sparkles, Gauge } from 'lucide-react';
import type { DashboardCritiqueConfig } from '../../types';
import { useAuth } from '../../lib/auth';
import { recordLabSubmission } from '../../lib/progress';
import { scoreDashboardCritique } from './dashboardCritique.score';

interface Props {
  config: DashboardCritiqueConfig;
  // The cell id this exercise belongs to (e.g. '2.13'); used as the lab_id on the
  // recorded submission.
  labId: string;
}

// 2.13 dashboard-critique (P4.7): the learner reads a speed-only productivity
// dashboard and marks which quality/rework signals it HIDES. On Submit we
// auto-grade against the answer key (no LLM call), surface each signal's `why`,
// and record a lab_submissions row. This is NOT the completion gate — the inline
// quiz still owns completion — so it never calls onComplete.
export default function DashboardCritique({ config, labId }: Props) {
  const { user } = useAuth();
  const { intro, dashboard, signals } = config;

  // ids of signals the learner has marked as MISSING.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [graded, setGraded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const result = scoreDashboardCritique({ selectedIds: [...selected], signals });

  const toggle = (id: string) => {
    if (graded) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (graded || saving) return; // guard the async-save window
    setGraded(true);
    setSaveError(null);

    if (!user) {
      setSaveError('Sign in to record your practice — your answers are graded below.');
      return;
    }

    setSaving(true);
    try {
      await recordLabSubmission(user.id, {
        labId,
        transcript: {
          kind: 'dashboard-critique',
          selectedIds: [...selected],
          correct: result.correct,
          missed: result.missed,
          falseFlags: result.falseFlags,
          hiddenTotal: result.hiddenTotal,
          namedCount: result.namedCount,
        },
        status: 'submitted',
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not record your submission.');
    } finally {
      setSaving(false);
    }
  };

  const handleRetry = () => {
    setSelected(new Set());
    setGraded(false);
    setSaveError(null);
  };

  // Per-signal verdict for the reveal: only graded signals get a status.
  const verdictOf = (id: string): 'correct' | 'missed' | 'falseFlag' | null => {
    if (!graded) return null;
    if (result.correct.includes(id)) return 'correct';
    if (result.missed.includes(id)) return 'missed';
    if (result.falseFlags.includes(id)) return 'falseFlag';
    return null; // visible decoy correctly left unflagged
  };

  return (
    <div className="bg-white border-2 border-nava-mint rounded-3xl p-8 shadow-sm space-y-8" id="dashboard-critique">
      <div className="flex items-center gap-3 border-b border-nava-mint pb-6">
        <div className="w-10 h-10 bg-nava-mint rounded-xl flex items-center justify-center text-nava-green">
          <Gauge className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold">Practice: Critique the dashboard</h3>
          <p className="text-xs text-gray-500">
            This dashboard looks great. Name the signals it quietly leaves out. This is graded
            practice — it doesn&apos;t affect your module completion.
          </p>
        </div>
      </div>

      {intro && <p className="text-sm text-gray-700 leading-relaxed">{intro}</p>}

      {/* The speed-only dashboard under review */}
      <div className="space-y-3">
        <div className="text-[11px] font-black uppercase tracking-widest text-gray-500">
          {dashboard.title}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {dashboard.metrics.map((m) => (
            <div key={m.label} className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                {m.label}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-black text-gray-800">{m.value}</span>
                {m.trend && <span className="text-sm font-bold text-nava-green">{m.trend}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Signal checklist */}
      <div className="space-y-4">
        <div className="text-[11px] font-black uppercase tracking-widest text-gray-500">
          Which signals does this dashboard hide? (select all that apply)
        </div>
        <div className="space-y-3" role="group" aria-label="Candidate signals">
          {signals.map((signal) => {
            const picked = selected.has(signal.id);
            const verdict = verdictOf(signal.id);
            return (
              <div
                key={signal.id}
                className={`rounded-2xl border-2 p-4 space-y-3 transition-colors ${
                  verdict === 'correct'
                    ? 'border-green-200 bg-green-50/40'
                    : verdict === 'missed'
                      ? 'border-red-200 bg-red-50/40'
                      : verdict === 'falseFlag'
                        ? 'border-amber-200 bg-amber-50/40'
                        : 'border-gray-100'
                }`}
              >
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={picked}
                    disabled={graded}
                    onChange={() => toggle(signal.id)}
                    aria-label={signal.label}
                    className="mt-1 w-4 h-4 accent-nava-green shrink-0"
                  />
                  <span className="text-sm font-medium text-gray-800 leading-relaxed">
                    {signal.label}
                  </span>
                </label>

                <AnimatePresence>
                  {verdict && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      role="status"
                      aria-live="polite"
                      className={`flex gap-3 rounded-xl p-4 ${
                        verdict === 'correct'
                          ? 'bg-green-100/60'
                          : verdict === 'missed'
                            ? 'bg-red-100/50'
                            : 'bg-amber-100/50'
                      }`}
                    >
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                          verdict === 'correct'
                            ? 'bg-green-200'
                            : verdict === 'missed'
                              ? 'bg-red-200'
                              : 'bg-amber-200'
                        }`}
                      >
                        {verdict === 'correct' ? (
                          <Check className="w-4 h-4 text-green-700" />
                        ) : verdict === 'missed' ? (
                          <X className="w-4 h-4 text-red-700" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-700" />
                        )}
                      </div>
                      <div className="space-y-1 text-xs leading-relaxed">
                        <p
                          className={`font-bold ${
                            verdict === 'correct'
                              ? 'text-green-800'
                              : verdict === 'missed'
                                ? 'text-red-800'
                                : 'text-amber-800'
                          }`}
                        >
                          {verdict === 'correct'
                            ? 'Hidden signal — you named it.'
                            : verdict === 'missed'
                              ? 'Hidden signal — you missed this one.'
                              : 'This is already on the dashboard — not a missing signal.'}
                        </p>
                        <p
                          className={
                            verdict === 'correct'
                              ? 'text-green-800'
                              : verdict === 'missed'
                                ? 'text-red-800'
                                : 'text-amber-800'
                          }
                        >
                          {signal.why}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

      {saveError && <p role="alert" className="text-xs text-red-600 font-medium">{saveError}</p>}

      {graded ? (
        <div className="flex items-center justify-between border-t border-gray-100 pt-6">
          <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm font-bold text-gray-700">
            <ShieldCheck className="w-5 h-5 text-nava-green" />
            You named {result.namedCount} of {result.hiddenTotal} hidden signals
          </div>
          <button
            onClick={handleRetry}
            className="px-6 py-2.5 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-black transition-all active:scale-95"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="flex justify-end border-t border-gray-100 pt-6">
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 px-10 py-3 bg-nava-green text-white rounded-xl font-bold shadow-lg shadow-nava-green/20 disabled:opacity-50 transition-all active:scale-95"
          >
            {saving ? (
              <>
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                  <Sparkles className="w-4 h-4" />
                </motion.div>
                Submitting…
              </>
            ) : (
              'Check my answer'
            )}
          </button>
        </div>
      )}
    </div>
  );
}

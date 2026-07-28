import { useState } from 'react';
import { motion } from 'motion/react';
import { Library, Plus, Trash2, ThumbsUp, ThumbsDown, Check, Eye, Sparkles } from 'lucide-react';
import type { UseCasePortfolioConfig } from '../../types';
import { useAuth } from '../../lib/auth';
import { recordLabSubmission } from '../../lib/progress';
import PiiNotice from '../PiiNotice';
import {
  evaluatePortfolioReadiness,
  isEntryComplete,
  type UseCaseEntry,
  type UseCaseVerdict,
} from './useCasePortfolio.ready';

interface Props {
  config: UseCasePortfolioConfig;
  labId: string;
}

const blankEntry = (): UseCaseEntry => ({ verdict: 'helps', task: '', approach: '', watch: '' });

// One verdict toggle (Helps / Doesn't help). Module-level so it isn't re-created
// each render, matching the sibling exercises' flat markup.
function VerdictButton({
  active,
  verdict,
  label,
  icon,
  disabled,
  onClick,
}: {
  active: boolean;
  verdict: UseCaseVerdict;
  label: string;
  icon: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
        active
          ? verdict === 'helps'
            ? 'border-nava-plum bg-nava-plum/10 text-nava-plum'
            : 'border-orange-400 bg-orange-50 text-orange-700'
          : 'border-gray-100 text-gray-500 hover:border-nava-plum/30'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// P4.8 / cell 2.11 — a personal AI use-case library + a 4D Diligence Statement.
// The learner logs where AI helps / doesn't (with the prompt that worked and the
// failure mode to watch), then writes one high-stakes Diligence Statement across
// Anthropic's 4D AI Fluency. This is graded PRACTICE that records a
// lab_submissions row but is NOT the completion gate (the inline quiz is) —
// structurally enforced by the absence of an onComplete prop. It is an exit
// artifact captured (not LLM-graded) behind a completeness gate.
export default function UseCasePortfolio({ config, labId }: Props) {
  const { user } = useAuth();
  const { intro, library, diligence } = config;

  const [entries, setEntries] = useState<UseCaseEntry[]>([blankEntry()]);
  const [statement, setStatement] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const readiness = evaluatePortfolioReadiness({ entries, statement }, config);
  const canSubmit = readiness.ready && !saving && !saved;

  const updateEntry = (i: number, patch: Partial<UseCaseEntry>) => {
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  };
  const addEntry = () => setEntries((prev) => [...prev, blankEntry()]);
  const removeEntry = (i: number) =>
    setEntries((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));

  const setDimension = (id: string, value: string) =>
    setStatement((prev) => ({ ...prev, [id]: value }));

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaveError(null);
    if (!user) {
      setSaveError('Sign in to save your portfolio so a Champion can review it.');
      return;
    }
    setSaving(true);
    try {
      await recordLabSubmission(user.id, {
        labId,
        transcript: {
          kind: 'use-case-portfolio',
          entries,
          statement,
          // Both counts are over COMPLETE entries, so helpsCount + doesntCount
          // equals completeEntries (a half-typed extra entry doesn't inflate it).
          helpsCount: entries.filter((e) => isEntryComplete(e) && e.verdict === 'helps').length,
          doesntCount: readiness.doesntCount,
          wordCount: readiness.statementWords,
        },
        status: 'submitted',
      });
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save your portfolio.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border-2 border-nava-plum/20 rounded-3xl p-8 shadow-sm space-y-8" id="use-case-portfolio">
      <div className="flex items-center gap-3 border-b border-nava-plum/20 pb-6">
        <div className="w-10 h-10 bg-nava-plum/10 rounded-xl flex items-center justify-center text-nava-plum">
          <Library className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold">{library.title}</h3>
          <p className="text-xs text-gray-500">
            Your portfolio for this module. It records a submission a Champion can review — it
            doesn&apos;t affect your module completion.
          </p>
        </div>
      </div>

      {intro && <p className="text-sm font-semibold text-gray-800 leading-relaxed">{intro}</p>}

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
            Portfolio saved
          </div>
          <p className="flex items-start gap-2 text-sm text-gray-600 leading-relaxed">
            <Eye className="w-4 h-4 text-nava-green shrink-0 mt-0.5" />
            <span>
              Recorded and ready for a Champion to review: {readiness.completeEntries} use-case{' '}
              {readiness.completeEntries === 1 ? 'entry' : 'entries'} (including{' '}
              {readiness.doesntCount} “Doesn’t help”) and a {readiness.statementWords}-word Diligence
              Statement.
            </span>
          </p>
        </motion.div>
      ) : (
        <>
          <PiiNotice />

          {/* Part 1 — the use-case library */}
          <div className="space-y-4">
            <p className="text-xs text-gray-500 leading-relaxed">{library.helper}</p>
            {entries.map((entry, i) => (
              <div key={i} className="rounded-2xl border-2 border-gray-100 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <VerdictButton
                      active={entry.verdict === 'helps'}
                      verdict="helps"
                      label="Helps"
                      icon={<ThumbsUp className="w-3.5 h-3.5" />}
                      disabled={saved}
                      onClick={() => updateEntry(i, { verdict: 'helps' })}
                    />
                    <VerdictButton
                      active={entry.verdict === 'doesnt'}
                      verdict="doesnt"
                      label="Doesn’t help"
                      icon={<ThumbsDown className="w-3.5 h-3.5" />}
                      disabled={saved}
                      onClick={() => updateEntry(i, { verdict: 'doesnt' })}
                    />
                  </div>
                  {entries.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeEntry(i)}
                      aria-label={`Remove use-case entry ${i + 1}`}
                      className="text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <input
                  value={entry.task}
                  onChange={(e) => updateEntry(i, { task: e.target.value })}
                  aria-label={`Use case ${i + 1}: the task`}
                  placeholder={library.taskPlaceholder}
                  className="w-full rounded-xl border-2 border-gray-100 focus:border-nava-plum focus:outline-none p-3 text-sm text-gray-700 transition-colors"
                />
                <textarea
                  value={entry.approach}
                  onChange={(e) => updateEntry(i, { approach: e.target.value })}
                  rows={2}
                  aria-label={`Use case ${i + 1}: the prompt or approach`}
                  placeholder={library.approachPlaceholder}
                  className="w-full rounded-xl border-2 border-gray-100 focus:border-nava-plum focus:outline-none p-3 text-sm text-gray-700 leading-relaxed resize-y transition-colors"
                />
                <textarea
                  value={entry.watch}
                  onChange={(e) => updateEntry(i, { watch: e.target.value })}
                  rows={2}
                  aria-label={`Use case ${i + 1}: the failure mode to watch`}
                  placeholder={library.watchPlaceholder}
                  className="w-full rounded-xl border-2 border-gray-100 focus:border-nava-plum focus:outline-none p-3 text-sm text-gray-700 leading-relaxed resize-y transition-colors"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={addEntry}
              disabled={saved}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-dashed border-gray-200 text-sm font-semibold text-gray-600 hover:border-nava-green hover:text-nava-green transition-all"
            >
              <Plus className="w-4 h-4" />
              Add a use case
            </button>
          </div>

          {/* Part 2 — the 4D Diligence Statement */}
          <div className="space-y-4 border-t border-gray-100 pt-6">
            <div>
              <h4 className="font-bold text-gray-800">{diligence.title}</h4>
              <p className="text-xs text-gray-500 leading-relaxed mt-1">{diligence.helper}</p>
            </div>
            {diligence.dimensions.map((d) => (
              <div key={d.id} className="space-y-1.5">
                <label htmlFor={`diligence-${d.id}`} className="block text-sm font-semibold text-gray-800">
                  {d.label}
                </label>
                <p className="text-xs text-gray-500 leading-relaxed">{d.prompt}</p>
                <textarea
                  id={`diligence-${d.id}`}
                  value={statement[d.id] ?? ''}
                  onChange={(e) => setDimension(d.id, e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border-2 border-gray-100 focus:border-nava-plum focus:outline-none p-3 text-sm text-gray-700 leading-relaxed resize-y transition-colors"
                />
              </div>
            ))}
          </div>

          {saveError && <p role="alert" className="text-xs text-red-600 font-medium">{saveError}</p>}

          {/* What's left before the portfolio can be submitted (announced). */}
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
            <span className={`text-xs font-semibold ${readiness.statementWords >= diligence.targetWords ? 'text-nava-green' : 'text-gray-500'}`}>
              Statement: {readiness.statementWords} / {diligence.targetWords} words
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
                  <Library className="w-4 h-4" />
                  Save portfolio
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

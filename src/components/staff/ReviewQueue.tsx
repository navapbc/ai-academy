import { useState } from 'react';
import { ArrowLeft, Loader2, AlertTriangle, ClipboardCheck, ChevronRight, Check, Undo2 } from 'lucide-react';
import { useReviewQueue } from '../../lib/useReviewQueue';
import { summarizeSubmission, type ReviewQueueItem } from '../../lib/reviewQueue';
import { approveSubmission, returnSubmission } from '../../lib/reviewGrade';
import GradeResultCard from '../GradeResultCard';

// Champion/admin review queue (P5.5b). Lists reviewable submissions (RLS-scoped by
// P5.1c) and opens one to read the learner's submission + the LLM verdict
// (GradeResultCard). Read-only — the champion grade action is P5.5c. In-page
// list↔detail, no new top-level View.

function score(item: ReviewQueueItem): string | null {
  return item.rubricScores ? `${item.rubricScores.overall}/${item.rubricScores.maxOverall}` : null;
}

function ReviewDetail({
  item,
  onBack,
  onResolved,
}: {
  item: ReviewQueueItem;
  onBack: () => void;
  /** Called after a successful approve/return so the parent reloads + leaves detail. */
  onResolved: () => void;
}) {
  const fields = summarizeSubmission(item.transcript);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const run = (fn: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    fn()
      .then(() => onResolved())
      .catch((err: unknown) => {
        console.error('[ReviewQueue] decision failed', err);
        setActionError(err instanceof Error ? err.message : 'The decision could not be recorded.');
        setBusy(false);
      });
  };

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-nava-green hover:text-nava-plum transition-colors"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Back to queue
      </button>

      <header className="space-y-1">
        <h2 className="text-xl font-bold text-gray-900" tabIndex={-1}>
          {item.learnerName}
        </h2>
        <p className="text-sm text-gray-500">
          Lab <span className="font-mono">{item.labId}</span> ·{' '}
          {new Date(item.createdAt).toLocaleString()}
        </p>
      </header>

      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500">Submission</h3>
        {fields.map((f, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
              {f.label}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">
              {f.value || <span className="text-gray-400">(empty)</span>}
            </p>
          </div>
        ))}
      </section>

      {item.rubricScores && (
        <section className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500">
            LLM verdict {item.grader ? `(${item.grader})` : ''}
          </h3>
          <GradeResultCard result={item.rubricScores} />
        </section>
      )}

      {/* Decision (P5.5c): approve, or return with feedback. Score is not edited. */}
      <section className="space-y-3 border-t border-gray-200 pt-5">
        <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500">Your decision</h3>
        <label className="sr-only" htmlFor="review-note">
          Feedback note
        </label>
        <textarea
          id="review-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Feedback for the learner (required to return; optional to approve)"
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
        />
        {actionError && (
          <div className="flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3" role="alert">
            <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0" aria-hidden="true" />
            <span className="text-sm text-gray-700">{actionError}</span>
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => approveSubmission(item.submissionId, note.trim() || undefined))}
            className="inline-flex items-center gap-1.5 rounded-xl bg-nava-green px-5 py-2 text-sm font-bold text-white hover:bg-nava-green/90 disabled:opacity-40"
          >
            <Check className="w-4 h-4" aria-hidden="true" />
            Approve
          </button>
          <button
            type="button"
            disabled={busy || note.trim() === ''}
            title={note.trim() === '' ? 'Add a feedback note to return' : undefined}
            onClick={() => run(() => returnSubmission(item.submissionId, note.trim()))}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 px-5 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            <Undo2 className="w-4 h-4" aria-hidden="true" />
            Return for revision
          </button>
        </div>
      </section>
    </div>
  );
}

export default function ReviewQueue({ onBack }: { onBack: () => void }) {
  const { queue, loading, error, reload } = useReviewQueue();
  const [selected, setSelected] = useState<ReviewQueueItem | null>(null);

  if (selected) {
    return (
      <ReviewDetail
        item={selected}
        onBack={() => setSelected(null)}
        onResolved={() => {
          // The submission is no longer 'reviewable' — leave detail and refresh.
          setSelected(null);
          reload();
        }}
      />
    );
  }

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
        <span className="text-[11px] font-bold uppercase tracking-widest text-nava-green">Review</span>
        <h1 className="text-2xl font-bold text-gray-900" tabIndex={-1}>
          Review queue
        </h1>
        <p className="text-sm text-gray-600">
          Learner lab submissions awaiting review, scoped to the cohorts you can see.
        </p>
      </header>

      {loading && (
        <div className="flex items-center justify-center py-12" role="status">
          <Loader2 className="w-6 h-6 text-nava-green animate-spin" aria-hidden="true" />
          <span className="sr-only">Loading the review queue…</span>
        </div>
      )}

      {error && !loading && (
        <div className="max-w-md text-center space-y-3 py-8 mx-auto" role="alert">
          <AlertTriangle className="w-8 h-8 text-orange-500 mx-auto" aria-hidden="true" />
          <p className="text-sm text-gray-700">{error}</p>
          <button
            onClick={reload}
            className="px-5 py-2 bg-nava-green hover:bg-nava-green/90 text-white rounded-xl font-bold transition-all"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && queue.length === 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-5 text-gray-600">
          <ClipboardCheck className="w-5 h-5 text-nava-green shrink-0" aria-hidden="true" />
          <p className="text-sm">No submissions awaiting review right now.</p>
        </div>
      )}

      {!loading && !error && queue.length > 0 && (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {queue.map((item) => (
            <li key={item.submissionId}>
              <button
                onClick={() => setSelected(item)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-gray-900">{item.learnerName}</span>
                  <span className="block text-xs text-gray-500">
                    Lab <span className="font-mono">{item.labId}</span> ·{' '}
                    {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3 text-sm text-gray-500">
                  {score(item) && <span className="tabular-nums">{score(item)}</span>}
                  <ChevronRight className="w-4 h-4 text-gray-400" aria-hidden="true" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { Loader2, AlertTriangle, Gauge, ListChecks, BookOpen, ShieldCheck } from 'lucide-react';
import { useLearnerPortfolio } from '../../lib/useLearnerPortfolio';
import type {
  PairedCalibrationArtifact,
  ConfidenceCalibrationArtifact,
  FailureLogArtifact,
  UseCasePortfolioArtifact,
} from '../../lib/learnerPortfolio';

// Learner portfolio panels (P5.3b): the calibration number (2.15) + the three
// portfolio instruments (2.8 / 2.9 / 2.11) read back from the learner's own
// lab_submissions (owner RLS). Read-only display; each panel has a friendly empty
// state so a learner who hasn't done the lab yet sees where it will appear.

const CARD = 'rounded-xl border border-gray-200 bg-white p-5 space-y-3';
const PANEL_TITLE = 'flex items-center gap-2 text-base font-bold text-gray-900';

function PanelHeader({ icon: Icon, title }: { icon: typeof Gauge; title: string }) {
  return (
    <h3 className={PANEL_TITLE}>
      <Icon className="w-4 h-4 text-nava-plum shrink-0" aria-hidden="true" />
      {title}
    </h3>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-500">{children}</p>;
}

// --- 2.15 calibration number ----------------------------------------------

function CalibrationPanel({ data }: { data: PairedCalibrationArtifact | null }) {
  return (
    <div className={CARD}>
      <PanelHeader icon={Gauge} title="Time calibration (2.15)" />
      {data === null ? (
        <EmptyNote>Complete the 2.15 paired AI-on / AI-off lab to see your calibration number here.</EmptyNote>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-gray-900 tabular-nums">{data.gapPct}</span>
            <span className="text-sm text-gray-500">point gap</span>
          </div>
          <p className="text-sm text-gray-600">
            You estimated AI would save{' '}
            <span className="font-semibold tabular-nums">{data.estimatePct}%</span>; the actual
            speed-up was{' '}
            <span className="font-semibold tabular-nums">{data.actualSpeedupPct}%</span>. A smaller
            gap means your sense of AI's time savings is better calibrated.
          </p>
          <p className="text-xs text-gray-500">
            Defects — AI-off: <span className="tabular-nums">{data.offDefects}</span> · AI-on:{' '}
            <span className="tabular-nums">{data.onDefects}</span>
          </p>
        </>
      )}
    </div>
  );
}

// --- 2.8 confidence calibration -------------------------------------------

function ConfidencePanel({ data }: { data: ConfidenceCalibrationArtifact | null }) {
  return (
    <div className={CARD}>
      <PanelHeader icon={ShieldCheck} title="Verification calibration (2.8)" />
      {data === null ? (
        <EmptyNote>Complete the 2.8 confidence-calibration lab to see your over/under-reliance summary here.</EmptyNote>
      ) : (
        <>
          <p className="text-sm text-gray-600">
            You matched the right verification posture on{' '}
            <span className="font-semibold tabular-nums">{data.score}</span> of{' '}
            <span className="font-semibold tabular-nums">{data.maxScore}</span> outputs.
          </p>
          <ul className="grid grid-cols-3 gap-2 text-center">
            <li className="rounded-lg bg-nava-plum/10 px-2 py-2">
              <div className="text-lg font-bold text-nava-plum tabular-nums">{data.calibrated}</div>
              <div className="text-[11px] font-semibold text-gray-600">Calibrated</div>
            </li>
            <li className="rounded-lg bg-amber-100 px-2 py-2">
              <div className="text-lg font-bold text-amber-800 tabular-nums">{data.over}</div>
              <div className="text-[11px] font-semibold text-gray-600">Over-relied</div>
            </li>
            <li className="rounded-lg bg-red-100 px-2 py-2">
              <div className="text-lg font-bold text-red-700 tabular-nums">{data.under}</div>
              <div className="text-[11px] font-semibold text-gray-600">Under-relied</div>
            </li>
          </ul>
        </>
      )}
    </div>
  );
}

// --- 2.9 failure-mode log -------------------------------------------------

function FailureLogPanel({ data }: { data: FailureLogArtifact | null }) {
  return (
    <div className={CARD}>
      <PanelHeader icon={ListChecks} title="Failure-mode log (2.9)" />
      {data === null || data.entries.length === 0 ? (
        <EmptyNote>Log AI failures you catch in the 2.9 lab and they’ll appear here as your record.</EmptyNote>
      ) : (
        <>
          <p className="text-sm text-gray-600">
            <span className="font-semibold tabular-nums">{data.entryCount}</span>{' '}
            {data.entryCount === 1 ? 'entry' : 'entries'} logged.
          </p>
          <ul className="space-y-3">
            {data.entries.map((e, i) => (
              <li key={i} className="rounded-lg border border-gray-100 bg-gray-50/50 p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm text-gray-900">{e.task || 'Untitled task'}</span>
                  {e.date && <span className="text-xs text-gray-500 tabular-nums shrink-0">{e.date}</span>}
                </div>
                {e.error && <p className="text-sm text-gray-700"><span className="font-medium">What went wrong:</span> {e.error}</p>}
                {e.caught && <p className="text-sm text-gray-700"><span className="font-medium">How I caught it:</span> {e.caught}</p>}
                {e.tell && <p className="text-sm text-gray-700"><span className="font-medium">The tell:</span> {e.tell}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// --- 2.11 use-case portfolio + 4D Diligence Statement ---------------------

// The 4D dimension ids are lowercase in the saved statement; map to display labels
// (title-case fallback for any unexpected id).
const DIMENSION_LABELS: Record<string, string> = {
  delegation: 'Delegation',
  description: 'Description',
  discernment: 'Discernment',
  diligence: 'Diligence',
};
function dimensionLabel(id: string): string {
  return DIMENSION_LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

function UseCasePortfolioPanel({ data }: { data: UseCasePortfolioArtifact | null }) {
  const statementEntries = data
    ? Object.entries(data.statement).filter(([, text]) => text.trim() !== '')
    : [];
  return (
    <div className={CARD}>
      <PanelHeader icon={BookOpen} title="Use-case portfolio (2.11)" />
      {data === null ? (
        <EmptyNote>Build your use-case library and 4D Diligence Statement in the 2.11 lab to see them here.</EmptyNote>
      ) : (
        <>
          {data.entries.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
                Use-case library ({data.helpsCount} helps · {data.doesntCount} doesn’t)
              </p>
              <ul className="space-y-2">
                {data.entries.map((e, i) => (
                  <li key={i} className="rounded-lg border border-gray-100 bg-gray-50/50 p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          e.verdict === 'helps'
                            ? 'bg-nava-plum/15 text-nava-plum'
                            : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {e.verdict === 'helps' ? 'Helps' : 'Doesn’t help'}
                      </span>
                      <span className="font-semibold text-sm text-gray-900">{e.task || 'Untitled use case'}</span>
                    </div>
                    {e.approach && <p className="text-sm text-gray-700"><span className="font-medium">Approach:</span> {e.approach}</p>}
                    {e.watch && <p className="text-sm text-gray-700"><span className="font-medium">Watch for:</span> {e.watch}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {statementEntries.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
                Diligence Statement ({data.wordCount} words)
              </p>
              <dl className="space-y-2">
                {statementEntries.map(([id, text]) => (
                  <div key={id} className="rounded-lg border border-gray-100 bg-gray-50/50 p-3">
                    <dt className="text-sm font-bold text-nava-plum">{dimensionLabel(id)}</dt>
                    <dd className="text-sm text-gray-700">{text}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {data.entries.length === 0 && statementEntries.length === 0 && (
            <EmptyNote>Your 2.11 submission has no library entries or statement yet.</EmptyNote>
          )}
        </>
      )}
    </div>
  );
}

export default function LearnerPortfolio({ userId }: { userId: string }) {
  const { portfolio, loading, error, reload } = useLearnerPortfolio(userId);

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Your portfolio &amp; calibration</h2>
      <p className="text-sm text-gray-600">
        The artifacts you build in the practice labs — your calibration numbers and
        portfolio. These are yours to keep and reuse.
      </p>

      {loading && (
        <div className="flex items-center justify-center py-8" role="status">
          <Loader2 className="w-5 h-5 text-nava-plum animate-spin" aria-hidden="true" />
          <span className="sr-only">Loading your portfolio…</span>
        </div>
      )}

      {error && !loading && (
        <div className="flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3" role="alert">
          <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0" aria-hidden="true" />
          <span className="text-sm text-gray-700">{error}</span>
          <button
            onClick={reload}
            className="ml-auto text-sm font-bold text-nava-plum hover:text-nava-plum shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {portfolio && !loading && !error && (
        <div className="grid gap-4 lg:grid-cols-2">
          <CalibrationPanel data={portfolio.pairedCalibration} />
          <ConfidencePanel data={portfolio.confidenceCalibration} />
          <FailureLogPanel data={portfolio.failureLog} />
          <UseCasePortfolioPanel data={portfolio.useCasePortfolio} />
        </div>
      )}
    </section>
  );
}

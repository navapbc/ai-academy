import type { GradeResult } from '../lib/grading';

interface Props {
  result: GradeResult;
}

// The anchor-scored result card shared by the prompt-construction lab (P4.2) and
// the critique exercise (P4.3b). LLM grades are provisional (status='reviewable')
// pending champion review (P5.1). Presentational only — `id="grade-result"` and
// `role="status"`/`aria-live` are kept so existing assertions and the A11Y
// announcement behave exactly as before the extraction.
export default function GradeResultCard({ result }: Props) {
  return (
    <div
      className="bg-nava-mint/30 border-2 border-nava-mint rounded-2xl p-6 space-y-4"
      id="grade-result"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-nava-plum">Anchor-scored feedback</h4>
        <span className="text-sm font-bold text-gray-700">
          {result.overall} / {result.maxOverall}
        </span>
      </div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-nava-plum/70">
        Provisional — pending review
      </p>
      <ul className="space-y-3">
        {result.perAnchor.map((a) => (
          <li key={a.id} className="text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-gray-800">{a.label}</span>
              <span className="text-xs font-bold text-gray-600">{a.score}/{a.max}</span>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">{a.rationale}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

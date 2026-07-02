import { ShieldAlert } from 'lucide-react';

interface PiiNoticeProps {
  /** Optional placement/spacing tweaks; the base styling is self-contained. */
  className?: string;
}

/**
 * Shared PII-reminder notice (P6.3). A small, presentational, accessible block
 * shown at every learner free-text surface whose content reaches Claude — a
 * warn-and-teach reminder only: no scanning, no blocking, no acknowledgment gate,
 * no effect on the model-call path. The copy lives here as the single source of
 * truth so every surface stays consistent; P6.6 reuses this on the
 * submission/reflection surfaces unchanged.
 */
export default function PiiNotice({ className }: PiiNoticeProps) {
  return (
    <div
      role="note"
      aria-label="Data privacy reminder"
      className={`flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-900${
        className ? ` ${className}` : ''
      }`}
    >
      <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" aria-hidden="true" />
      <p>
        <span className="font-bold">Reminder:</span> don&apos;t paste real client or
        constituent data (names, SSNs, case numbers, addresses) into AI prompts. Use
        fake or sample data — protecting real data is part of using AI responsibly.
      </p>
    </div>
  );
}

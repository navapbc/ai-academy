interface Props {
  /** The reassurance note (e.g. "…your work is saved"). */
  note: string;
  /** Re-grades the already-saved submission (audit D-17). */
  onRetry: () => void;
}

// The non-blocking grading-failure note shared by the five judge-graded labs.
// Pairs the reassurance with a "Try grading again" affordance so a transient
// judge/network failure is recoverable in place — no redo of the lab (audit
// D-17). Lives in one role="status" live region (the four exercises already had
// this; Lab now matches), and the button carries a visible focus ring.
export default function GradeError({ note, onRetry }: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="text-xs text-gray-500 flex flex-wrap items-center gap-x-2 gap-y-1"
    >
      <span>{note}</span>
      <button
        type="button"
        onClick={onRetry}
        className="font-semibold text-nava-green underline underline-offset-2 hover:text-nava-plum rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-nava-green"
      >
        Try grading again
      </button>
    </div>
  );
}

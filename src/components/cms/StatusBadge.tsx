import type { ModuleStatus } from '../../types';

// Small status pill shared by the CMS list + detail (P5.4-2). Mirrors the editorial
// states on modules.status, plus an archived overlay for soft-deleted lessons.

const STATUS_STYLE: Record<ModuleStatus, { label: string; className: string }> = {
  published: { label: 'Published', className: 'text-green-700 bg-green-100' },
  in_review: { label: 'In review', className: 'text-amber-700 bg-amber-100' },
  draft: { label: 'Draft', className: 'text-gray-600 bg-gray-100' },
};

export function StatusBadge({
  status,
  archived,
}: {
  status: ModuleStatus;
  archived?: boolean;
}) {
  if (archived) {
    return (
      <span className="text-[10px] font-bold uppercase tracking-wide text-red-700 bg-red-100 rounded-full px-2 py-0.5">
        Archived
      </span>
    );
  }
  const { label, className } = STATUS_STYLE[status];
  return (
    <span
      className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${className}`}
    >
      {label}
    </span>
  );
}
